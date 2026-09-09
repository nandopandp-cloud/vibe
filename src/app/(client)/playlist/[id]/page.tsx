import { notFound } from "next/navigation";
import Link from "next/link";
import { hydrateAll, readDb } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { TrackList } from "@/components/client/TrackList";
import { PlayAllButton, ShuffleButton } from "@/components/client/TrackCard";
import { PageHeader } from "@/components/client/Section";
import { Cover } from "@/components/Cover";
import { formatTime } from "@/lib/utils";

export default async function PlaylistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await currentUser();
  const db = await readDb();
  const playlist = db.playlists.find((p) => p.id === id);
  if (!playlist) notFound();

  // Preserva a ordem definida na curadoria.
  const tracks = hydrateAll(
    db,
    playlist.trackIds
      .map((tid) => db.tracks.find((t) => t.id === tid))
      .filter((t): t is NonNullable<typeof t> => Boolean(t)),
    user?.id,
  );

  const total = tracks.reduce((s, t) => s + t.duration, 0);

  return (
    <div className="animate-rise px-6 pb-12 pt-2 md:px-8">
      <PageHeader
        eyebrow={playlist.editorial ? "Playlist do Sona" : "Playlist"}
        title={playlist.title}
        meta={
          <>
            {playlist.description && (
              <p className="mb-2 max-w-xl leading-relaxed">
                {playlist.description}
              </p>
            )}
            {tracks.length} faixa(s)
            {total > 0 && ` • ${formatTime(total)}`}
          </>
        }
        cover={
          <Cover
            src={playlist.cover}
            seed={playlist.id}
            name={playlist.title}
            rounded="rounded-xl"
            className="aspect-square w-full max-w-[220px] shadow-2xl shadow-black/40"
          />
        }
      >
        <PlayAllButton tracks={tracks} />
        <ShuffleButton tracks={tracks} />
      </PageHeader>

      <div className="mt-8">
        {tracks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-hairline px-6 py-12 text-center">
            <p className="text-sm text-ink-2">
              Esta playlist ainda não tem faixas.
            </p>
            <Link
              href="/studio/playlists"
              className="mt-4 inline-flex items-center rounded-full border border-hairline px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-ink-3"
            >
              Curar no Studio
            </Link>
          </div>
        ) : (
          <TrackList tracks={tracks} />
        )}
      </div>
    </div>
  );
}
