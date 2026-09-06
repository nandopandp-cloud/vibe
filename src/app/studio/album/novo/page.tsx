import Link from "next/link";
import { readDb } from "@/lib/db";
import { StudioHeader } from "@/components/studio/Form";
import { AlbumForm } from "@/components/studio/AlbumForm";
import * as I from "@/components/Icons";

export default async function NovoAlbumPage() {
  const db = await readDb();
  const artists = [...db.artists].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR"),
  );

  return (
    <>
      <Link
        href="/studio/album"
        className="mb-5 inline-flex items-center gap-2 text-sm text-ink-2 transition-colors hover:text-ink"
      >
        <I.ArrowLeft className="h-4 w-4" />
        Todos os álbuns
      </Link>
      <StudioHeader
        title="Publicar álbum"
        description="Envie o disco inteiro de uma vez: a capa, os dados do álbum e todas as faixas na ordem."
      />
      <AlbumForm artists={artists} />
    </>
  );
}
