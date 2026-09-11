"use client";

import Link from "next/link";
import { usePlayer } from "./PlayerProvider";
import { usePlayIntent } from "./usePlayIntent";
import { AddToPlaylistButton } from "./AddToPlaylist";
import { Avatar, Cover } from "../Cover";
import {
  cx,
  formatCompact,
  formatNumber,
  formatPlays,
  formatTime,
} from "@/lib/utils";
import * as I from "../Icons";
import type { Artist, HydratedTrack } from "@/lib/types";

/** Botão verde de play que sobe na capa ao passar o mouse. */
function PlayFab({
  playing,
  onClick,
  label,
  className,
}: {
  playing: boolean;
  onClick: (e: React.MouseEvent) => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cx(
        "grid h-11 w-11 place-items-center rounded-full bg-accent text-accent-ink shadow-lg shadow-black/40 transition-all hover:scale-105 hover:bg-accent-hover",
        className,
      )}
    >
      {playing ? (
        <I.Pause className="h-5 w-5" />
      ) : (
        <I.Play className="ml-0.5 h-5 w-5" />
      )}
    </button>
  );
}

/** Card em grade: capa, título, artista e meta — como "Lançamentos recentes". */
export function TrackCard({
  track,
  context,
}: {
  track: HydratedTrack;
  context?: HydratedTrack[];
}) {
  const p = usePlayer();
  const { play, following, note } = usePlayIntent();
  const isCurrent = p.current?.id === track.id;
  const isPlaying = isCurrent && p.playing;

  const onPlay = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    play(track, context);
  };

  return (
    <article className="group">
      <div className="relative">
        <button
          type="button"
          onClick={onPlay}
          className="block w-full"
          aria-label={`Tocar ${track.title}`}
        >
          <Cover
            src={track.cover}
            seed={track.id}
            name={track.title}
            className="aspect-square w-full transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </button>
        <PlayFab
          playing={isPlaying}
          onClick={onPlay}
          label={
            following
              ? `Pedir ${track.title} no jam`
              : isPlaying
                ? `Pausar ${track.title}`
                : `Tocar ${track.title}`
          }
          className={cx(
            "absolute bottom-2 right-2 translate-y-2 opacity-0 transition-all duration-200",
            "group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100",
            isPlaying && "translate-y-0 opacity-100",
          )}
        />
      </div>

      <h3
        className={cx(
          "mt-3 truncate text-sm font-medium",
          isCurrent ? "text-accent" : "text-ink",
        )}
      >
        {track.title}
      </h3>
      {track.artist && (
        <Link
          href={`/artista/${track.artist.id}`}
          className="mt-0.5 block truncate text-xs text-ink-2 hover:text-ink hover:underline"
        >
          {track.artist.name}
        </Link>
      )}
      <p className="mt-1 truncate text-xs text-ink-3">
        {note ?? [track.album?.title ?? "Single", track.year].filter(Boolean).join(" • ")}
      </p>
    </article>
  );
}

/** Círculo do artista, usado em "Artistas em destaque". */
export function ArtistCard({
  artist,
  plays = 0,
}: {
  artist: Artist;
  plays?: number;
}) {
  return (
    <Link href={`/artista/${artist.id}`} className="group block text-center">
      <Avatar
        src={artist.image}
        seed={artist.id}
        name={artist.name}
        className="mx-auto aspect-square w-full transition-transform duration-300 group-hover:scale-[1.03]"
      />
      <h3 className="mt-3 truncate text-sm font-medium text-ink">
        {artist.name}
      </h3>
      <p className="mt-0.5 truncate text-xs text-ink-2">
        {formatPlays(plays)}
      </p>
    </Link>
  );
}

/** Linha de faixa em listas (álbum, playlist, curtidas, busca). */
export function TrackRow({
  track,
  index,
  context,
  showCover = true,
  showAlbum = true,
}: {
  track: HydratedTrack;
  index: number;
  context: HydratedTrack[];
  showCover?: boolean;
  showAlbum?: boolean;
}) {
  const p = usePlayer();
  const { play, following, note } = usePlayIntent();
  const isCurrent = p.current?.id === track.id;
  const isPlaying = isCurrent && p.playing;
  const liked = p.isLiked(track.id);

  return (
    <div
      className={cx(
        "group grid items-center gap-4 rounded-lg px-4 py-2 transition-colors hover:bg-surface",
        showAlbum
          ? "grid-cols-[24px_1fr_auto_auto_56px] md:grid-cols-[24px_1fr_minmax(0,0.8fr)_auto_auto_auto_56px]"
          : "grid-cols-[24px_1fr_auto_auto_56px] md:grid-cols-[24px_1fr_auto_auto_auto_56px]",
      )}
    >
      {/* índice / play */}
      <div className="relative grid h-6 w-6 place-items-center">
        <span
          className={cx(
            "text-sm tabular-nums transition-opacity group-hover:opacity-0",
            isCurrent ? "text-accent" : "text-ink-3",
          )}
        >
          {isPlaying ? (
            <I.EqualizerBars className="text-accent" />
          ) : (
            index + 1
          )}
        </span>
        <button
          type="button"
          onClick={() => play(track, context)}
          aria-label={
            following
              ? `Pedir ${track.title} no jam`
              : isPlaying
                ? `Pausar ${track.title}`
                : `Tocar ${track.title}`
          }
          title={following ? "Tocar a seguir no jam" : undefined}
          className="absolute inset-0 grid place-items-center text-ink opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          {isPlaying ? (
            <I.Pause className="h-4 w-4" />
          ) : following ? (
            <I.Next className="h-4 w-4" />
          ) : (
            <I.Play className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* título */}
      <div className="flex min-w-0 items-center gap-3">
        {showCover && (
          <Cover
            src={track.cover}
            seed={track.id}
            name={track.title}
            className="h-10 w-10"
          />
        )}
        <div className="min-w-0">
          <p
            className={cx(
              "truncate text-sm font-medium",
              isCurrent ? "text-accent" : "text-ink",
            )}
          >
            {track.title}
          </p>
          {note ? (
            // O aviso toma o lugar do artista por um instante: é a única
            // linha livre da fileira, e some antes de fazer falta.
            <p className="truncate text-xs text-dusk">{note}</p>
          ) : (
            track.artist && (
              <Link
                href={`/artista/${track.artist.id}`}
                className="truncate text-xs text-ink-2 hover:text-ink hover:underline"
              >
                {track.artist.name}
              </Link>
            )
          )}
        </div>
      </div>

      {showAlbum && (
        <p className="hidden truncate text-sm text-ink-2 md:block">
          {track.album?.title ?? "Single"}
        </p>
      )}

      {/* execuções: escondidas no mobile, onde a linha já está cheia */}
      <p
        className="hidden text-xs tabular-nums text-ink-3 md:block"
        title={`${formatNumber(track.plays)} execuções`}
      >
        {formatCompact(track.plays)}
      </p>

      <button
        type="button"
        onClick={() => p.like(track.id)}
        aria-label={liked ? "Remover das curtidas" : "Curtir"}
        aria-pressed={liked}
        className={cx(
          "transition-all",
          liked
            ? "text-accent opacity-100"
            : "text-ink-2 opacity-0 hover:text-ink group-hover:opacity-100 focus-visible:opacity-100",
        )}
      >
        {liked ? (
          <I.HeartFilled className="h-[18px] w-[18px]" />
        ) : (
          <I.Heart className="h-[18px] w-[18px]" />
        )}
      </button>

      <AddToPlaylistButton trackId={track.id} />

      <span className="text-right text-sm tabular-nums text-ink-3">
        {formatTime(track.duration)}
      </span>
    </div>
  );
}

/** Botão grande de play usado nos cabeçalhos de álbum/playlist/artista. */
export function PlayAllButton({
  tracks,
  label = "Ouvir agora",
}: {
  tracks: HydratedTrack[];
  label?: string;
}) {
  const p = usePlayer();
  const { play, following } = usePlayIntent();
  const playingThis =
    p.playing && tracks.some((t) => t.id === p.current?.id);

  if (tracks.length === 0) return null;

  return (
    <button
      type="button"
      onClick={() => {
        if (playingThis && !following) p.toggle();
        else play(tracks[0], tracks);
      }}
      className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-ink transition-all hover:scale-[1.03] hover:bg-accent-hover"
    >
      {playingThis ? (
        <I.Pause className="h-[18px] w-[18px]" />
      ) : (
        <I.Play className="h-[18px] w-[18px]" />
      )}
      {playingThis ? "Pausar" : label}
    </button>
  );
}

/**
 * Botão de aleatório dos cabeçalhos: embaralha a lista da página e começa
 * a tocar. Deixa o modo aleatório ligado, então a continuação também vem
 * embaralhada quando a lista acaba.
 */
export function ShuffleButton({
  tracks,
  label = "Aleatório",
}: {
  tracks: HydratedTrack[];
  label?: string;
}) {
  const p = usePlayer();
  if (tracks.length < 2) return null;

  return (
    <button
      type="button"
      onClick={() => p.playShuffled(tracks)}
      aria-label={`${label} — embaralhar e tocar`}
      className="inline-flex items-center gap-2 rounded-full border border-hairline px-5 py-3 text-sm font-semibold text-ink transition-all hover:scale-[1.03] hover:border-ink/60 hover:bg-surface"
    >
      <I.Shuffle className="h-[18px] w-[18px]" />
      {label}
    </button>
  );
}
