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
  like: (trackId: string) => void;
  isLiked: (trackId: string) => boolean;
};

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
    if (!seed || refillingRef.current) return [];

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
    if (repeat !== "off") return; // repetindo, a fila se basta
    if (queue.length - index - 1 > REFILL_THRESHOLD) return;
    void refill();
  }, [index, queue.length, repeat, refill]);

  /* ---------------- navegação ---------------- */

  /**
   * Avança uma faixa. Com `auto`, veio do fim da música: aí respeitamos
   * `repeat: "one"` e buscamos continuação em vez de parar.
   */
  const advance = useCallback(
    async (auto: boolean) => {
      const el = audioRef.current;

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
      like,
      isLiked: (id: string) => liked.has(id),
    }),
    [
      queue, index, current, playing, time, duration, volume, muted, shuffle,
      repeat, liked, loadingMore, playTrack, playShuffled, shuffleAll, toggle,
      next, prev, seek, toggleShuffle, cycleRepeat, removeFromQueue, like,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
