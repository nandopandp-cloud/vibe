"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  /** Tira uma faixa da fila — só o host. */
  removeTrack: (track: HydratedTrack) => Promise<string>;
  /** Sai do jam (encerra, se você for o host). */
  leave: () => Promise<void>;
  /** Força uma leitura agora, sem esperar o próximo polling. */
  sync: () => void;
  /** Uma ação de fila está em voo — para a UI não piscar duas vezes. */
  busy: boolean;
};

const OUTSIDE = "Você não está num jam.";

const Ctx = createContext<JamApi>({
  jam: null,
  isHost: false,
  addTrack: async () => OUTSIDE,
  playNext: async () => OUTSIDE,
  jumpTo: async () => OUTSIDE,
  removeTrack: async () => OUTSIDE,
  leave: async () => {},
  sync: () => {},
  busy: false,
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
   * é assim que "entrar no jam" chega até aqui, já que a entrada acontece
   * numa outra página e volta com um `router.refresh()`.
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

  const jamId = jam?.id ?? null;
  const isHost = Boolean(jam?.isHost);

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

  const sync = useCallback(() => {
    if (!jamId || pollingRef.current) return;
    pollingRef.current = true;
    void pollJam(jamId)
      .then((next) => {
        // `null` é o servidor dizendo que você não está mais na sala:
        // o host encerrou, ou alguém entrou com esta conta noutro lugar.
        if (!next || next.ended) {
          setJam(null);
          appliedRevision.current = null;
          router.refresh();
          return;
        }
        setJam(next);
      })
      .catch(() => {})
      .finally(() => {
        pollingRef.current = false;
      });
  }, [jamId, router]);

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
   * - O player já está tocando e alguém enfileirou algo: as faixas novas
   *   só se somam ao fim, sem interromper o que toca.
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

    const known = new Set(p.queue.map((t) => t.id));
    const fresh = jam.queue.filter((t) => !known.has(t.id));
    if (fresh.length === 0) return;

    // O `enqueue` carimba a fila local, mas o que ele acrescenta já veio
    // do servidor: sem este perdão o host publicaria de volta o que um
    // convidado acabou de enfileirar, num vaivém sem fim. A bandeira
    // evita adivinhar o número do carimbo, que só existe no render
    // seguinte.
    adoptNextStamp.current = true;
    p.enqueue(fresh);
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

  /* ---------------- ações ---------------- */

  const [busy, setBusy] = useState(false);

  /**
   * Toda ação de fila tem a mesma forma: manda, marca ocupado, e lê o
   * estado de volta. O `sync` no fim é o que faz a mudança aparecer na
   * mesma batida em quem clicou, em vez de no polling seguinte.
   */
  const act = useCallback(
    async (run: () => Promise<{ message: string }>) => {
      if (!jamId) return OUTSIDE;
      setBusy(true);
      try {
        const res = await run();
        // A fila do servidor já é a certa: estas ações escrevem lá
        // primeiro e só depois espelham no player. A bandeira faz o
        // efeito de publicação engolir o carimbo que esse espelho
        // produzir, em vez de mandar tudo de volta e desfazer — por
        // exemplo — a remoção que acabou de acontecer.
        //
        // É uma bandeira, e não uma leitura de `queueStamp` aqui,
        // porque o `playAt`/`removeFromQueue` acima ainda não passou
        // pelo React: o número certo só existe no render seguinte.
        adoptNextStamp.current = true;
        sync();
        return res.message;
      } catch {
        return "Algo deu errado. Tente novamente.";
      } finally {
        setBusy(false);
      }
    },
    [jamId, sync],
  );

  const addTrack = useCallback(
    async (track: HydratedTrack) => {
      if (!jamId) return OUTSIDE;
      return act(() => addToJamQueue(jamId, [track.id]));
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
      if (!jamId) return OUTSIDE;
      return act(async () => {
        // A faixa pode nem estar na fila ainda — quem pede "a seguir" a
        // partir do catálogo espera que ela entre, não uma recusa.
        const inQueue = jam?.queue.some((t) => t.id === track.id);
        if (!inQueue) await addToJamQueue(jamId, [track.id]);
        return moveJamTrackNext(jamId, track.id);
      });
    },
    [jamId, jam, act],
  );

  const jumpTo = useCallback(
    async (track: HydratedTrack) => {
      if (!jamId) return OUTSIDE;
      if (!isHost) return "Só o anfitrião troca a faixa.";
      return act(async () => {
        const inQueue = jam?.queue.some((t) => t.id === track.id);
        if (!inQueue) await addToJamQueue(jamId, [track.id]);
        const res = await jumpJamToTrack(jamId, track.id);
        // O host não espera o próprio polling para ouvir a troca: o
        // player dele pula na hora, e o relógio reporta o resto.
        if (res.ok) {
          const p = playerRef.current;
          const at = p.queue.findIndex((t) => t.id === track.id);
          if (at >= 0) p.playAt(at);
          else p.playTrack(track, [...p.queue, track]);
        }
        return res;
      });
    },
    [jamId, isHost, jam, act],
  );

  const removeTrack = useCallback(
    async (track: HydratedTrack) => {
      if (!jamId) return OUTSIDE;
      if (!isHost) return "Só o anfitrião remove faixas.";
      return act(async () => {
        const res = await removeFromJam(jamId, track.id);
        if (res.ok) {
          const p = playerRef.current;
          const at = p.queue.findIndex((t) => t.id === track.id);
          // Tirar do player local junto evita que a faixa toque no host
          // um segundo antes do polling apagá-la da fila da sala.
          if (at >= 0 && at !== p.index) p.removeFromQueue(at);
        }
        return res;
      });
    },
    [jamId, isHost, act],
  );

  const leave = useCallback(async () => {
    if (!jamId) return;
    await leaveCurrentJam(jamId);
    setJam(null);
    appliedRevision.current = null;
    router.refresh();
  }, [jamId, router]);

  return (
    <Ctx.Provider
      value={{
        jam,
        isHost,
        addTrack,
        playNext,
        jumpTo,
        removeTrack,
        leave,
        sync,
        busy,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
