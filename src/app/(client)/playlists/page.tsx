import Link from "next/link";
import { readDb } from "@/lib/db";
import { CardGrid, EmptyState } from "@/components/client/Section";
import { Cover } from "@/components/Cover";
import * as I from "@/components/Icons";

export default async function PlaylistsPage() {
  const db = await readDb();
  const playlists = [...db.playlists].sort((a, b) =>
    a.title.localeCompare(b.title, "pt-BR"),
  );

  return (
    <div className="animate-rise px-6 pb-12 pt-2 md:px-8">
      <h1 className="mb-6 text-3xl font-bold tracking-tight text-ink">
        Playlists
      </h1>

      {playlists.length === 0 ? (
        <EmptyState
          icon={<I.Playlist className="h-6 w-6" />}
          title="Nenhuma playlist ainda"
          description="As seleções montadas no Sona Studio aparecem aqui para os ouvintes."
          action={{ href: "/studio/playlists", label: "Criar playlist" }}
        />
      ) : (
        <CardGrid>
          {playlists.map((pl) => (
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
                {pl.trackIds.length} faixa(s)
              </p>
            </Link>
          ))}
        </CardGrid>
      )}
    </div>
  );
}
