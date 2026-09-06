import { readDb } from "@/lib/db";
import { StudioHeader } from "@/components/studio/Form";
import { UploadForm } from "@/components/studio/UploadForm";

export default async function UploadPage() {
  const db = await readDb();
  const artists = [...db.artists].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR"),
  );

  return (
    <>
      <StudioHeader
        title="Publicar faixa"
        description="Envie o áudio, defina os dados e a faixa entra no catálogo do Sona na hora. Para um disco inteiro, use Publicar álbum."
      />
      <UploadForm artists={artists} />
    </>
  );
}
