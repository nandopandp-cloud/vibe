"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { UserAvatar } from "./UserMenu";
import { acceptFriendRequest, removeFriendship } from "@/lib/friends-actions";
import { cx } from "@/lib/utils";
import * as I from "../Icons";
import type { FriendEdge } from "@/lib/types";

/** Duas caixas de pedidos dizem a mesma coisa? */
function sameRequests(a: FriendEdge[], b: FriendEdge[]): boolean {
  return a.length === b.length && a.every((e, i) => e.user.id === b[i].user.id);
}

/**
 * O sino da barra de cima.
 *
 * Hoje ele carrega só uma coisa: pedidos de amizade esperando resposta.
 * Um sino que mostra apenas o que exige uma decisão é um sino em que se
 * confia — o contador só acende quando há de fato algo a fazer, e zera
 * assim que a última resposta é dada.
 *
 * Os pedidos chegam pelo render do servidor, junto da navegação. Sem
 * polling: um pedido de amizade não é urgente como o relógio de um jam,
 * e conversar com o servidor a cada três segundos por causa dele seria
 * caro à toa.
 */

/** Quanto tempo faz, em português e por aproximação. */
function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "agora";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "ontem";
  if (days < 7) return `há ${days} dias`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return weeks === 1 ? "há 1 semana" : `há ${weeks} semanas`;

  const months = Math.floor(days / 30);
  return months <= 1 ? "há 1 mês" : `há ${months} meses`;
}

function RequestRow({
  edge,
  pending,
  onAccept,
  onDecline,
}: {
  edge: FriendEdge;
  pending: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <li className="rounded-xl p-3 transition-colors hover:bg-surface-2">
      <div className="flex items-start gap-3">
        <UserAvatar user={edge.user} className="h-10 w-10 shrink-0 text-xs" />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug text-ink">
            <span className="font-medium">{edge.user.name}</span>{" "}
            <span className="text-ink-2">quer ser seu amigo</span>
          </p>
          <p className="mt-0.5 truncate text-xs text-ink-3">
            {timeAgo(edge.createdAt)}
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex gap-2 pl-[52px]">
        <button
          type="button"
          disabled={pending}
          onClick={onAccept}
          className="flex-1 rounded-full bg-accent px-3 py-2 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          Aceitar
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onDecline}
          className="flex-1 rounded-full border border-hairline px-3 py-2 text-xs font-medium text-ink-3 transition-colors hover:border-rose/50 hover:text-rose disabled:opacity-60"
        >
          Recusar
        </button>
      </div>
    </li>
  );
}

export function Notifications({ requests }: { requests: FriendEdge[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  /**
   * Os pedidos, mantidos aqui depois do primeiro render do servidor.
   *
   * A resposta a um pedido já devolve a caixa nova, então o sino se
   * atualiza com a própria escrita. Antes ele pedia `router.refresh()`,
   * que refaz a árvore inteira do layout — catálogo, playlists, jam,
   * presença — para tirar uma linha de um menu suspenso.
   */
  const [visible, setVisible] = useState(requests);
  const [seed, setSeed] = useState(requests);
  if (requests !== seed) {
    setSeed(requests);
    // Por conteúdo: o servidor monta um array novo a cada render, e
    // adotar por identidade traria de volta o pedido recém-respondido.
    if (!sameRequests(requests, visible)) setVisible(requests);
  }

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
   * Responde um pedido.
   *
   * A linha some na hora do clique, sem esperar o servidor; quando a
   * resposta chega, a caixa que ela traz vira a verdade. As duas coisas
   * juntas dão o clique instantâneo sem deixar a lista mentir se a
   * escrita falhar.
   */
  const respond = (
    userId: string,
    action: () => Promise<{ view: { incoming: FriendEdge[] } }>,
  ) => {
    setVisible((prev) => prev.filter((r) => r.user.id !== userId));
    startTransition(async () => {
      setVisible((await action()).view.incoming);
    });
  };

  const count = visible.length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          count > 0
            ? `Notificações — ${count} ${count === 1 ? "pedido" : "pedidos"} de amizade`
            : "Notificações"
        }
        className={cx(
          "relative grid h-10 w-10 place-items-center rounded-full transition-colors",
          open || count > 0
            ? "bg-surface text-ink"
            : "bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink",
        )}
      >
        <I.Bell className="h-[18px] w-[18px]" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-ink">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[340px] overflow-hidden rounded-xl border border-hairline bg-surface shadow-2xl shadow-black/50"
        >
          <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Notificações</h2>
            {count > 0 && (
              <span className="text-xs text-ink-3">
                {count === 1 ? "1 pedido" : `${count} pedidos`}
              </span>
            )}
          </div>

          {count === 0 ? (
            <div className="px-4 py-8 text-center">
              <I.Bell className="mx-auto h-6 w-6 text-ink-3" />
              <p className="mt-3 text-sm text-ink-2">Nada por aqui</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-3">
                Pedidos de amizade aparecem aqui assim que chegarem.
              </p>
            </div>
          ) : (
            <ul className="max-h-[420px] overflow-y-auto p-1.5">
              {visible.map((edge) => (
                <RequestRow
                  key={edge.user.id}
                  edge={edge}
                  pending={pending}
                  onAccept={() =>
                    respond(edge.user.id, () =>
                      acceptFriendRequest(edge.user.id),
                    )
                  }
                  onDecline={() =>
                    respond(edge.user.id, () => removeFriendship(edge.user.id))
                  }
                />
              ))}
            </ul>
          )}

          <div className="border-t border-hairline p-1.5">
            <Link
              href="/amigos"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <I.Users className="h-[18px] w-[18px]" />
              Ver todos os amigos
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
