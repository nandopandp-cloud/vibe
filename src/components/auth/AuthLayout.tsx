import Link from "next/link";
import { Logo } from "../Brand";
import { AuthScene } from "./AuthScene";
import * as I from "../Icons";

const PERKS = [
  { icon: I.Music, lines: ["Milhões", "de músicas"] },
  { icon: I.Users, lines: ["Artistas", "incríveis"] },
  { icon: I.Heart, lines: ["Playlists", "para todo momento"] },
  { icon: I.Globe, lines: ["Em qualquer", "lugar"] },
];

/**
 * Moldura das telas de acesso: painel editorial à esquerda e formulário
 * à direita, como na referência. No mobile o painel some e sobra o formulário.
 */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-void p-0 lg:p-6">
      <div className="grid min-h-dvh overflow-hidden rounded-none bg-canvas lg:min-h-[calc(100dvh-3rem)] lg:grid-cols-2 lg:rounded-2xl">
        {/* ---------------- painel editorial ---------------- */}
        <aside className="relative hidden flex-col justify-between overflow-hidden p-10 lg:flex">
          <AuthScene className="absolute inset-0 h-full w-full" />

          <div className="relative flex items-start justify-between gap-6">
            <Link href="/" aria-label="Sona — início">
              <Logo />
            </Link>
            <div className="pt-1 text-right">
              <p className="text-[10px] uppercase leading-relaxed tracking-[0.28em] text-ink-2">
                Música
                <br />
                conecta
                <br />
                pessoas
              </p>
              <div className="ml-auto mt-3 h-px w-8 bg-ink-3" />
            </div>
          </div>

          {/* Véu local: garante contraste do texto sobre a parte clara do
              pôr do sol, sem apagar a cena inteira. */}
          <div
            className="pointer-events-none absolute inset-x-0 top-1/4 h-3/4"
            style={{
              background:
                "linear-gradient(180deg,transparent,rgba(4,6,11,.30) 30%,rgba(4,6,11,.62) 62%,rgba(4,6,11,.80) 100%)",
            }}
          />

          <div className="relative max-w-md">
            <h2 className="text-4xl font-bold leading-[1.12] tracking-tight text-ink xl:text-5xl">
              As melhores
              <br />
              músicas sempre
              <br />
              com você.
            </h2>
            <p className="mt-6 text-[11px] uppercase leading-loose tracking-[0.2em] text-ink">
              Descubra artistas.
              <br />
              Viva novas histórias.
              <br />
              Sona sempre com você.
            </p>
            <div className="mt-6 h-px w-10 bg-ink-3" />
          </div>

          <ul className="relative grid grid-cols-4 gap-4">
            {PERKS.map(({ icon: Icon, lines }) => (
              <li key={lines.join()}>
                <Icon className="h-[22px] w-[22px] text-ink" />
                <p className="mt-3 text-[10px] uppercase leading-relaxed tracking-[0.16em] text-ink-2">
                  {lines[0]}
                  <br />
                  {lines[1]}
                </p>
              </li>
            ))}
          </ul>
        </aside>

        {/* ---------------- formulário ---------------- */}
        <main className="flex flex-col justify-center bg-sidebar px-6 py-12 sm:px-12 lg:px-14">
          <div className="mx-auto w-full max-w-[420px]">
            {/* No mobile, a marca aparece aqui no topo */}
            <div className="mb-10 lg:hidden">
              <Logo />
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
