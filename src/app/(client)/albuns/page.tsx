import Link from "next/link";
import { playsByAlbum, readDb } from "@/lib/db";
import { CardGrid, EmptyState } from "@/components/client/Section";
import { Cover } from "@/components/Cover";
import * as I from "@/components/Icons";
import { formatPlays } from "@/lib/utils";

export default async function AlbumsPage() {
  const db = await readDb();
  const albums = [...db.albums].sort((a, b) => b.year - a.year);
  const plays = playsByAlbum(db);

  return (
    <div className="animate-rise px-6 pb-12 pt-2 md:px-8">
      <h1 className="mb-6 text-3xl font-bold tracking-tight text-ink">Álbuns</h1>

      {albums.length === 0 ? (
        <EmptyState
          icon={<I.Album className="h-6 w-6" />}
          title="Nenhum álbum publicado"
          description="Faixas publicadas sem álbum entram como singles e aparecem na Biblioteca."
          action={{ href: "/biblioteca", label: "Ver a biblioteca" }}
        />
      ) : (
        <CardGrid>
          {albums.map((al) => {
            const artist = db.artists.find((a) => a.id === al.artistId);
            return (
              <Link key={al.id} href={`/album/${al.id}`} className="group">
                <Cover
                  src={al.cover}
                  seed={al.id}
                  name={al.title}
                  className="aspect-square w-full transition-transform duration-300 group-hover:scale-[1.02]"
                />
                <h3 className="mt-3 truncate text-sm font-medium text-ink">
                  {al.title}
                </h3>
                <p className="mt-0.5 truncate text-xs text-ink-2">
                  {artist?.name} • {al.year}
                </p>
                <p className="mt-0.5 truncate text-xs text-ink-3">
                  {formatPlays(plays.get(al.id) ?? 0)}
                </p>
              </Link>
            );
          })}
        </CardGrid>
      )}
    </div>
  );
}
