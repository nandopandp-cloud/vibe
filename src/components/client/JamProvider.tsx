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
  leaveCurrentJam,
  pollJam,
  reportJamPlayback,
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
  /** Sai do jam (encerra, se você for o host). */
  leave: () => Promise<void>;
  /** Força uma leitura agora, sem esperar o próximo polling. */
  sync: () => void;
};

const Ctx = createContext<JamApi>({
  jam: null,
  isHost: false,
  addTrack: async () => "Você não está num jam.",
  leave: async () => {},
  sync: () => {},
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
      void reportJamPlayback({
        jamId,
        index: p.index,
        position: p.time,
        playing: p.playing,
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
    appliedRevision.current = jam.revision;

    const p = playerRef.current;
    if (jam.queue.length === 0) return;

    if (!p.current) {
      p.adoptQueue(jam.queue, Math.max(jam.index, 0));
      return;
    }

    const known = new Set(p.queue.map((t) => t.id));
    const fresh = jam.queue.filter((t) => !known.has(t.id));
    if (fresh.length > 0) p.enqueue(fresh);
  }, [jam, isHost]);

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

  const addTrack = useCallback(
    async (track: HydratedTrack) => {
      if (!jamId) return "Você não está num jam.";
      const res = await addToJamQueue(jamId, [track.id]);
      // O host aplica a própria adição na hora; os outros veem no polling.
      sync();
      return res.message;
    },
    [jamId, sync],
  );

  const leave = useCallback(async () => {
    if (!jamId) return;
    await leaveCurrentJam(jamId);
    setJam(null);
    appliedRevision.current = null;
    router.refresh();
  }, [jamId, router]);

  return (
    <Ctx.Provider value={{ jam, isHost, addTrack, leave, sync }}>
      {children}
    </Ctx.Provider>
  );
}
