import { readDb, recentTracks } from "@/lib/db";
import { TrackList } from "@/components/client/TrackList";
import { PlayAllButton } from "@/components/client/TrackCard";
import { EmptyState } from "@/components/client/Section";
import * as I from "@/components/Icons";

export default async function LibraryPage() {
  const db = await readDb();
  const tracks = recentTracks(db);

  return (
    <div className="animate-rise px-6 pb-12 pt-2 md:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">
            Biblioteca
          </h1>
          <p className="mt-1.5 text-sm text-ink-2">
            {tracks.length === 0
              ? "Todo o catálogo do Sona aparece aqui."
              : `${tracks.length} faixa(s) no catálogo`}
          </p>
        </div>
        <PlayAllButton tracks={tracks} label="Tocar tudo" />
      </header>

      {tracks.length === 0 ? (
        <EmptyState
          icon={<I.Library className="h-6 w-6" />}
          title="Biblioteca vazia"
          description="Nenhuma faixa foi publicada ainda. Envie a primeira pelo Sona Studio para o catálogo começar a ganhar corpo."
          action={{ href: "/studio/upload", label: "Publicar faixa" }}
        />
      ) : (
        <TrackList tracks={tracks} />
      )}
    </div>
  );
}
