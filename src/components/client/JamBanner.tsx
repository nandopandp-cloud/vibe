"use client";

import { useState } from "react";
import { useJam } from "./JamProvider";
import { JamPanel } from "./JamPanel";
import { UserAvatar } from "./UserMenu";
import { cx } from "@/lib/utils";
import * as I from "../Icons";
import type { FriendEdge } from "@/lib/types";

/**
 * A faixa que lembra, em qualquer tela, que você não está ouvindo
 * sozinho — e que some junto com o jam.
 *
 * Fica logo abaixo da barra de cima e acompanha a navegação: sem ela, um
 * convidado que abrisse outra página perderia de vista que o player está
 * sob o comando de outra pessoa, e ficaria sem explicação para os botões
 * que não respondem.
 */
export function JamBanner({ friends }: { friends: FriendEdge[] }) {
  const { jam, isHost } = useJam();
  const [panel, setPanel] = useState(false);

  if (!jam) return null;

  const online = jam.participants.filter((p) => p.online);
  const host = jam.participants.find((p) => p.isHost);

  return (
    <>
      <div className="px-6 pb-1 pt-1 md:px-8">
        <button
          type="button"
          onClick={() => setPanel(true)}
          className="flex w-full items-center gap-3 rounded-xl border border-dusk/25 bg-dusk/10 px-4 py-2.5 text-left transition-colors hover:bg-dusk/15"
        >
          <I.Jam className="h-[18px] w-[18px] shrink-0 text-dusk" />

          <p className="min-w-0 flex-1 truncate text-sm text-ink">
            <span className="font-medium">{jam.name}</span>
            <span className="text-ink-3">
              {" — "}
              {isHost
                ? "você está no comando"
                : `${host?.name ?? "o anfitrião"} está no comando`}
            </span>
          </p>

          {/* Os avatares empilhados dizem "tem gente aqui" antes de qualquer
              número — e o número fecha a conta quando são muitos. */}
          <span className="flex shrink-0 items-center -space-x-2">
            {online.slice(0, 4).map((p) => (
              <UserAvatar
                key={p.id}
                user={p}
                className={cx(
                  "h-7 w-7 text-[10px] ring-2 ring-canvas",
                  // O anfitrião vem na frente da pilha.
                  p.isHost && "z-10",
                )}
              />
            ))}
            {online.length > 4 && (
              <span className="grid h-7 w-7 place-items-center rounded-full bg-surface-3 text-[10px] font-semibold text-ink-2 ring-2 ring-canvas">
                +{online.length - 4}
              </span>
            )}
          </span>

          <span className="shrink-0 text-xs font-medium text-dusk">
            Abrir
          </span>
        </button>
      </div>

      {panel && <JamPanel friends={friends} onClose={() => setPanel(false)} />}
    </>
  );
}
