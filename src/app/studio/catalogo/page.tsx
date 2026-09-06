import Link from "next/link";
import { readDb, recentTracks } from "@/lib/db";
import { StudioHeader } from "@/components/studio/Form";
import { CatalogTable } from "@/components/studio/CatalogTable";
import * as I from "@/components/Icons";

export default async function CatalogPage() {
  const db = await readDb();
  const tracks = recentTracks(db);
  const artists = [...db.artists].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR"),
  );

  return (
    <>
      <StudioHeader
        title="Catálogo"
        description="Todas as faixas publicadas no Sona. Edite os dados, troque arquivos ou remova o que não deve mais aparecer."
        action={
          <Link
            href="/studio/upload"
            className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink transition-all hover:scale-[1.02] hover:bg-accent-hover"
          >
            <I.Upload className="h-4 w-4" />
            Publicar faixa
          </Link>
        }
      />
      <CatalogTable tracks={tracks} artists={artists} albums={db.albums} />
    </>
  );
}
