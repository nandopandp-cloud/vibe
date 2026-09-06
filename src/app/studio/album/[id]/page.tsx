import { notFound } from "next/navigation";
import Link from "next/link";
import { readDb } from "@/lib/db";
import { StudioHeader } from "@/components/studio/Form";
import { AlbumForm, type AlbumEdicao } from "@/components/studio/AlbumForm";
import * as I from "@/components/Icons";

export default async function EditarAlbumPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = await readDb();
  const album = db.albums.find((a) => a.id === id);
  if (!album) notFound();

  const artists = [...db.artists].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR"),
  );

  const faixas = db.tracks
    .filter((t) => t.albumId === album.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const inicial: AlbumEdicao = {
    id: album.id,
    title: album.title,
    artistId: album.artistId,
    // O gênero vive na faixa; o álbum herda o da primeira.
    genre: faixas[0]?.genre ?? "",
    year: album.year,
    cover: album.cover,
    tracks: faixas.map((t) => ({
      id: t.id,
      title: t.title,
      duration: t.duration,
    })),
  };

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
        title={`Editar “${album.title}”`}
        description="Altere os dados do disco, renomeie e reordene as faixas, acrescente novas ou remova as que não devem mais aparecer."
      />
      {/* key força o editor a recarregar ao trocar de álbum */}
      <AlbumForm key={album.id} artists={artists} album={inicial} />
    </>
  );
}
