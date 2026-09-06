import Link from "next/link";
import { readDb, recentTracks } from "@/lib/db";
import { StudioHeader } from "@/components/studio/Form";
import { SpotlightForm } from "@/components/studio/SpotlightForm";
import { Cover } from "@/components/Cover";
import { formatListeners } from "@/lib/utils";
import * as I from "@/components/Icons";

export default async function SpotlightPage() {
  const db = await readDb();
  const tracks = recentTracks(db);
  const featured = db.artists.filter((a) => a.featured);

  return (
    <>
      <StudioHeader
        title="Destaques da home"
        description="Escolha a faixa do banner principal e veja quem está na vitrine de artistas."
      />

      {tracks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-hairline px-6 py-14 text-center">
          <p className="text-sm text-ink-2">
            Publique uma faixa para poder destacá-la na home.
          </p>
          <Link
            href="/studio/upload"
            className="mt-4 inline-flex items-center rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink"
          >
            Publicar faixa
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          <SpotlightForm spotlight={db.spotlight} tracks={tracks} />

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">
                Artistas em destaque
              </h2>
              <Link
                href="/studio/artistas"
                className="text-sm text-ink-2 transition-colors hover:text-ink"
              >
                Gerenciar
              </Link>
            </div>

            {featured.length === 0 ? (
              <p className="rounded-xl border border-dashed border-hairline px-6 py-10 text-center text-sm text-ink-2">
                Nenhum artista em destaque. Sem marcações, a home lista os
                artistas com mais ouvintes.
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {featured.map((a) => (
                  <li key={a.id} className="text-center">
                    <Cover
                      src={a.image}
                      seed={a.id}
                      name={a.name}
                      rounded="rounded-full"
                      className="mx-auto aspect-square w-full"
                    />
                    <p className="mt-2 truncate text-sm text-ink">{a.name}</p>
                    <p className="truncate text-xs text-ink-2">
                      {formatListeners(a.monthlyListeners)} ouvintes
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-hairline bg-surface/40 p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-2">
                <I.Sparkle className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h3 className="text-sm font-medium text-ink">
                  Como a home é montada
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">
                  O banner usa a faixa escolhida aqui. “Lançamentos recentes”
                  mostra as últimas publicadas, “Artistas em destaque” usa as
                  marcações desta página e “Playlists do Sona” traz as playlists
                  marcadas como editoriais.
                </p>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
