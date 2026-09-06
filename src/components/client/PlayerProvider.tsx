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
import { registerPlay, toggleLike } from "@/lib/actions";

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
};

type PlayerApi = PlayerState & {
  playTrack: (track: HydratedTrack, context?: HydratedTrack[]) => void;
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

/** Embaralha preservando a faixa atual na primeira posição. */
function shuffled<T>(items: T[], keepFirst: number): T[] {
  const rest = items.filter((_, i) => i !== keepFirst);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [items[keepFirst], ...rest];
}

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

  const current = index >= 0 ? (queue[index] ?? null) : null;

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
    const onEnd = () => setPlaying(false); // o avanço é tratado abaixo
    const onErr = () => setPlaying(false);

    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("durationchange", onMeta);
    el.addEventListener("ended", onEnd);
    el.addEventListener("error", onErr);

    return () => {
      el.pause();
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("durationchange", onMeta);
      el.removeEventListener("ended", onEnd);
      el.removeEventListener("error", onErr);
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

  /* ---------------- navegação ---------------- */

  const next = useCallback(
    (auto = false) => {
      setIndex((i) => {
        if (queue.length === 0) return i;
        if (repeat === "one" && auto) {
          const el = audioRef.current;
          if (el) {
            el.currentTime = 0;
            void el.play().catch(() => {});
          }
          return i;
        }
        if (i < queue.length - 1) return i + 1;
        if (repeat === "all") return 0;
        if (auto) setPlaying(false);
        return i;
      });
    },
    [queue.length, repeat],
  );

  /** O avanço automático mora aqui para enxergar o estado atual. */
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onEnded = () => {
      if (repeat === "one") {
        el.currentTime = 0;
        void el.play().catch(() => {});
        countedRef.current = current?.id ?? null;
        return;
      }
      if (index < queue.length - 1) setIndex(index + 1);
      else if (repeat === "all" && queue.length) setIndex(0);
      else setPlaying(false);
    };
    el.addEventListener("ended", onEnded);
    return () => el.removeEventListener("ended", onEnded);
  }, [index, queue.length, repeat, current?.id]);

  const playTrack = useCallback(
    (track: HydratedTrack, context?: HydratedTrack[]) => {
      const list = context?.length ? context : [track];
      const at = Math.max(
        0,
        list.findIndex((t) => t.id === track.id),
      );
      sourceRef.current = list;
      const ordered = shuffle ? shuffled(list, at) : list;
      setQueue(ordered);
      setIndex(shuffle ? 0 : at);
      setPlaying(true);
    },
    [shuffle],
  );

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

  const toggleShuffle = useCallback(() => {
    setShuffle((on) => {
      const willShuffle = !on;
      const source = sourceRef.current;
      if (!source.length || index < 0) return willShuffle;

      const currentId = queue[index]?.id;
      if (willShuffle) {
        const at = source.findIndex((t) => t.id === currentId);
        setQueue(shuffled(source, Math.max(0, at)));
        setIndex(0);
      } else {
        setQueue(source);
        setIndex(Math.max(0, source.findIndex((t) => t.id === currentId)));
      }
      return willShuffle;
    });
  }, [index, queue]);

  const cycleRepeat = useCallback(() => {
    setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off"));
  }, []);

  const removeFromQueue = useCallback(
    (at: number) => {
      setQueue((q) => q.filter((_, i) => i !== at));
      setIndex((i) => (at < i ? i - 1 : i));
    },
    [],
  );

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
      upNext: index >= 0 ? queue.slice(index + 1) : [],
      playTrack,
      toggle,
      next: () => next(false),
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
      repeat, liked, playTrack, toggle, next, prev, seek, toggleShuffle,
      cycleRepeat, removeFromQueue, like,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
