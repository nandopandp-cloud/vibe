import { readDb } from "@/lib/db";
import { ArtistCard } from "@/components/client/TrackCard";
import { CardGrid, EmptyState } from "@/components/client/Section";
import * as I from "@/components/Icons";

export default async function ArtistsPage() {
  const db = await readDb();
  const artists = [...db.artists].sort(
    (a, b) => b.monthlyListeners - a.monthlyListeners,
  );

  return (
    <div className="animate-rise px-6 pb-12 pt-2 md:px-8">
      <h1 className="mb-6 text-3xl font-bold tracking-tight text-ink">
        Seus Artistas
      </h1>

      {artists.length === 0 ? (
        <EmptyState
          icon={<I.User className="h-6 w-6" />}
          title="Nenhum artista no catálogo"
          description="Os artistas aparecem aqui conforme as faixas são publicadas no Sona Studio."
          action={{ href: "/studio/artistas", label: "Cadastrar artista" }}
        />
      ) : (
        <CardGrid>
          {artists.map((a) => (
            <ArtistCard key={a.id} artist={a} />
          ))}
        </CardGrid>
      )}
    </div>
  );
}
