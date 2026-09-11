"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserAvatar } from "./UserMenu";
import { Cover } from "../Cover";
import { joinJamByCode } from "@/lib/jam-actions";
import * as I from "../Icons";
import type { HydratedTrack, JamParticipant } from "@/lib/types";

/**
 * O convite aberto pelo link: mostra a sala antes de entrar nela.
 *
 * Ver quem está lá e o que está tocando é o que transforma um código de
 * seis letras em algo que se aceita — e é também o aviso honesto de que
 * entrar vai tirar você do que estava ouvindo.
 */
export function JoinJam({
  code,
  name,
  participants,
  nowPlaying,
}: {
  code: string;
  name: string;
  participants: JamParticipant[];
  nowPlaying: HydratedTrack | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const host = participants.find((p) => p.isHost);

  return (
    <div className="animate-rise grid place-items-center px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-hairline bg-surface/50 p-7 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-dusk/15 text-dusk">
          <I.Jam className="h-7 w-7" />
        </span>

        <p className="mt-5 text-xs font-medium uppercase tracking-wider text-ink-3">
          Convite para um jam
        </p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-ink">
          {name}
        </h1>
        {host && (
          <p className="mt-1.5 text-sm text-ink-2">
            {host.name} está no comando da música.
          </p>
        )}

        {nowPlaying && (
          <div className="mt-6 flex items-center gap-3 rounded-xl bg-surface-2 p-3 text-left">
            <Cover
              src={nowPlaying.cover}
              seed={nowPlaying.id}
              name={nowPlaying.title}
              className="h-12 w-12 rounded"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">
                {nowPlaying.title}
              </p>
              <p className="truncate text-xs text-ink-3">
                {nowPlaying.artist?.name ?? "Artista desconhecido"}
              </p>
            </div>
            <I.EqualizerBars className="shrink-0 text-accent" />
          </div>
        )}

        {participants.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-center -space-x-2">
              {participants.slice(0, 6).map((p) => (
                <UserAvatar
                  key={p.id}
                  user={p}
                  className="h-9 w-9 text-xs ring-2 ring-surface"
                />
              ))}
              {participants.length > 6 && (
                <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-3 text-[11px] font-semibold text-ink-2 ring-2 ring-surface">
                  +{participants.length - 6}
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-ink-3">
              {participants.length === 1
                ? "1 pessoa na sala"
                : `${participants.length} pessoas na sala`}
            </p>
          </div>
        )}

        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await joinJamByCode(code);
              if (!res.ok) {
                setError(res.message);
                return;
              }
              // O jam vive no layout, então a volta para a home já traz
              // o player sincronizado e o painel disponível.
              router.push("/");
              router.refresh();
            })
          }
          className="mt-7 w-full rounded-full bg-accent px-5 py-3.5 text-sm font-semibold text-accent-ink transition-all hover:scale-[1.02] hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Entrando…" : "Entrar no jam"}
        </button>

        {error && (
          <p role="alert" className="mt-3 text-xs text-rose">
            {error}
          </p>
        )}

        <p className="mt-4 text-[11px] leading-relaxed text-ink-3">
          Ao entrar, seu player passa a seguir o anfitrião. Você pode sair
          quando quiser.
        </p>

        <Link
          href="/"
          className="mt-4 inline-block text-xs text-ink-2 transition-colors hover:text-ink"
        >
          Agora não
        </Link>
      </div>
    </div>
  );
}
