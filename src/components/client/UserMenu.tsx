"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { logout } from "@/lib/auth-actions";
import { cx, initials } from "@/lib/utils";
import * as I from "../Icons";
import type { PublicUser } from "@/lib/types";

/** Avatar + menu de conta no canto superior direito. */
export function UserMenu({ user }: { user: PublicUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isAdmin = user.role === "admins";

  // Fecha ao clicar fora ou apertar Escape.
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

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full bg-surface py-1 pl-1 pr-3 transition-colors hover:bg-surface-2"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-dusk to-ocean text-xs font-bold text-ink">
          {initials(user.name)}
        </span>
        <span className="hidden max-w-[120px] truncate text-sm font-medium text-ink sm:block">
          {user.name}
        </span>
        <I.ChevronDown
          className={cx(
            "hidden h-4 w-4 text-ink-2 transition-transform sm:block",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-xl border border-hairline bg-surface shadow-2xl shadow-black/50"
        >
          <div className="border-b border-hairline px-4 py-3">
            <p className="truncate text-sm font-medium text-ink">{user.name}</p>
            <p className="truncate text-xs text-ink-2">{user.email}</p>
            <span
              className={cx(
                "mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                isAdmin
                  ? "bg-accent/10 text-accent"
                  : "bg-surface-3 text-ink-2",
              )}
            >
              {isAdmin ? (
                <>
                  <I.Shield className="h-3 w-3" />
                  Administrador
                </>
              ) : (
                "Ouvinte"
              )}
            </span>
          </div>

          <div className="p-1.5">
            {isAdmin && (
              <Link
                href="/studio"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <I.Chart className="h-[18px] w-[18px]" />
                Sona Studio
              </Link>
            )}
            <Link
              href="/curtidas"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <I.Heart className="h-[18px] w-[18px]" />
              Músicas curtidas
            </Link>

            <button
              type="button"
              role="menuitem"
              onClick={() => void logout()}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <I.Logout className="h-[18px] w-[18px]" />
              Sair
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
