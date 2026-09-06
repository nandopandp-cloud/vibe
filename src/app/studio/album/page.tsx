import { readDb } from "@/lib/db";
import { StudioHeader } from "@/components/studio/Form";
import { AlbumForm } from "@/components/studio/AlbumForm";

export default async function NovoAlbumPage() {
  const db = await readDb();
  const artists = [...db.artists].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR"),
  );

  return (
    <>
      <StudioHeader
        title="Publicar álbum"
        description="Envie o disco inteiro de uma vez: a capa, os dados do álbum e todas as faixas na ordem."
      />
      <AlbumForm artists={artists} />
    </>
  );
}
