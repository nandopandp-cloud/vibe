import Link from "next/link";
import { hydrateAll, readDb, playsByArtist } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { TrackList } from "@/components/client/TrackList";
import { ArtistCard } from "@/components/client/TrackCard";
import { CardGrid, EmptyState, Section } from "@/components/client/Section";
import { Cover } from "@/components/Cover";
import { foldText, gradientFor } from "@/lib/utils";
import * as I from "@/components/Icons";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const needle = foldText(q.trim());
  const user = await currentUser();
  const db = await readDb();

  // Sem busca ativa, mostramos os gêneros do catálogo como atalhos.
  if (!needle) {
    const genres = [...new Set(db.tracks.map((t) => t.genre).filter(Boolean))];

    return (
      <div className="px-6 pb-12 pt-2 md:px-8">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Buscar</h1>
        {genres.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              icon={<I.Search className="h-6 w-6" />}
              title="Nada para buscar ainda"
              description="Quando houver faixas no catálogo, você poderá procurar por título, artista ou gênero."
              action={{ href: "/studio/upload", label: "Publicar faixa" }}
            />
          </div>
        ) : (
          <Section title="Explorar por gênero">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {genres.map((g) => (
                <Link
                  key={g}
                  href={`/buscar?q=${encodeURIComponent(g)}`}
                  className="relative aspect-[16/9] overflow-hidden rounded-xl p-4 transition-transform hover:scale-[1.02]"
                  style={{ background: gradientFor(g) }}
                >
                  <span className="text-lg font-bold text-white drop-shadow">
                    {g}
                  </span>
                </Link>
              ))}
            </div>
          </Section>
        )}
      </div>
    );
  }

  const matches = (s: string | undefined) =>
    foldText(s ?? "").includes(needle);

  const plays = playsByArtist(db);
  const artists = db.artists.filter(
    (a) => matches(a.name) || matches(a.bio),
  );
  const artistIds = new Set(artists.map((a) => a.id));

  const tracks = hydrateAll(
    db,
    db.tracks.filter(
      (t) =>
        matches(t.title) ||
        matches(t.genre) ||
        artistIds.has(t.artistId) ||
        matches(db.artists.find((a) => a.id === t.artistId)?.name),
    ),
    user?.id,
  );

  const playlists = db.playlists.filter(
    (p) => matches(p.title) || matches(p.description),
  );

  const empty =
    tracks.length === 0 && artists.length === 0 && playlists.length === 0;

  return (
    <div className="animate-rise px-6 pb-12 pt-2 md:px-8">
      <h1 className="text-2xl font-bold tracking-tight text-ink">
        Resultados para “{q}”
      </h1>

      {empty ? (
        <div className="mt-6">
          <EmptyState
            icon={<I.Search className="h-6 w-6" />}
            title={`Nada encontrado para “${q}”`}
            description="Verifique a grafia ou tente outro termo — busque por título, artista, gênero ou playlist."
          />
        </div>
      ) : (
        <>
          {tracks.length > 0 && (
            <Section title="Músicas">
              <TrackList tracks={tracks} />
            </Section>
          )}

          {artists.length > 0 && (
            <Section title="Artistas">
              <CardGrid>
                {artists.map((a) => (
                  <ArtistCard key={a.id} artist={a} plays={plays.get(a.id) ?? 0} />
                ))}
              </CardGrid>
            </Section>
          )}

          {playlists.length > 0 && (
            <Section title="Playlists">
              <CardGrid>
                {playlists.map((pl) => (
                  <Link key={pl.id} href={`/playlist/${pl.id}`} className="group">
                    <Cover
                      src={pl.cover}
                      seed={pl.id}
                      name={pl.title}
                      className="aspect-square w-full transition-transform group-hover:scale-[1.02]"
                    />
                    <h3 className="mt-3 truncate text-sm font-medium text-ink">
                      {pl.title}
                    </h3>
                    <p className="truncate text-xs text-ink-2">
                      {pl.trackIds.length} faixa(s)
                    </p>
                  </Link>
                ))}
              </CardGrid>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
