"use client";

import Link from "next/link";
import { usePlayer } from "./PlayerProvider";
import { DeviceMenu } from "./DeviceMenu";
import { AddToPlaylistButton } from "./AddToPlaylist";
import { TrackMenu } from "./TrackMenu";
import { Cover } from "../Cover";
import { cx, formatTime } from "@/lib/utils";
import * as I from "../Icons";

/** Slider com preenchimento branco até a posição — como nas referências. */
function Scrubber({
  value,
  max,
  onChange,
  className,
  accent = "#fff",
  label,
}: {
  value: number;
  max: number;
  onChange: (v: number) => void;
  className?: string;
  accent?: string;
  label: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <input
      type="range"
      className={cx("sona-range group w-full", className)}
      min={0}
      max={max || 1}
      step={0.1}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))}
      style={
        {
          "--track-pct": `${pct}%`,
          "--track-fill": accent,
        } as React.CSSProperties
      }
    />
  );
}

function IconButton({
  active,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cx(
        "grid place-items-center rounded-full transition-colors",
        active ? "text-accent" : "text-ink-2 hover:text-ink",
        className,
      )}
      {...props}
    />
  );
}

export function PlayerBar({
  onOpenNowPlaying,
  onOpenLyrics,
}: {
  onOpenNowPlaying: () => void;
  onOpenLyrics: () => void;
}) {
  const p = usePlayer();
  const t = p.current;

  return (
    <footer
      className="relative z-30 flex h-[88px] items-center gap-4 border-t border-hairline bg-void px-4"
      aria-label="Player"
    >
      {/* --- faixa atual --- */}
      <div className="flex min-w-0 flex-1 items-center gap-3 md:w-[30%] md:flex-none">
        {t ? (
          <>
            <button
              type="button"
              onClick={onOpenNowPlaying}
              className="group relative shrink-0"
              aria-label="Abrir tela de reprodução"
            >
              <Cover
                src={t.cover}
                seed={t.id}
                name={t.title}
                className="h-14 w-14"
              />
              <span className="absolute inset-0 grid place-items-center rounded-md bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                <I.Expand className="h-4 w-4 text-ink" />
              </span>
            </button>
            <div className="min-w-0">
              <button
                type="button"
                onClick={onOpenNowPlaying}
                className="block max-w-full truncate text-left text-sm font-medium text-ink hover:underline"
              >
                {t.title}
              </button>
              {t.artist && (
                <Link
                  href={`/artista/${t.artist.id}`}
                  className="block max-w-full truncate text-xs text-ink-2 hover:text-ink hover:underline"
                >
                  {t.artist.name}
                </Link>
              )}
            </div>
            <div className="ml-2 hidden items-center gap-1 sm:flex">
              <IconButton
                className="h-8 w-8"
                active={p.isLiked(t.id)}
                onClick={() => p.like(t.id)}
                aria-label={p.isLiked(t.id) ? "Remover das curtidas" : "Curtir"}
                aria-pressed={p.isLiked(t.id)}
              >
                {p.isLiked(t.id) ? (
                  <I.HeartFilled className="h-[18px] w-[18px]" />
                ) : (
                  <I.Heart className="h-[18px] w-[18px]" />
                )}
              </IconButton>
              <AddToPlaylistButton
                trackId={t.id}
                variant="bar"
                label="Adicionar a uma playlist"
              />
              <TrackMenu track={t} />
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3 text-ink-3">
            <div className="grid h-14 w-14 place-items-center rounded-md bg-surface">
              <I.Music className="h-5 w-5 text-ink-3" />
            </div>
            <p className="truncate text-sm">Nada tocando</p>
          </div>
        )}
      </div>

      {/* --- controles --- */}
      <div className="flex flex-[1.4] flex-col items-center gap-1.5">
        <div className="flex items-center gap-4">
          <IconButton
            className="hidden h-8 w-8 sm:grid"
            active={p.shuffle}
            onClick={p.toggleShuffle}
            aria-label="Aleatório"
            aria-pressed={p.shuffle}
            disabled={!t}
          >
            <I.Shuffle className="h-[18px] w-[18px]" />
          </IconButton>
          <IconButton
            className="h-9 w-9"
            onClick={p.prev}
            aria-label="Anterior"
            disabled={!t}
          >
            <I.Prev className="h-5 w-5" />
          </IconButton>

          <button
            type="button"
            onClick={p.toggle}
            disabled={!t}
            aria-label={p.playing ? "Pausar" : "Tocar"}
            className={cx(
              "grid h-11 w-11 place-items-center rounded-full border transition-all",
              t
                ? "border-ink/70 text-ink hover:scale-[1.06] hover:border-ink"
                : "border-hairline text-ink-3",
            )}
          >
            {p.playing ? (
              <I.Pause className="h-[18px] w-[18px]" />
            ) : (
              <I.Play className="ml-0.5 h-[18px] w-[18px]" />
            )}
          </button>

          <IconButton
            className="h-9 w-9"
            onClick={p.next}
            aria-label="Próxima"
            disabled={!t}
          >
            <I.Next className="h-5 w-5" />
          </IconButton>
          <IconButton
            className="hidden h-8 w-8 sm:grid"
            active={p.repeat !== "off"}
            onClick={p.cycleRepeat}
            aria-label={
              p.repeat === "one" ? "Repetir uma" : p.repeat === "all" ? "Repetir tudo" : "Repetir"
            }
            disabled={!t}
          >
            <span className="relative">
              <I.Repeat className="h-[18px] w-[18px]" />
              {p.repeat === "one" && (
                <span className="absolute -right-1 -top-1 grid h-3 w-3 place-items-center rounded-full bg-accent text-[8px] font-bold text-accent-ink">
                  1
                </span>
              )}
            </span>
          </IconButton>
        </div>

        <div className="flex w-full max-w-[520px] items-center gap-2">
          <span className="w-9 text-right text-[11px] tabular-nums text-ink-3">
            {formatTime(p.time)}
          </span>
          <Scrubber
            value={p.time}
            max={p.duration}
            onChange={p.seek}
            label="Progresso da faixa"
          />
          <span className="w-9 text-[11px] tabular-nums text-ink-3">
            {formatTime(p.duration)}
          </span>
        </div>
      </div>

      {/* --- utilidades à direita --- */}
      <div className="hidden flex-1 items-center justify-end gap-2 md:flex">
        <IconButton
          className="h-8 w-8"
          onClick={onOpenNowPlaying}
          aria-label="Fila de reprodução"
        >
          <I.Queue className="h-[18px] w-[18px]" />
        </IconButton>
        <IconButton
          className="h-8 w-8"
          onClick={onOpenLyrics}
          aria-label="Ver a letra"
          disabled={!t}
        >
          <I.Mic className="h-[18px] w-[18px]" />
        </IconButton>
        <DeviceMenu />
        <div className="flex items-center gap-1.5">
          <IconButton
            className="h-8 w-8"
            onClick={p.toggleMute}
            aria-label={p.muted ? "Reativar som" : "Silenciar"}
          >
            {p.muted || p.volume === 0 ? (
              <I.VolumeMute className="h-[18px] w-[18px]" />
            ) : (
              <I.Volume className="h-[18px] w-[18px]" />
            )}
          </IconButton>
          <Scrubber
            value={p.muted ? 0 : p.volume * 100}
            max={100}
            onChange={(v) => p.setVolume(v / 100)}
            className="w-24"
            label="Volume"
          />
        </div>
        <IconButton
          className="h-8 w-8"
          onClick={onOpenNowPlaying}
          aria-label="Tela cheia"
        >
          <I.Expand className="h-[18px] w-[18px]" />
        </IconButton>
      </div>
    </footer>
  );
}
