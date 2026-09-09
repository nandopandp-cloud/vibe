import { notFound } from "next/navigation";
import Link from "next/link";
import { hydrateAll, readDb } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { TrackList } from "@/components/client/TrackList";
import { PlayAllButton, ShuffleButton } from "@/components/client/TrackCard";
import { PageHeader } from "@/components/client/Section";
import { Cover } from "@/components/Cover";
import { formatPlays, formatTime } from "@/lib/utils";

export default async function AlbumPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await currentUser();
  const db = await readDb();
  const album = db.albums.find((a) => a.id === id);
  if (!album) notFound();

  const artist = db.artists.find((a) => a.id === album.artistId);
  const tracks = hydrateAll(
    db,
    db.tracks
      .filter((t) => t.albumId === id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    user?.id,
  );
  const total = tracks.reduce((s, t) => s + t.duration, 0);
  const plays = tracks.reduce((s, t) => s + t.plays, 0);

  return (
    <div className="animate-rise px-6 pb-12 pt-2 md:px-8">
      <PageHeader
        eyebrow="Álbum"
        title={album.title}
        meta={
          <>
            {artist && (
              <Link
                href={`/artista/${artist.id}`}
                className="font-medium text-ink hover:underline"
              >
                {artist.name}
              </Link>
            )}
            {" • "}
            {album.year} • {tracks.length} faixa(s)
            {total > 0 && ` • ${formatTime(total)}`}
            {` • ${formatPlays(plays)}`}
          </>
        }
        cover={
          <Cover
            src={album.cover}
            seed={album.id}
            name={album.title}
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
          <p className="rounded-xl border border-dashed border-hairline px-6 py-12 text-center text-sm text-ink-2">
            Este álbum ainda não tem faixas publicadas.
          </p>
        ) : (
          <TrackList tracks={tracks} showAlbum={false} showCover={false} />
        )}
      </div>
    </div>
  );
}
