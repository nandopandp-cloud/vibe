import Link from "next/link";
import { readDb } from "@/lib/db";
import { StudioHeader } from "@/components/studio/Form";
import { AlbumList, type AlbumResumo } from "@/components/studio/AlbumList";
import * as I from "@/components/Icons";

export default async function AlbunsStudioPage() {
  const db = await readDb();

  const albums: AlbumResumo[] = [...db.albums]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((al) => {
      const faixas = db.tracks.filter((t) => t.albumId === al.id);
      return {
        id: al.id,
        title: al.title,
        artistName:
          db.artists.find((a) => a.id === al.artistId)?.name ?? "—",
        cover: al.cover,
        year: al.year,
        trackCount: faixas.length,
        duration: faixas.reduce((s, t) => s + t.duration, 0),
      };
    });

  return (
    <>
      <StudioHeader
        title="Álbuns"
        description="Discos publicados no Sona. Abra um para renomear, reordenar, adicionar ou remover faixas."
        action={
          <Link
            href="/studio/album/novo"
            className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink transition-all hover:scale-[1.02] hover:bg-accent-hover"
          >
            <I.Plus className="h-4 w-4" />
            Publicar álbum
          </Link>
        }
      />
      <AlbumList albums={albums} />
    </>
  );
}
