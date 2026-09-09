import { notFound } from "next/navigation";
import { hydrateAll, playsByAlbum, readDb } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { TrackList } from "@/components/client/TrackList";
import { PlayAllButton, ShuffleButton } from "@/components/client/TrackCard";
import { FollowButton } from "@/components/client/FollowButton";
import { Section } from "@/components/client/Section";
import { Avatar, Cover } from "@/components/Cover";
import Link from "next/link";
import { formatPlays } from "@/lib/utils";

export default async function ArtistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await currentUser();
  const db = await readDb();
  const artist = db.artists.find((a) => a.id === id);
  if (!artist) notFound();

  const tracks = hydrateAll(
    db,
    db.tracks
      .filter((t) => t.artistId === id)
      .sort((a, b) => b.plays - a.plays),
    user?.id,
  );

  const albums = db.albums.filter((al) => al.artistId === id);
  const albumPlays = playsByAlbum(db);
  const isFollowing = user
    ? (db.following[user.id]?.includes(artist.id) ?? false)
    : false;
  const totalPlays = tracks.reduce((s, t) => s + t.plays, 0);

  return (
    <div className="animate-rise pb-12">
      {/* cabeçalho com fundo da foto */}
      <header className="relative">
        <div className="absolute inset-0 overflow-hidden">
          {artist.image ? (
            <div
              className="h-full w-full scale-110 bg-cover bg-center opacity-40 blur-2xl"
              style={{ backgroundImage: `url(${artist.image})` }}
            />
          ) : (
            <div className="h-full w-full bg-surface" />
          )}
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-canvas" />

        <div className="relative flex flex-col gap-6 px-6 pb-8 pt-10 md:flex-row md:items-end md:px-8">
          <Avatar
            src={artist.image}
            seed={artist.id}
            name={artist.name}
            className="h-40 w-40 shadow-2xl shadow-black/50 md:h-52 md:w-52"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-ink-2">
              Artista
            </p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight text-ink md:text-6xl">
              {artist.name}
            </h1>
            <p className="mt-3 text-sm text-ink-2">
              {formatPlays(totalPlays)} • {tracks.length} faixa(s)
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <PlayAllButton tracks={tracks} />
              <ShuffleButton tracks={tracks} />
              {user && (
                <FollowButton artistId={artist.id} following={isFollowing} />
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="px-6 md:px-8">
        {tracks.length > 0 ? (
          <Section title="Populares" className="mt-2">
            <TrackList tracks={tracks} showAlbum={false} />
          </Section>
        ) : (
          <p className="mt-6 rounded-xl border border-dashed border-hairline px-6 py-12 text-center text-sm text-ink-2">
            Nenhuma faixa deste artista foi publicada ainda.
          </p>
        )}

        {albums.length > 0 && (
          <Section title="Álbuns">
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
              {albums.map((al) => (
                <Link key={al.id} href={`/album/${al.id}`} className="group">
                  <Cover
                    src={al.cover}
                    seed={al.id}
                    name={al.title}
                    className="aspect-square w-full transition-transform group-hover:scale-[1.02]"
                  />
                  <h3 className="mt-3 truncate text-sm font-medium text-ink">
                    {al.title}
                  </h3>
                  <p className="truncate text-xs text-ink-2">
                    {al.year} • {formatPlays(albumPlays.get(al.id) ?? 0)}
                  </p>
                </Link>
              ))}
            </div>
          </Section>
        )}

        {artist.bio && (
          <Section title="Sobre">
            <div className="max-w-3xl rounded-xl bg-surface/60 p-6">
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink-2">
                {artist.bio}
              </p>
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
