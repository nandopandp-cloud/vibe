import { readDb } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { ArtistCard } from "@/components/client/TrackCard";
import { CardGrid, EmptyState, Section } from "@/components/client/Section";
import * as I from "@/components/Icons";

export default async function ArtistsPage() {
  const user = await currentUser();
  const db = await readDb();

  const savedIds = new Set(user ? (db.following[user.id] ?? []) : []);
  const byListeners = (a: { monthlyListeners: number }, b: typeof a) =>
    b.monthlyListeners - a.monthlyListeners;

  const saved = db.artists.filter((a) => savedIds.has(a.id)).sort(byListeners);
  // O resto do catálogo continua à mão, para descobrir quem seguir.
  const rest = db.artists.filter((a) => !savedIds.has(a.id)).sort(byListeners);

  return (
    <div className="animate-rise px-6 pb-12 pt-2 md:px-8">
      <h1 className="mb-6 text-3xl font-bold tracking-tight text-ink">
        Seus Artistas
      </h1>

      {db.artists.length === 0 ? (
        <EmptyState
          icon={<I.User className="h-6 w-6" />}
          title="Nenhum artista no catálogo"
          description="Os artistas aparecem aqui conforme as faixas são publicadas no Sona Studio."
          action={{ href: "/studio/artistas", label: "Cadastrar artista" }}
        />
      ) : saved.length === 0 ? (
        <>
          <div className="rounded-xl border border-dashed border-hairline px-6 py-10 text-center">
            <p className="text-sm text-ink-2">
              Você ainda não salvou nenhum artista.
            </p>
            <p className="mt-1 text-xs text-ink-3">
              Abra um artista e toque em “Salvar artista” para vê-lo aqui.
            </p>
          </div>

          <Section title="No catálogo">
            <CardGrid>
              {rest.map((a) => (
                <ArtistCard key={a.id} artist={a} />
              ))}
            </CardGrid>
          </Section>
        </>
      ) : (
        <>
          <CardGrid>
            {saved.map((a) => (
              <ArtistCard key={a.id} artist={a} />
            ))}
          </CardGrid>

          {rest.length > 0 && (
            <Section title="Descubra mais">
              <CardGrid>
                {rest.map((a) => (
                  <ArtistCard key={a.id} artist={a} />
                ))}
              </CardGrid>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
