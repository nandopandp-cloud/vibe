"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { usePlayer } from "./PlayerProvider";
import {
  addToJamQueue,
  jumpJamToTrack,
  leaveCurrentJam,
  moveJamTrackNext,
  pollJam,
  removeFromJam,
  reorderJamQueue,
  reportJamPlayback,
  setJamQueue,
} from "@/lib/jam-actions";
import type { HydratedTrack, JamSnapshot } from "@/lib/types";

/**
 * A sincronia do jam.
 *
 * Duas metades que nunca rodam na mesma pessoa:
 *
 * - No host, um efeito observa o player e **reporta** ao servidor onde a
 *   música está, junto do instante em que aquilo era verdade.
 * - No convidado, o polling traz esse par e o player **obedece**: troca
 *   de faixa quando a faixa mudou, e só corrige o tempo quando a deriva
 *   passa de um limite audível.
 *
 * O limite é o detalhe que decide se a coisa soa bem. Corrigir sempre
 * faria o áudio picotar a cada batida do polling; nunca corrigir deixaria
 * as pessoas minutos afastadas depois de meia hora. `DRIFT_TOLERANCE`
 * fica no meio: alto o bastante para a latência da rede caber dentro,
 * baixo o bastante para ninguém perceber que está atrás.
 */

/** Quanto o convidado pode estar fora de hora antes de o player pular. */
const DRIFT_TOLERANCE = 1.75;
/** De quanto em quanto tempo o convidado pergunta o estado ao servidor. */
const POLL_INTERVAL = 3000;
/** De quanto em quanto tempo o host conta onde está. */
const REPORT_INTERVAL = 4000;

type JamApi = {
  jam: JamSnapshot | null;
  /** `true` quando há jam e você é quem comanda. */
  isHost: boolean;
  /** Enfileira no jam — qualquer participante pode. */
  addTrack: (track: HydratedTrack) => Promise<string>;
  /** Puxa uma faixa da fila para logo depois da atual. */
  playNext: (track: HydratedTrack) => Promise<string>;
  /** Pula direto para uma faixa da fila — só o host. */
  jumpTo: (track: HydratedTrack) => Promise<string>;
  /** Tira uma faixa da fila — qualquer participante. */
  removeTrack: (track: HydratedTrack) => Promise<string>;
  /** Reordena a fila inteira — qualquer participante. */
  reorder: (trackIds: string[]) => Promise<string>;
  /** Sai do jam (encerra, se você for o host). */
  leave: () => Promise<void>;
  /** Força uma leitura agora, sem esperar o próximo polling. */
  sync: (force?: boolean) => void;
  /**
   * Entra numa sala que uma action já devolveu pronta.
   *
   * É o caminho de "aceitar convite" e de "iniciar jam": a escrita volta
   * com o snapshot, e adotá-lo aqui troca a sala na hora. Antes isto era
   * um `router.refresh()`, que refazia a árvore inteira do layout — e o
   * jam só aparecia depois de o catálogo, as playlists e a presença
   * terem sido lidos de novo, sem nenhum deles ter mudado.
   */
  adopt: (snapshot: JamSnapshot | null) => void;
};

const OUTSIDE = "Você não está num jam.";

const Ctx = createContext<JamApi>({
  jam: null,
  isHost: false,
  addTrack: async () => OUTSIDE,
  playNext: async () => OUTSIDE,
  jumpTo: async () => OUTSIDE,
  removeTrack: async () => OUTSIDE,
  reorder: async () => OUTSIDE,
  leave: async () => {},
  sync: () => {},
  adopt: () => {},
});

export function useJam() {
  return useContext(Ctx);
}

export function JamProvider({
  initialJam,
  children,
}: {
  initialJam: JamSnapshot | null;
  children: React.ReactNode;
}) {
  const player = usePlayer();
  const router = useRouter();
  const [jam, setJam] = useState<JamSnapshot | null>(initialJam);

  /**
   * O servidor manda o jam a cada navegação, e às vezes ele é a novidade:
   * é assim que uma sala aberta noutra aba chega até aqui. Entrar por um
   * convite não passa por este caminho — a action devolve o snapshot e
   * `adopt` o aplica na hora, sem refazer a árvore do layout.
   *
   * A troca só acontece quando o *jam* muda de identidade — entrar num,
   * sair de um. Dentro do mesmo jam quem manda é o polling, que tem o
   * relógio mais novo; aceitar o snapshot do render aqui faria a posição
   * do host voltar no tempo a cada navegação do convidado.
   */
  const serverJamId = initialJam?.id ?? null;
  const [syncedWith, setSyncedWith] = useState(serverJamId);
  if (serverJamId !== syncedWith) {
    setSyncedWith(serverJamId);
    setJam(initialJam);
  }

  /**
   * A fila que a pessoa acabou de pedir, antes de o servidor confirmar.
   *
   * Sem isto cada clique na fila custava uma ida e volta inteira antes
   * de a tela mexer — e como o polling e a ação disputavam o mesmo
   * `pollingRef`, às vezes custava duas. A previsão é local, some assim
   * que a leitura verdadeira chega, e é a única coisa que a UI mostra
   * nesse intervalo.
   */
  const [pending, setPending] = useState<HydratedTrack[] | null>(null);

  const jamId = jam?.id ?? null;
  const isHost = Boolean(jam?.isHost);

  /**
   * O que a UI enxerga: o snapshot do servidor, com a fila trocada pela
   * previsão enquanto ela durar. O resto do snapshot (índice, relógio,
   * participantes) continua sendo o do servidor — só a *ordem* das
   * faixas é que se adianta.
   */
  const view = useMemo(() => {
    if (!jam || !pending) return jam;
    return {
      ...jam,
      queue: pending,
      // O índice segue quem está tocando, não o número antigo: a
      // previsão pode ter tirado faixas de antes dela.
      index: (() => {
        const playingId = jam.queue[Math.max(jam.index, 0)]?.id;
        const at = pending.findIndex((t) => t.id === playingId);
        return at >= 0 ? at : jam.index;
      })(),
    };
    // Sem o memo o objeto era novo a cada render enquanto houvesse uma
    // previsão de fila no ar, e levava junto o valor do contexto — que
    // então re-renderizava todo consumidor de `useJam` de graça.
  }, [jam, pending]);

  /** Última revisão de fila já aplicada no player do convidado. */
  const appliedRevision = useRef<string | null>(null);
  /** Evita dois pollings concorrentes quando a rede está lenta. */
  const pollingRef = useRef(false);
  /** Último carimbo de fila local que o host já mandou ao servidor. */
  const publishedStamp = useRef(player.queueStamp);
  /** Uma publicação de fila em voo — o relógio espera ela acabar. */
  const publishingRef = useRef(false);
  /**
   * A próxima mexida local na fila veio de uma ação que já escreveu no
   * servidor: adotar o carimbo em vez de publicar de novo.
   */
  const adoptNextStamp = useRef(false);

  // O reporte lê o player a cada batida, mas não deve reagendar o
  // intervalo a cada tique de `time` — a ref segura o valor mais novo
  // sem fazer o efeito depender dele.
  const playerRef = useRef(player);
  useEffect(() => {
    playerRef.current = player;
  });

  /* ---------------- leitura do estado (todos) ---------------- */

  /**
   * Lê o estado da sala.
   *
   * `force` existe porque o polling de fundo e uma ação do usuário
   * querem coisas diferentes do mesmo `pollingRef`: a batida de três em
   * três segundos pode ser pulada sem prejuízo quando já há uma leitura
   * no ar, mas a leitura que confirma um clique, não — pulá-la deixava
   * a pessoa esperando o ciclo seguinte, e era daí que vinha boa parte
   * da lentidão que se sentia na fila.
   */
  const sync = useCallback(
    (force = false) => {
      if (!jamId) return;
      if (pollingRef.current && !force) return;
      pollingRef.current = true;
      void pollJam(jamId)
        .then((next) => {
          // `null` é o servidor dizendo que você não está mais na sala:
          // o host encerrou, ou alguém entrou com esta conta noutro lugar.
          if (!next || next.ended) {
            setJam(null);
            setPending(null);
            appliedRevision.current = null;
            router.refresh();
            return;
          }
          setJam(next);
          // A previsão cumpriu o papel: o servidor já conta a mesma
          // história, e mantê-la só arriscaria mascarar a próxima.
          setPending(null);
        })
        .catch(() => {})
        .finally(() => {
          pollingRef.current = false;
        });
    },
    [jamId, router],
  );

  useEffect(() => {
    if (!jamId) return;
    const id = setInterval(sync, POLL_INTERVAL);
    // Voltar para a aba depois de um tempo fora merece uma leitura já:
    // o navegador estrangula os timers em segundo plano, e sem isto a
    // pessoa veria a sala congelada por alguns segundos ao voltar.
    const onVisible = () => document.visibilityState === "visible" && sync();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [jamId, sync]);

  /* ---------------- host: reporta o relógio ---------------- */

  useEffect(() => {
    if (!jamId || !isHost) return;

    const report = () => {
      const p = playerRef.current;
      // Enquanto a fila nova ainda está sendo publicada, o relógio cala:
      // o índice local se refere a uma fila que o servidor ainda não tem.
      if (publishingRef.current) return;
      void reportJamPlayback({
        jamId,
        index: p.index,
        position: p.time,
        playing: p.playing,
        trackId: p.current?.id,
      });
    };

    report(); // conta a mudança na hora, sem esperar o intervalo
    const id = setInterval(report, REPORT_INTERVAL);
    return () => clearInterval(id);
    // Play/pause e troca de faixa reportam imediatamente por estarem nas
    // deps; a posição dentro da faixa vai no intervalo, que basta para
    // ela e não inunda o servidor a cada quadro.
  }, [jamId, isHost, player.playing, player.index, player.current?.id]);

  /**
   * A fila do host é a fila do jam.
   *
   * Dois casos, e eles pedem coisas diferentes:
   *
   * - O player do host está vazio — ele recarregou a página, ou voltou
   *   noutro aparelho. Aí a fila do jam é *adotada* inteira, na faixa em
   *   que a sala parou. Sem isto o anfitrião voltaria para um player
   *   mudo enquanto os convidados continuam esperando o relógio dele.
   * - O player já está tocando e a fila da sala mudou: o host adota a
   *   ordem nova mantendo a faixa atual no ar.
   *
   * Este segundo caso já foi só um `enqueue` do que faltava, e era daí
   * que vinha a faixa que voltava depois de removida: acrescentar sabe
   * somar mas não sabe subtrair, então o que o host tirava da sala
   * continuava no player dele e era republicado logo atrás, desfazendo a
   * remoção. Comparar as duas filas inteiras resolve os dois sentidos.
   */
  useEffect(() => {
    if (!jam || !isHost) return;
    if (appliedRevision.current === jam.revision) return;
    // Uma publicação em voo torna a revisão que acabou de chegar velha
    // por definição: ela descreve a fila de antes do clique do host.
    if (publishingRef.current) return;
    appliedRevision.current = jam.revision;

    const p = playerRef.current;
    if (jam.queue.length === 0) return;

    if (!p.current) {
      // `adoptQueue` não carimba: a fila veio de fora, e republicá-la
      // seria uma volta inútil.
      p.adoptQueue(jam.queue, Math.max(jam.index, 0));
      return;
    }

    const localIds = p.queue.map((t) => t.id);
    const serverIds = jam.queue.map((t) => t.id);
    const same =
      localIds.length === serverIds.length &&
      localIds.every((id, i) => id === serverIds[i]);
    if (same) return;

    // A faixa que toca manda: adotar a fila nova não pode cortar o áudio
    // do host no meio. Quando ela sumiu da sala (removida por ele
    // mesmo), o índice do servidor é o melhor palpite do que vem agora.
    const playingId = p.current.id;
    const at = jam.queue.findIndex((t) => t.id === playingId);
    p.adoptQueue(jam.queue, at >= 0 ? at : Math.max(jam.index, 0));
  }, [jam, isHost]);

  /* ---------------- host: publica a fila ---------------- */

  /**
   * O outro sentido da mesma ponte.
   *
   * Sem isto, o host clicar noutra música durante o jam trocava só o
   * player dele: a fila do servidor continuava a antiga, e o índice que
   * o relógio reportava logo em seguida apontava para uma faixa
   * qualquer dentro dela — a sala inteira pulava para algo que ninguém
   * tinha escolhido, e o host não conseguia levar os outros com ele.
   *
   * O gatilho é o carimbo do player, e não o conteúdo da fila: só as
   * mexidas que nasceram nesta tela sobem, e o que desceu do servidor
   * não volta.
   */
  const localStamp = player.queueStamp;
  useEffect(() => {
    if (!jamId || !isHost) return;
    if (publishedStamp.current === localStamp) return;
    if (publishingRef.current) return;

    if (adoptNextStamp.current) {
      adoptNextStamp.current = false;
      publishedStamp.current = localStamp;
      return;
    }

    const p = playerRef.current;
    if (p.queue.length === 0 || !p.current) return;

    publishedStamp.current = localStamp;
    publishingRef.current = true;

    void setJamQueue({
      jamId,
      trackIds: p.queue.map((t) => t.id),
      index: Math.max(p.index, 0),
      position: p.time,
      playing: p.playing,
    })
      .catch(() => {})
      .finally(() => {
        publishingRef.current = false;
        // A revisão que voltar agora é a nossa própria: aceitá-la sem
        // reinstalar nada mantém o host onde ele já está.
        sync();
      });
  }, [jamId, isHost, localStamp, sync]);

  /* ---------------- convidado: obedece o relógio ---------------- */

  useEffect(() => {
    if (!jam || isHost) return;

    const p = playerRef.current;
    // Fila vazia ou host ainda sem tocar nada: não há o que seguir, e
    // adotar uma fila vazia só apagaria o que o convidado já ouvia.
    const target = jam.index >= 0 ? (jam.queue[jam.index] ?? null) : null;
    if (!target) {
      appliedRevision.current = jam.revision;
      return;
    }

    // A fila mudou no servidor, ou o host pulou de faixa: nos dois casos
    // o convidado reinstala a fila do jam apontando para onde o host está.
    if (
      appliedRevision.current !== jam.revision ||
      p.current?.id !== target.id
    ) {
      appliedRevision.current = jam.revision;
      p.adoptQueue(jam.queue, jam.index);
    }

    // Onde a música *deveria* estar agora: a posição que o host mediu,
    // mais o tempo decorrido desde a medição. É esta soma que absorve a
    // latência — um pacote atrasado continua descrevendo a verdade.
    const elapsed = jam.playing ? (Date.now() - jam.positionAt) / 1000 : 0;
    const expected = jam.position + elapsed;
    const drift = Math.abs(p.time - expected);

    if (drift > DRIFT_TOLERANCE) p.seek(Math.max(expected, 0));
    if (jam.playing !== p.playing) p.setPlaying(jam.playing);
  }, [jam, isHost]);

  /**
   * O convidado não comanda nada, então o player dele fica em modo
   * seguidor: sem autoplay ao fim da fila, sem pular sozinho quando uma
   * faixa termina — quem decide o que vem depois é o host.
   */
  const setFollower = player.setFollower;
  useEffect(() => {
    const following = Boolean(jamId) && !isHost;
    setFollower(following);
    return () => setFollower(false);
    // Depende do id, não do objeto `jam`: o snapshot chega novo a cada
    // polling, e reagir a ele religaria o modo seguidor sem necessidade.
  }, [jamId, isHost, setFollower]);

  /**
   * Dentro de um jam ninguém ganha faixa de graça — nem o host.
   *
   * O autoplay enche a fila com vinte faixas do catálogo assim que ela
   * fica curta, e no host isso subia direto para a sala: a lista que as
   * duas pessoas montaram à mão crescia sozinha com música que nenhuma
   * das duas escolheu. A fila do jam é uma escolha, e quando ela acaba a
   * resposta certa é o silêncio e um convite para acrescentar.
   */
  const setCurated = player.setCurated;
  useEffect(() => {
    setCurated(Boolean(jamId));
    return () => setCurated(false);
  }, [jamId, setCurated]);

  /* ---------------- ações ---------------- */

  /**
   * Roda uma escrita na sala mostrando o resultado antes dele existir.
   *
   * A previsão entra primeiro, a chamada vai depois, e a leitura
   * forçada no fim troca a previsão pela verdade. Se o servidor recusar,
   * a previsão é desfeita na hora — a fila volta ao que era, e a
   * mensagem explica por quê.
   */
  const act = useCallback(
    async (
      /** Como a fila fica, se der certo. `null` não prevê nada. */
      predict: ((queue: HydratedTrack[]) => HydratedTrack[]) | null,
      run: () => Promise<{ ok: boolean; message: string }>,
    ) => {
      if (!jamId || !jam) return OUTSIDE;

      const before = pending ?? jam.queue;
      if (predict) setPending(predict(before));

      try {
        const res = await run();
        if (!res.ok) {
          setPending(null);
          return res.message;
        }
        // A fila do servidor já é a certa: estas ações escrevem lá
        // primeiro. A bandeira faz o efeito de publicação engolir o
        // carimbo que o espelho local produzir, em vez de mandar tudo
        // de volta e desfazer o que acabou de acontecer.
        adoptNextStamp.current = true;
        sync(true);
        return res.message;
      } catch {
        setPending(null);
        return "Algo deu errado. Tente novamente.";
      }
    },
    [jamId, jam, pending, sync],
  );

  const addTrack = useCallback(
    async (track: HydratedTrack) => {
      if (!jamId) return OUTSIDE;
      return act(
        (q) => (q.some((t) => t.id === track.id) ? q : [...q, track]),
        () => addToJamQueue(jamId, [track.id]),
      );
    },
    [jamId, act],
  );

  /**
   * "Tocar a seguir" existe para o convidado ter alguma influência sobre
   * a *ordem*, e não só sobre o fim da fila: enfileirar atrás de vinte
   * músicas é o mesmo que não escolher nada.
   */
  const playNext = useCallback(
    async (track: HydratedTrack) => {
      if (!jamId || !jam) return OUTSIDE;

      const at = Math.max(jam.index, 0);
      const playingId = jam.queue[at]?.id;

      return act(
        (q) => {
          const rest = q.filter((t) => t.id !== track.id);
          const anchor = playingId
            ? rest.findIndex((t) => t.id === playingId)
            : -1;
          rest.splice(anchor + 1, 0, track);
          return rest;
        },
        async () => {
          // Uma chamada só quando a faixa já está na sala. Antes eram
          // sempre duas em sequência — enfileirar e então mover — e a
          // segunda esperava a primeira, dobrando a espera de um clique
          // que vem quase sempre de uma faixa já enfileirada.
          if (!jam.queue.some((t) => t.id === track.id)) {
            const added = await addToJamQueue(jamId, [track.id]);
            if (!added.ok) return added;
          }
          return moveJamTrackNext(jamId, track.id);
        },
      );
    },
    [jamId, jam, act],
  );

  const jumpTo = useCallback(
    async (track: HydratedTrack) => {
      if (!jamId || !jam) return OUTSIDE;
      if (!isHost) return "Só o anfitrião troca a faixa.";

      // Pular é o único gesto que o host ouve na hora: o player local
      // vai junto, e o relógio conta o resto à sala.
      const p = playerRef.current;
      const local = p.queue.findIndex((t) => t.id === track.id);
      if (local >= 0) p.playAt(local);

      return act(null, async () => {
        if (!jam.queue.some((t) => t.id === track.id)) {
          const added = await addToJamQueue(jamId, [track.id]);
          if (!added.ok) return added;
        }
        return jumpJamToTrack(jamId, track.id);
      });
    },
    [jamId, jam, isHost, act],
  );

  /**
   * Tira uma faixa da fila do jam — e só dela.
   *
   * O player local do host fica de fora de propósito. Mexer nele aqui
   * carimbava a fila e disparava a publicação inteira logo atrás da
   * remoção, que então competia com ela: a faixa sumia e voltava. Quem
   * traz a fila nova de volta ao player é o polling, pelo caminho
   * normal, uma vez só.
   */
  const removeTrack = useCallback(
    async (track: HydratedTrack) => {
      if (!jamId) return OUTSIDE;
      return act(
        (q) => q.filter((t) => t.id !== track.id),
        () => removeFromJam(jamId, track.id),
      );
    },
    [jamId, act],
  );

  /**
   * Reordena a fila. A previsão local já mostra a ordem nova, então o
   * arrasto termina onde a pessoa soltou e não dá o pulinho de voltar
   * ao lugar antigo enquanto o servidor pensa.
   */
  const reorder = useCallback(
    async (trackIds: string[]) => {
      if (!jamId || !jam) return OUTSIDE;
      const byId = new Map(jam.queue.map((t) => [t.id, t]));
      const next = trackIds
        .map((id) => byId.get(id))
        .filter((t): t is HydratedTrack => Boolean(t));

      return act(
        () => next,
        () => reorderJamQueue(jamId, trackIds),
      );
    },
    [jamId, jam, act],
  );

  const leave = useCallback(async () => {
    if (!jamId) return;
    await leaveCurrentJam(jamId);
    setJam(null);
    setPending(null);
    appliedRevision.current = null;
    // Sair encerra a sala e nada mais do layout muda, então a revalidação
    // fica só para a próxima navegação: o estado local já conta a verdade.
  }, [jamId]);

  /**
   * Adota uma sala que a action já devolveu montada.
   *
   * `syncedWith` acompanha junto, senão o `initialJam` velho — que ainda
   * é `null` até a próxima navegação — venceria a adoção no render
   * seguinte e tiraria a pessoa do jam em que ela acabou de entrar.
   */
  const adopt = useCallback((snapshot: JamSnapshot | null) => {
    setJam(snapshot);
    setPending(null);
    setSyncedWith(snapshot?.id ?? null);
    appliedRevision.current = null;
  }, []);

  /**
   * O valor do contexto, memoizado.
   *
   * Sem isto o objeto era novo a cada render do provider — e como o
   * provider re-renderiza a cada batida do polling (de três em três
   * segundos), todo consumidor de `useJam` re-renderizava junto, mesmo
   * quando nada do que ele mostra tinha mudado.
   */
  const api = useMemo(
    () => ({
      jam: view,
      isHost,
      addTrack,
      playNext,
      jumpTo,
      removeTrack,
      reorder,
      leave,
      sync,
      adopt,
    }),
    [
      view,
      isHost,
      addTrack,
      playNext,
      jumpTo,
      removeTrack,
      reorder,
      leave,
      sync,
      adopt,
    ],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
