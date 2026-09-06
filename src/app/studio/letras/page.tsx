import Link from "next/link";
import { hydrate, readDb, recentTracks } from "@/lib/db";
import { StudioHeader } from "@/components/studio/Form";
import { LyricsEditor } from "@/components/studio/LyricsEditor";
import { Cover } from "@/components/Cover";
import { cx } from "@/lib/utils";
import * as I from "@/components/Icons";

export default async function LyricsPage({
  searchParams,
}: {
  searchParams: Promise<{ track?: string }>;
}) {
  const { track: trackId } = await searchParams;
  const db = await readDb();
  const tracks = recentTracks(db);

  const selected = trackId
    ? (db.tracks.find((t) => t.id === trackId) ?? null)
    : null;

  return (
    <>
      <StudioHeader
        title="Letras sincronizadas"
        description="Marque o tempo de cada verso para a letra acender junto com a música na tela do ouvinte."
      />

      {tracks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-hairline px-6 py-14 text-center">
          <p className="text-sm text-ink-2">
            Publique uma faixa antes de escrever a letra.
          </p>
          <Link
            href="/studio/upload"
            className="mt-4 inline-flex items-center rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink"
          >
            Publicar faixa
          </Link>
        </div>
      ) : !selected ? (
        <section>
          <h2 className="mb-3 text-sm font-medium text-ink-2">
            Escolha a faixa para editar
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {tracks.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/studio/letras?track=${t.id}`}
                  className="flex items-center gap-3 rounded-xl border border-hairline bg-surface/60 p-3 transition-colors hover:border-ink-3 hover:bg-surface"
                >
                  <Cover
                    src={t.cover}
                    seed={t.id}
                    name={t.title}
                    className="h-12 w-12"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      {t.title}
                    </span>
                    <span className="block truncate text-xs text-ink-2">
                      {t.artist?.name}
                    </span>
                  </span>
                  <span
                    className={cx(
                      "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                      t.lyrics.length > 0
                        ? "bg-accent/10 text-accent"
                        : "bg-surface-3 text-ink-2",
                    )}
                  >
                    {t.lyrics.length > 0
                      ? `${t.lyrics.length} versos`
                      : "sem letra"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <>
          <Link
            href="/studio/letras"
            className="mb-5 inline-flex items-center gap-2 text-sm text-ink-2 transition-colors hover:text-ink"
          >
            <I.ArrowLeft className="h-4 w-4" />
            Trocar de faixa
          </Link>
          <LyricsEditor key={selected.id} track={hydrate(db, selected)} />
        </>
      )}
    </>
  );
}
