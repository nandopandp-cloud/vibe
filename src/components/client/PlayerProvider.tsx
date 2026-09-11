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
import type { HydratedTrack } from "@/lib/types";
import {
  fetchAutoplay,
  fetchShuffleAll,
  registerPlay,
  toggleLike,
} from "@/lib/actions";

type RepeatMode = "off" | "all" | "one";

type PlayerState = {
  queue: HydratedTrack[];
  index: number;
  current: HydratedTrack | null;
  playing: boolean;
  time: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  liked: Set<string>;
  /** Fila visível no painel lateral: o que vem depois da faixa atual. */
  upNext: HydratedTrack[];
  /** Buscando a continuação no servidor (fim da fila). */
  loadingMore: boolean;
};

type PlayerApi = PlayerState & {
  playTrack: (track: HydratedTrack, context?: HydratedTrack[]) => void;
  /** Toca uma lista embaralhada — usado pelos botões "Aleatório". */
  playShuffled: (tracks: HydratedTrack[]) => void;
  /** Fila aleatória com o catálogo inteiro. */
  shuffleAll: () => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  playAt: (index: number) => void;
  removeFromQueue: (index: number) => void;
  /* --- escuta em conjunto (jam) --- */
  /** Acrescenta faixas ao fim da fila, sem trocar o que está tocando. */
  enqueue: (tracks: HydratedTrack[]) => void;
  /** Substitui fila e posição de uma vez — o convidado seguindo o host. */
  adoptQueue: (tracks: HydratedTrack[], at: number) => void;
  /** Liga/desliga o play sem alternar, para espelhar um estado externo. */
  setPlaying: (value: boolean) => void;
  /**
   * Modo seguidor: o player para de decidir o que vem depois (autoplay,
   * avanço no fim da faixa) porque quem decide é o host do jam.
   */
  setFollower: (value: boolean) => void;
  like: (trackId: string) => void;
  isLiked: (trackId: string) => boolean;
  /* --- saída de áudio --- */
  /** Saídas disponíveis no computador; vazio até a permissão ser dada. */
  outputs: AudioOutput[];
  /** Id da saída em uso ("default" enquanto nada foi trocado). */
  outputId: string;
  /** Pede permissão e lista as saídas reais (nomes só vêm com permissão). */
  loadOutputs: () => Promise<void>;
  /** Manda o som para outra saída do computador. */
  selectOutput: (deviceId: string) => Promise<void>;
  /** `true` quando o navegador sabe redirecionar o áudio. */
  canRouteAudio: boolean;
  /** Estado do Chromecast/AirPlay: indisponível, pronto ou conectado. */
  remoteState: "unavailable" | "available" | "connected";
  /** Abre o seletor nativo de Cast/AirPlay do navegador. */
  openRemotePicker: () => void;
};

/** Uma saída de áudio do sistema. */
export type AudioOutput = { deviceId: string; label: string };

const Ctx = createContext<PlayerApi | null>(null);

export function usePlayer() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePlayer precisa estar dentro de PlayerProvider");
  return ctx;
}

/** Fisher-Yates numa cópia. */
function shuffleCopy<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Embaralha preservando a faixa atual na primeira posição. */
function shuffledFrom<T>(items: T[], keepFirst: number): T[] {
  if (items.length === 0) return [];
  const rest = items.filter((_, i) => i !== keepFirst);
  return [items[keepFirst], ...shuffleCopy(rest)];
}

/** Remove duplicatas por id, mantendo a primeira ocorrência. */
function dedupe(tracks: HydratedTrack[]): HydratedTrack[] {
  const seen = new Set<string>();
  return tracks.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
}

/** Quantas faixas ainda faltam antes de buscarmos mais no servidor. */
const REFILL_THRESHOLD = 2;
/** Quantos erros seguidos toleramos antes de parar de pular faixas. */
const MAX_CONSECUTIVE_ERRORS = 3;

export function PlayerProvider({
  children,
  initialLiked = [],
}: {
  children: React.ReactNode;
  initialLiked?: string[];
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** Ordem original, para restaurar quando o shuffle é desligado. */
  const sourceRef = useRef<HydratedTrack[]>([]);
  /** Evita contar a mesma reprodução duas vezes. */
  const countedRef = useRef<string | null>(null);
  /** Impede buscas de continuação simultâneas. */
  const refillingRef = useRef(false);
  /** Ids já enfileirados alguma vez, para o autoplay não repetir. */
  const historyRef = useRef<Set<string>>(new Set());
  /** Faixas que falharam em sequência — corta o avanço em cascata. */
  const failuresRef = useRef(0);
  /**
   * Seguindo o host de um jam: o player não busca continuação nem avança
   * sozinho, porque isso tiraria o convidado da sincronia da sala.
   */
  const followerRef = useRef(false);
  const [follower, setFollowerState] = useState(false);

  const [queue, setQueue] = useState<HydratedTrack[]>([]);
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [liked, setLiked] = useState<Set<string>>(new Set(initialLiked));
  const [loadingMore, setLoadingMore] = useState(false);
  const [outputs, setOutputs] = useState<AudioOutput[]>([]);
  const [outputId, setOutputId] = useState("default");
  const [remoteState, setRemoteState] =
    useState<"unavailable" | "available" | "connected">("unavailable");

  const current = index >= 0 ? (queue[index] ?? null) : null;

  /** Substitui a fila registrando os ids no histórico do autoplay. */
  const installQueue = useCallback(
    (tracks: HydratedTrack[], at: number, source?: HydratedTrack[]) => {
      const list = dedupe(tracks);
      sourceRef.current = source ? dedupe(source) : list;
      historyRef.current = new Set(list.map((t) => t.id));
      setQueue(list);
      setIndex(Math.min(Math.max(at, 0), Math.max(list.length - 1, 0)));
    },
    [],
  );

  /* ---------------- elemento de áudio ---------------- */

  useEffect(() => {
    const el = new Audio();
    el.preload = "metadata";
    audioRef.current = el;

    const onTime = () => {
      setTime(el.currentTime);
      // Conta o play depois de 5s ouvidos (ou 30% da faixa).
      const id = countedRef.current;
      if (id && el.currentTime > Math.min(5, el.duration * 0.3)) {
        countedRef.current = null;
        void registerPlay(id);
      }
    };
    const onMeta = () => setDuration(el.duration || 0);
    // Tocou de verdade: a cascata de erros recomeça do zero.
    const onPlaying = () => {
      failuresRef.current = 0;
    };

    el.addEventListener("playing", onPlaying);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("durationchange", onMeta);

    return () => {
      el.pause();
      el.removeEventListener("playing", onPlaying);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("durationchange", onMeta);
    };
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (el) el.volume = muted ? 0 : volume;
  }, [volume, muted]);

  /** Troca a fonte quando a faixa muda. */
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !current) return;
    if (el.dataset.trackId === current.id) return;

    el.dataset.trackId = current.id;
    el.src = current.audio;
    // Trocar a fonte pode devolver o som à saída padrão; reafirmamos a
    // escolha do usuário para a faixa seguinte sair no mesmo lugar.
    if (outputId !== "default" && "setSinkId" in el) {
      void el.setSinkId(outputId).catch(() => {});
    }
    setTime(0);
    setDuration(current.duration || 0);
    countedRef.current = current.id;

    if (playing) void el.play().catch(() => setPlaying(false));
    // `playing` de propósito fora das deps: só reagimos à troca de faixa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !current) return;
    if (playing) void el.play().catch(() => setPlaying(false));
    else el.pause();
  }, [playing, current]);

  /* ---------------- continuidade ---------------- */

  /**
   * Puxa a continuação do catálogo e devolve as faixas adicionadas.
   * A cascata (mesmo artista → mesmo gênero → outros gêneros) roda no
   * servidor, que é quem enxerga o acervo inteiro.
   */
  const refill = useCallback(async (): Promise<HydratedTrack[]> => {
    const seed = queue[index] ?? queue[queue.length - 1];
    // Num jam, a fila vem do host: inventar continuação aqui faria o
    // convidado ouvir uma música que ninguém mais na sala está ouvindo.
    if (!seed || refillingRef.current || followerRef.current) return [];

    refillingRef.current = true;
    setLoadingMore(true);
    try {
      const more = await fetchAutoplay({
        seedTrackId: seed.id,
        excludeIds: [...historyRef.current],
        limit: 20,
        shuffle,
      });
      const fresh = more.filter((t) => !historyRef.current.has(t.id));
      if (fresh.length === 0) return [];

      for (const t of fresh) historyRef.current.add(t.id);
      sourceRef.current = [...sourceRef.current, ...fresh];
      setQueue((q) => [...q, ...fresh]);
      return fresh;
    } catch {
      return [];
    } finally {
      refillingRef.current = false;
      setLoadingMore(false);
    }
  }, [queue, index, shuffle]);

  /** Mantém sempre algumas faixas à frente, para o play nunca engasgar. */
  useEffect(() => {
    if (index < 0 || queue.length === 0) return;
    if (follower) return; // quem manda na fila é o host do jam
    if (repeat !== "off") return; // repetindo, a fila se basta
    if (queue.length - index - 1 > REFILL_THRESHOLD) return;
    void refill();
  }, [index, queue.length, repeat, refill, follower]);

  /* ---------------- navegação ---------------- */

  /**
   * Avança uma faixa. Com `auto`, veio do fim da música: aí respeitamos
   * `repeat: "one"` e buscamos continuação em vez de parar.
   */
  const advance = useCallback(
    async (auto: boolean) => {
      const el = audioRef.current;

      // Seguindo um jam, o fim da faixa não avança nada: o host vai
      // mandar a próxima, e pular na frente dele dessincronizaria a sala.
      if (auto && followerRef.current) {
        setPlaying(false);
        return;
      }

      if (auto && repeat === "one" && el) {
        el.currentTime = 0;
        countedRef.current = queue[index]?.id ?? null;
        void el.play().catch(() => setPlaying(false));
        return;
      }

      if (index < queue.length - 1) {
        setIndex(index + 1);
        setPlaying(true);
        return;
      }

      if (repeat === "all" && queue.length > 0) {
        setIndex(0);
        setPlaying(true);
        return;
      }

      // Fim da fila: tenta a continuação automática antes de desistir.
      const more = await refill();
      if (more.length > 0) {
        // A fila pode ter crescido enquanto esperávamos: avança a partir
        // do tamanho real, não do que este closure viu.
        setIndex((i) => i + 1);
        setPlaying(true);
      } else if (auto) {
        setPlaying(false);
      }
    },
    [index, queue, repeat, refill],
  );

  /**
   * O avanço automático mora num efeito para enxergar o estado atual —
   * é o único listener de `ended`, para não competir com outro que pause.
   */
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onEnded = () => {
      failuresRef.current = 0;
      void advance(true);
    };
    // Uma faixa quebrada não pode travar a fila, mas também não pode
    // fazer o player varrer o catálogo inteiro em silêncio.
    const onError = () => {
      failuresRef.current += 1;
      if (failuresRef.current > MAX_CONSECUTIVE_ERRORS) {
        setPlaying(false);
        return;
      }
      void advance(true);
    };
    el.addEventListener("ended", onEnded);
    el.addEventListener("error", onError);
    return () => {
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("error", onError);
    };
  }, [advance]);

  const playTrack = useCallback(
    (track: HydratedTrack, context?: HydratedTrack[]) => {
      const list = context?.length ? context : [track];
      const at = Math.max(
        0,
        list.findIndex((t) => t.id === track.id),
      );
      if (shuffle) installQueue(shuffledFrom(list, at), 0, list);
      else installQueue(list, at);
      setPlaying(true);
    },
    [shuffle, installQueue],
  );

  const playShuffled = useCallback(
    (tracks: HydratedTrack[]) => {
      if (tracks.length === 0) return;
      const order = shuffleCopy(tracks);
      setShuffle(true);
      installQueue(order, 0, tracks);
      setPlaying(true);
    },
    [installQueue],
  );

  const shuffleAll = useCallback(() => {
    setShuffle(true);
    setLoadingMore(true);
    void fetchShuffleAll(50)
      .then((tracks) => {
        if (tracks.length === 0) return;
        installQueue(tracks, 0);
        setPlaying(true);
      })
      .finally(() => setLoadingMore(false));
  }, [installQueue]);

  const toggle = useCallback(() => {
    if (!current) return;
    setPlaying((p) => !p);
  }, [current]);

  const prev = useCallback(() => {
    const el = audioRef.current;
    // Padrão de player: só volta de faixa nos 3 primeiros segundos.
    if (el && el.currentTime > 3) {
      el.currentTime = 0;
      setTime(0);
      return;
    }
    setIndex((i) => (i > 0 ? i - 1 : i));
  }, []);

  const seek = useCallback((seconds: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = seconds;
    setTime(seconds);
  }, []);

  /**
   * Liga/desliga o aleatório. Ligado, embaralha o que ainda não tocou e
   * mantém a faixa atual no ar; desligado, volta à ordem original.
   */
  const toggleShuffle = useCallback(() => {
    const willShuffle = !shuffle;
    setShuffle(willShuffle);

    const source = sourceRef.current;
    const currentId = queue[index]?.id;

    // Sem nada tocando, ligar o aleatório inicia a fila do catálogo inteiro.
    if (!currentId) {
      if (willShuffle) shuffleAll();
      return;
    }

    if (willShuffle) {
      const at = Math.max(
        0,
        source.findIndex((t) => t.id === currentId),
      );
      setQueue(shuffledFrom(source, at));
      setIndex(0);
    } else {
      setQueue(source);
      setIndex(
        Math.max(
          0,
          source.findIndex((t) => t.id === currentId),
        ),
      );
    }
  }, [shuffle, queue, index, shuffleAll]);

  const cycleRepeat = useCallback(() => {
    setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off"));
  }, []);

  const removeFromQueue = useCallback((at: number) => {
    setQueue((q) => q.filter((_, i) => i !== at));
    setIndex((i) => (at < i ? i - 1 : i));
  }, []);

  const like = useCallback((trackId: string) => {
    // Otimista: a UI responde na hora, o servidor confirma depois.
    setLiked((prev) => {
      const copy = new Set(prev);
      if (copy.has(trackId)) copy.delete(trackId);
      else copy.add(trackId);
      return copy;
    });
    void toggleLike(trackId);
  }, []);

  /* ---------------- escuta em conjunto (jam) ---------------- */

  /** Põe faixas no fim da fila sem interromper o que está tocando. */
  const enqueue = useCallback((tracks: HydratedTrack[]) => {
    if (tracks.length === 0) return;
    setQueue((q) => {
      const known = new Set(q.map((t) => t.id));
      const fresh = tracks.filter((t) => !known.has(t.id));
      if (fresh.length === 0) return q;
      for (const t of fresh) historyRef.current.add(t.id);
      sourceRef.current = [...sourceRef.current, ...fresh];
      return [...q, ...fresh];
    });
  }, []);

  /**
   * Assume a fila do jam por inteiro.
   *
   * Diferente de `playTrack`, não mexe em `playing`: quem chama é o
   * sincronizador, e é o relógio do host — não o ato de trocar a fila —
   * que diz se a sala está tocando ou em pausa.
   */
  const adoptQueue = useCallback(
    (tracks: HydratedTrack[], at: number) => {
      installQueue(tracks, at);
    },
    [installQueue],
  );

  const setFollower = useCallback((value: boolean) => {
    followerRef.current = value;
    setFollowerState(value);
  }, []);

  /* ---------------- saída de áudio ---------------- */

  /**
   * Redirecionar o áudio depende de `setSinkId`, que hoje existe no
   * Chrome e no Edge. Onde não existe, o menu explica em vez de oferecer
   * um controle que não faria nada.
   */
  const canRouteAudio =
    typeof window !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;

  /**
   * Lista as saídas do sistema.
   *
   * O navegador só revela os nomes ("Caixa de som", "Fones") depois de uma
   * permissão de mídia — sem ela, viriam rótulos vazios. Por isso pedimos
   * o microfone e o liberamos no mesmo instante: é o preço de descobrir
   * como os aparelhos se chamam.
   */
  const loadOutputs = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      let devices = await navigator.mediaDevices.enumerateDevices();
      const unnamed = devices.some(
        (d) => d.kind === "audiooutput" && !d.label,
      );
      if (unnamed && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        // Desligamos na hora: queríamos a permissão, não o microfone.
        for (const track of stream.getTracks()) track.stop();
        devices = await navigator.mediaDevices.enumerateDevices();
      }
      setOutputs(
        devices
          .filter((d) => d.kind === "audiooutput")
          .map((d, i) => ({
            deviceId: d.deviceId,
            label: d.label || `Saída ${i + 1}`,
          })),
      );
    } catch {
      // Permissão negada: seguimos com a saída padrão do sistema.
      setOutputs([]);
    }
  }, []);

  const selectOutput = useCallback(async (deviceId: string) => {
    const el = audioRef.current;
    if (!el || !("setSinkId" in el)) return;
    try {
      await el.setSinkId(deviceId);
      setOutputId(deviceId);
    } catch (e) {
      console.error("[sona] não foi possível trocar a saída de áudio", e);
    }
  }, []);

  /** Abre o seletor nativo de Chromecast/AirPlay. */
  const openRemotePicker = useCallback(() => {
    const el = audioRef.current;
    if (!el?.remote) return;
    void el.remote.prompt().catch(() => {});
  }, []);

  /**
   * Observa se há algum aparelho de Cast/AirPlay por perto. O navegador
   * avisa quando aparece ou some, então o botão só se oferece quando há
   * de fato para onde mandar o som.
   */
  useEffect(() => {
    const el = audioRef.current;
    if (!el?.remote) return;

    let watchId: number | undefined;
    const sync = () =>
      setRemoteState(
        el.remote.state === "connected"
          ? "connected"
          : el.remote.state === "connecting"
            ? "connected"
            : "available",
      );

    el.remote
      .watchAvailability((available) => {
        setRemoteState(available ? "available" : "unavailable");
      })
      .then((id) => {
        watchId = id;
      })
      .catch(() => {});

    el.remote.addEventListener("connect", sync);
    el.remote.addEventListener("connecting", sync);
    el.remote.addEventListener("disconnect", sync);
    return () => {
      el.remote.removeEventListener("connect", sync);
      el.remote.removeEventListener("connecting", sync);
      el.remote.removeEventListener("disconnect", sync);
      if (watchId !== undefined) {
        void el.remote.cancelWatchAvailability(watchId).catch(() => {});
      }
    };
  }, []);

  /* ---------------- atalhos de teclado ---------------- */

  const next = useCallback(() => void advance(false), [advance]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (el?.isContentEditable) return;

      if (e.code === "Space") {
        e.preventDefault();
        toggle();
      } else if (e.code === "ArrowRight" && e.shiftKey) {
        e.preventDefault();
        next();
      } else if (e.code === "ArrowLeft" && e.shiftKey) {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, next, prev]);

  /* ---------------- Media Session (controles do SO) ---------------- */

  useEffect(() => {
    if (!("mediaSession" in navigator) || !current) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist?.name ?? "Artista desconhecido",
      album: current.album?.title ?? "Sona",
      artwork: current.cover
        ? [{ src: current.cover, sizes: "512x512" }]
        : undefined,
    });
    navigator.mediaSession.setActionHandler("play", () => setPlaying(true));
    navigator.mediaSession.setActionHandler("pause", () => setPlaying(false));
    navigator.mediaSession.setActionHandler("nexttrack", () => next());
    navigator.mediaSession.setActionHandler("previoustrack", () => prev());
  }, [current, next, prev]);

  const value = useMemo<PlayerApi>(
    () => ({
      queue,
      index,
      current,
      playing,
      time,
      duration: duration || current?.duration || 0,
      volume,
      muted,
      shuffle,
      repeat,
      liked,
      loadingMore,
      upNext: index >= 0 ? queue.slice(index + 1) : [],
      playTrack,
      playShuffled,
      shuffleAll,
      toggle,
      next,
      prev,
      seek,
      setVolume: (v: number) => {
        setVolumeState(v);
        if (v > 0) setMuted(false);
      },
      toggleMute: () => setMuted((m) => !m),
      toggleShuffle,
      cycleRepeat,
      playAt: (i: number) => {
        setIndex(i);
        setPlaying(true);
      },
      removeFromQueue,
      enqueue,
      adoptQueue,
      setPlaying,
      setFollower,
      like,
      isLiked: (id: string) => liked.has(id),
      outputs,
      outputId,
      loadOutputs,
      selectOutput,
      canRouteAudio,
      remoteState,
      openRemotePicker,
    }),
    [
      queue, index, current, playing, time, duration, volume, muted, shuffle,
      repeat, liked, loadingMore, playTrack, playShuffled, shuffleAll, toggle,
      next, prev, seek, toggleShuffle, cycleRepeat, removeFromQueue, like,
      enqueue, adoptQueue, setFollower,
      outputs, outputId, loadOutputs, selectOutput, canRouteAudio,
      remoteState, openRemotePicker,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
