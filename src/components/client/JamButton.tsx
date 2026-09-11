"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useJam } from "./JamProvider";
import { usePlayer } from "./PlayerProvider";
import { JamPanel } from "./JamPanel";
import { UserAvatar } from "./UserMenu";
import { createJam, declineJamInvite, joinJamByCode } from "@/lib/jam-actions";
import { cx } from "@/lib/utils";
import * as I from "../Icons";
import type { FriendEdge, HydratedJamInvite } from "@/lib/types";

/**
 * O acesso ao jam na barra de cima: começa uma sala, mostra a que está
 * acontecendo, e recebe os convites.
 *
 * Os convites chegam do servidor no render da página. Não há polling
 * aqui de propósito — quem não está num jam não precisa conversar com o
 * servidor a cada três segundos; a navegação já traz a lista em dia.
 */

/* ------------------------------------------------------------------ */
/* Convites recebidos                                                  */
/* ------------------------------------------------------------------ */

function InviteList({
  invites,
  onDone,
}: {
  invites: HydratedJamInvite[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <ul className="space-y-1">
      {invites.map((invite) => (
        <li
          key={invite.id}
          className="rounded-xl border border-hairline bg-surface-2 p-3"
        >
          <div className="flex items-center gap-3">
            <UserAvatar user={invite.from} className="h-9 w-9 text-xs" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink">
                <span className="font-medium">{invite.from.name}</span> chamou
                você
              </p>
              <p className="truncate text-xs text-ink-3">{invite.jamName}</p>
            </div>
          </div>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await joinJamByCode(invite.code);
                  onDone();
                  if (res.ok) router.refresh();
                })
              }
              className="flex-1 rounded-full bg-accent px-3 py-2 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              Entrar
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await declineJamInvite(invite.jamId);
                  router.refresh();
                })
              }
              className="rounded-full border border-hairline px-3 py-2 text-xs font-medium text-ink-3 transition-colors hover:text-ink disabled:opacity-60"
            >
              Dispensar
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Botão                                                               */
/* ------------------------------------------------------------------ */

export function JamButton({
  friends,
  invites,
}: {
  friends: FriendEdge[];
  invites: HydratedJamInvite[];
}) {
  const { jam } = useJam();
  const player = usePlayer();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /**
   * Abre a sala já com o que estiver tocando.
   *
   * Quem clica em "iniciar jam" no meio de uma música quer ouvir *aquela*
   * música acompanhado — começar do zero obrigaria a procurar tudo de
   * novo. Sem nada tocando, a sala nasce vazia e o host escolhe depois.
   */
  const start = () =>
    startTransition(async () => {
      setError(null);
      const res = await createJam({
        trackIds: player.queue.map((t) => t.id),
        index: Math.max(player.index, 0),
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setOpen(false);
      router.refresh();
      setPanel(true);
    });

  return (
    <>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => (jam ? setPanel(true) : setOpen((v) => !v))}
          aria-haspopup={jam ? undefined : "menu"}
          aria-expanded={jam ? undefined : open}
          aria-label={jam ? "Abrir o jam" : "Escutar com amigos"}
          className={cx(
            "relative flex items-center gap-2 rounded-full py-2 pl-2.5 pr-3.5 text-sm font-medium transition-colors",
            jam
              ? "bg-dusk/15 text-dusk hover:bg-dusk/25"
              : "bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink",
          )}
        >
          <I.Jam className="h-[18px] w-[18px]" />
          <span className="hidden sm:block">{jam ? "No jam" : "Jam"}</span>

          {/* O contador de convites some quando você já está numa sala:
              entrar noutra exigiria sair desta, e o aviso só distrairia. */}
          {!jam && invites.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-ink">
              {invites.length}
            </span>
          )}
        </button>

        {open && !jam && (
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+8px)] z-50 w-[320px] overflow-hidden rounded-xl border border-hairline bg-surface p-4 shadow-2xl shadow-black/50"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-dusk/15 text-dusk">
                <I.Jam className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">
                  Escutem juntos
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-3">
                  Abra um jam e todo mundo ouve a mesma música, ao mesmo
                  tempo. Você comanda; seus amigos enfileiram.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={start}
              disabled={pending}
              className="mt-3.5 w-full rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {pending
                ? "Abrindo…"
                : player.current
                  ? "Iniciar jam com esta fila"
                  : "Iniciar um jam"}
            </button>

            {error && (
              <p role="alert" className="mt-2 text-xs text-rose">
                {error}
              </p>
            )}

            {invites.length > 0 && (
              <div className="mt-4 border-t border-hairline pt-3.5">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-3">
                  Convites
                </p>
                <InviteList
                  invites={invites}
                  onDone={() => {
                    setOpen(false);
                    setPanel(true);
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {panel && <JamPanel friends={friends} onClose={() => setPanel(false)} />}
    </>
  );
}
