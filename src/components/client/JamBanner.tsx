"use client";

import { useJam } from "./JamProvider";
import { UserAvatar } from "./UserMenu";
import { cx } from "@/lib/utils";
import * as I from "../Icons";

/**
 * A faixa que lembra, em qualquer tela, que você não está ouvindo
 * sozinho — e que some junto com o jam.
 *
 * Fica logo abaixo da barra de cima e acompanha a navegação: sem ela, um
 * convidado que abrisse outra página perderia de vista que o player está
 * sob o comando de outra pessoa, e ficaria sem explicação para os botões
 * que não respondem.
 */
export function JamBanner({ onOpen }: { onOpen: () => void }) {
  const { jam, isHost } = useJam();

  if (!jam) return null;

  const online = jam.participants.filter((p) => p.online);
  const host = jam.participants.find((p) => p.isHost);
  const ahead = Math.max(jam.queue.length - Math.max(jam.index, 0) - 1, 0);

  return (
    <div className="px-6 pb-1 pt-1 md:px-8">
      <button
        type="button"
        onClick={onOpen}
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

        {/* O número da fila fica na faixa porque é a pergunta que se
            faz sem abrir nada: ainda tem música guardada? */}
        <span className="hidden shrink-0 items-center gap-1.5 text-xs font-medium text-dusk sm:flex">
          <I.Queue className="h-4 w-4" />
          {ahead > 0 ? `${ahead} na fila` : "Fila vazia"}
        </span>

        <span className="shrink-0 text-xs font-medium text-dusk">
          Abrir
        </span>
      </button>
    </div>
  );
}
