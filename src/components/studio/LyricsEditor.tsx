"use client";

import { useRef, useState, useTransition } from "react";
import { importLyrics, saveLyrics, type ActionState } from "@/lib/actions";
import { Cover } from "../Cover";
import { Button, Card, FormMessage, Textarea } from "./Form";
import {
  activeLyricIndex,
  cx,
  formatTime,
  parseTimecode,
  toTimecode,
} from "@/lib/utils";
import * as I from "../Icons";
import type { HydratedTrack, LyricLine } from "@/lib/types";

/**
 * Editor de letra sincronizada: toca a faixa e permite carimbar o
 * timestamp de cada verso enquanto se ouve.
 */
export function LyricsEditor({ track }: { track: HydratedTrack }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [lines, setLines] = useState<LyricLine[]>(track.lyrics);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(track.duration);
  const [msg, setMsg] = useState<ActionState | null>(null);
  const [pending, start] = useTransition();
  const [bulk, setBulk] = useState("");
  const [showImport, setShowImport] = useState(track.lyrics.length === 0);
  /** Índice cujo timestamp será carimbado no próximo "Marcar". */
  const [cursor, setCursor] = useState(0);

  const active = activeLyricIndex(lines, time);

  const setLine = (i: number, patch: Partial<LyricLine>) =>
    setLines((prev) =>
      prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    );

  const stamp = (i: number) => {
    const el = audioRef.current;
    if (!el) return;
    setLine(i, { time: Math.round(el.currentTime * 10) / 10 });
    setCursor(Math.min(i + 1, lines.length - 1));
  };

  const jumpTo = (seconds: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = seconds;
    setTime(seconds);
  };

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      {/* ------------------ editor ------------------ */}
      <div className="space-y-4">
        <FormMessage state={msg} />

        {showImport ? (
          <Card
            title="Colar a letra"
            description="Uma linha por verso. Se já tiver marcações, use o formato [0:12] verso — elas são reconhecidas."
          >
            <Textarea
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              rows={12}
              placeholder={"Eu tava lá no meio da folia\nQuando avistei você chegar\n..."}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                disabled={pending || !bulk.trim()}
                onClick={() =>
                  start(async () => {
                    const res = await importLyrics(track.id, bulk);
                    setMsg(res);
                    if (res.ok) {
                      // Reflete localmente sem esperar o revalidate.
                      const parsed: LyricLine[] = [];
                      let fb = 0;
                      for (const raw of bulk.split("\n")) {
                        const text = raw.trim();
                        if (!text) continue;
                        const m = /^\[?(\d+:[0-5]?\d(?:[.,]\d+)?)\]?\s+(.*)$/.exec(text);
                        if (m) {
                          const t = parseTimecode(m[1]) ?? fb;
                          parsed.push({ time: t, text: m[2] });
                          fb = t + 3;
                        } else {
                          parsed.push({ time: fb, text });
                          fb += 3;
                        }
                      }
                      setLines(parsed);
                      setShowImport(false);
                      setCursor(0);
                    }
                  })
                }
              >
                Importar letra
              </Button>
              {lines.length > 0 && (
                <Button variant="ghost" onClick={() => setShowImport(false)}>
                  Voltar ao editor
                </Button>
              )}
            </div>
          </Card>
        ) : (
          <Card
            title="Versos"
            description="Toque a faixa e clique em “Marcar” no verso que está soando. O tempo é gravado com uma casa decimal."
          >
            <div className="mb-4 flex flex-wrap gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setLines((p) => [...p, { time: time, text: "" }]);
                  setCursor(lines.length);
                }}
              >
                <I.Plus className="h-4 w-4" />
                Adicionar verso
              </Button>
              <Button variant="ghost" onClick={() => setShowImport(true)}>
                Colar letra inteira
              </Button>
            </div>

            {lines.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-3">
                Nenhum verso ainda. Cole a letra ou adicione verso a verso.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {lines.map((line, i) => (
                  <li
                    key={i}
                    className={cx(
                      "grid grid-cols-[92px_1fr_auto] items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors",
                      i === active
                        ? "border-accent/40 bg-accent/5"
                        : i === cursor
                          ? "border-ink-3/40 bg-surface-2"
                          : "border-transparent hover:bg-surface-2/60",
                    )}
                  >
                    <input
                      value={toTimecode(line.time)}
                      onChange={(e) => {
                        const parsed = parseTimecode(e.target.value);
                        if (parsed !== null) setLine(i, { time: parsed });
                      }}
                      onFocus={() => setCursor(i)}
                      aria-label={`Tempo do verso ${i + 1}`}
                      className="w-full rounded bg-surface-3/60 px-2 py-1.5 text-center text-xs tabular-nums text-ink-2 focus:bg-surface-3 focus:text-ink focus:outline-none"
                    />
                    <input
                      value={line.text}
                      onChange={(e) => setLine(i, { text: e.target.value })}
                      onFocus={() => setCursor(i)}
                      placeholder="Verso…"
                      aria-label={`Texto do verso ${i + 1}`}
                      className="w-full bg-transparent px-1 py-1.5 text-sm text-ink placeholder:text-ink-3 focus:outline-none"
                    />
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => stamp(i)}
                        className="rounded px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/10"
                        title="Marcar o tempo atual neste verso"
                      >
                        Marcar
                      </button>
                      <button
                        type="button"
                        onClick={() => jumpTo(line.time)}
                        className="rounded p-1.5 text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink"
                        aria-label={`Ouvir a partir do verso ${i + 1}`}
                      >
                        <I.Play className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLines((p) => p.filter((_, idx) => idx !== i));
                        }}
                        className="rounded p-1.5 text-ink-2 transition-colors hover:bg-surface-3 hover:text-rose"
                        aria-label={`Remover verso ${i + 1}`}
                      >
                        <I.X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
              <Button
                disabled={pending}
                onClick={() =>
                  start(async () => setMsg(await saveLyrics(track.id, lines)))
                }
              >
                {pending ? "Salvando…" : "Salvar letra"}
              </Button>
              <p className="text-xs text-ink-3">
                {lines.length} verso(s) — os tempos são ordenados ao salvar.
              </p>
            </div>
          </Card>
        )}
      </div>

      {/* ------------------ player de apoio ------------------ */}
      <div className="lg:sticky lg:top-6 lg:h-fit">
        <Card>
          <div className="flex items-center gap-3">
            <Cover
              src={track.cover}
              seed={track.id}
              name={track.title}
              className="h-16 w-16"
            />
            <div className="min-w-0">
              <p className="truncate font-medium text-ink">{track.title}</p>
              <p className="truncate text-sm text-ink-2">
                {track.artist?.name}
              </p>
            </div>
          </div>

          <audio
            ref={audioRef}
            src={track.audio}
            preload="metadata"
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            className="hidden"
          />

          <div className="mt-5 space-y-2">
            <input
              type="range"
              className="sona-range w-full"
              min={0}
              max={duration || 1}
              step={0.1}
              value={time}
              aria-label="Posição da faixa"
              onChange={(e) => jumpTo(Number(e.target.value))}
              style={
                {
                  "--track-pct": `${duration ? (time / duration) * 100 : 0}%`,
                  "--track-fill": "#1dd760",
                } as React.CSSProperties
              }
            />
            <div className="flex justify-between text-xs tabular-nums text-ink-3">
              <span>{formatTime(time)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => jumpTo(Math.max(0, time - 5))}
              className="rounded-full p-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              aria-label="Voltar 5 segundos"
            >
              <I.Prev className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              className="grid h-12 w-12 place-items-center rounded-full bg-accent text-accent-ink transition-transform hover:scale-105"
              aria-label={playing ? "Pausar" : "Tocar"}
            >
              {playing ? (
                <I.Pause className="h-5 w-5" />
              ) : (
                <I.Play className="ml-0.5 h-5 w-5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => jumpTo(Math.min(duration, time + 5))}
              className="rounded-full p-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              aria-label="Avançar 5 segundos"
            >
              <I.Next className="h-5 w-5" />
            </button>
          </div>

          {/* atalho: carimba o verso sob o cursor */}
          {!showImport && lines.length > 0 && (
            <button
              type="button"
              onClick={() => stamp(cursor)}
              className="mt-5 w-full rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
            >
              Marcar verso {cursor + 1} em {formatTime(time)}
            </button>
          )}

          <div className="mt-5 rounded-lg bg-surface-2 p-3">
            <p className="text-xs font-medium text-ink-2">Prévia do ouvinte</p>
            <p
              className={cx(
                "mt-2 text-sm leading-snug",
                active >= 0 ? "font-semibold text-ink" : "text-ink-3",
              )}
            >
              {active >= 0 ? lines[active]?.text : "— aguardando o primeiro verso —"}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
