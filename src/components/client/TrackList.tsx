"use client";

import { TrackRow } from "./TrackCard";
import type { HydratedTrack } from "@/lib/types";

/** Lista de faixas com cabeçalho de colunas. */
export function TrackList({
  tracks,
  showAlbum = true,
  showCover = true,
}: {
  tracks: HydratedTrack[];
  showAlbum?: boolean;
  showCover?: boolean;
}) {
  if (tracks.length === 0) return null;

  return (
    <div>
      <div
        className={
          showAlbum
            ? "grid grid-cols-[24px_1fr_minmax(0,0.8fr)_auto_56px] gap-4 border-b border-hairline px-4 pb-2 text-xs uppercase tracking-wider text-ink-3"
            : "grid grid-cols-[24px_1fr_auto_56px] gap-4 border-b border-hairline px-4 pb-2 text-xs uppercase tracking-wider text-ink-3"
        }
      >
        <span>#</span>
        <span>Título</span>
        {showAlbum && <span>Álbum</span>}
        <span />
        <span className="text-right">Duração</span>
      </div>

      <div className="mt-2">
        {tracks.map((track, i) => (
          <TrackRow
            key={track.id}
            track={track}
            index={i}
            context={tracks}
            showAlbum={showAlbum}
            showCover={showCover}
          />
        ))}
      </div>
    </div>
  );
}
