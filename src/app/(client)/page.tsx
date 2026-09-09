import Link from "next/link";
import { hydrate, playsByArtist, readDb, recentTracks } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { Hero } from "@/components/client/Hero";
import { ArtistCard, TrackCard } from "@/components/client/TrackCard";
import { CardGrid, EmptyState, Section } from "@/components/client/Section";
import { Cover } from "@/components/Cover";
import * as I from "@/components/Icons";

export default async function HomePage() {
  const user = await currentUser();
  const db = await readDb();
  const tracks = recentTracks(db, user?.id);

  if (tracks.length === 0) {
    return (
      <div className="px-6 pb-12 pt-4 md:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-ink">
            Bem-vindo ao Sona
          </h1>
          <p className="mt-2 text-sm text-ink-2">
            Sua plataforma de streaming — ainda sem nenhuma faixa publicada.
          </p>
        </div>
        <EmptyState
          icon={<I.Music className="h-6 w-6" />}
          title="O catálogo está vazio"
          description="Publique a primeira faixa no Sona Studio: envie o arquivo de áudio, a capa e os dados do artista. Assim que publicar, ela aparece aqui para os ouvintes."
          action={{ href: "/studio/upload", label: "Publicar primeira faixa" }}
        />
      </div>
    );
  }

  const featured =
    (db.spotlight.trackId
      ? tracks.find((t) => t.id === db.spotlight.trackId)
      : null) ?? tracks[0];

  const plays = playsByArtist(db);
  const byPlays = (a: { id: string }, b: { id: string }) =>
    (plays.get(b.id) ?? 0) - (plays.get(a.id) ?? 0);

  const featuredArtists = db.artists.filter((a) => a.featured).sort(byPlays);

  // Sem destaques marcados, mostramos quem mais tocou.
  const artists = (
    featuredArtists.length > 0 ? featuredArtists : [...db.artists].sort(byPlays)
  ).slice(0, 6);

  const editorial = db.playlists.filter((p) => p.editorial).slice(0, 6);

  const mostPlayed = [...tracks]
    .filter((t) => t.plays > 0)
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 6);

  return (
    <div className="animate-rise space-y-2 px-6 pb-12 pt-2 md:px-8">
      <Hero track={featured} spotlight={db.spotlight} context={tracks} />

      <Section title="Lançamentos recentes" href="/biblioteca">
        <CardGrid>
          {tracks.slice(0, 6).map((track) => (
            <TrackCard key={track.id} track={track} context={tracks} />
          ))}
        </CardGrid>
      </Section>

      {artists.length > 0 && (
        <Section title="Artistas em destaque" href="/artistas">
          <CardGrid>
            {artists.map((artist) => (
              <ArtistCard
                key={artist.id}
                artist={artist}
                plays={plays.get(artist.id) ?? 0}
              />
            ))}
          </CardGrid>
        </Section>
      )}

      {mostPlayed.length > 0 && (
        <Section title="As mais tocadas">
          <CardGrid>
            {mostPlayed.map((track) => (
              <TrackCard key={track.id} track={track} context={mostPlayed} />
            ))}
          </CardGrid>
        </Section>
      )}

      {editorial.length > 0 && (
        <Section title="Playlists do Sona" href="/playlists">
          <CardGrid>
            {editorial.map((pl) => {
              const plTracks = pl.trackIds
                .map((id) => db.tracks.find((t) => t.id === id))
                .filter((t): t is NonNullable<typeof t> => Boolean(t))
                .map((t) => hydrate(db, t, user?.id));
              return (
                <Link key={pl.id} href={`/playlist/${pl.id}`} className="group">
                  <Cover
                    src={pl.cover}
                    seed={pl.id}
                    name={pl.title}
                    className="aspect-square w-full transition-transform duration-300 group-hover:scale-[1.02]"
                  />
                  <h3 className="mt-3 truncate text-sm font-medium text-ink">
                    {pl.title}
                  </h3>
                  <p className="mt-0.5 truncate text-xs text-ink-2">
                    {plTracks.length} faixa{plTracks.length === 1 ? "" : "s"}
                  </p>
                </Link>
              );
            })}
          </CardGrid>
        </Section>
      )}
    </div>
  );
}
