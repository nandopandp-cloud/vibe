import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { findJamByCode, readJamSnapshot } from "@/lib/db";
import { JoinJam } from "@/components/client/JoinJam";
import * as I from "@/components/Icons";

export const metadata = { title: "Entrar num jam — Sona" };

/**
 * A porta de entrada do link compartilhado.
 *
 * Entrar é uma escrita, então não acontece no render: a página mostra
 * quem está na sala e espera um clique. Um GET que muda estado entraria
 * no jam sozinho a cada prefetch do navegador.
 */
export default async function JamInvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const user = await currentUser();
  if (!user) redirect(`/entrar?next=/jam/${code}`);

  const jam = await findJamByCode(code);
  if (!jam) {
    return (
      <div className="animate-rise grid place-items-center px-6 py-24">
        <div className="max-w-sm text-center">
          <I.Jam className="mx-auto h-9 w-9 text-ink-3" />
          <h1 className="mt-4 text-xl font-semibold text-ink">
            Este jam não está mais acontecendo
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">
            O anfitrião encerrou a sala, ou o link está errado. Você pode
            abrir um jam seu e chamar quem quiser.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    );
  }

  // Já está dentro: não faz sentido pedir para entrar de novo.
  const snapshot = await readJamSnapshot(jam.id, user.id);
  if (snapshot?.participants.some((p) => p.id === user.id)) redirect("/");

  return (
    <JoinJam
      code={jam.code}
      name={jam.name}
      participants={snapshot?.participants ?? []}
      nowPlaying={snapshot?.queue[snapshot.index] ?? null}
    />
  );
}
