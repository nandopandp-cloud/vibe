"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PlayerBar } from "./PlayerBar";
import { NowPlaying } from "./NowPlaying";
import { Logo } from "../Brand";
import { Cover } from "../Cover";
import { cx } from "@/lib/utils";
import * as I from "../Icons";
import type { Playlist } from "@/lib/types";

const NAV = [
  { href: "/", label: "Início", icon: I.Home, activeIcon: I.HomeFilled },
  { href: "/buscar", label: "Buscar", icon: I.Search, activeIcon: I.Search },
  { href: "/biblioteca", label: "Biblioteca", icon: I.Library, activeIcon: I.Library },
];

const LIBRARY = [
  { href: "/curtidas", label: "Músicas Curtidas", icon: I.Heart },
  { href: "/playlists", label: "Playlists", icon: I.Playlist },
  { href: "/artistas", label: "Seus Artistas", icon: I.User },
  { href: "/albuns", label: "Álbuns", icon: I.Album },
];

function NavLink({
  href,
  label,
  Icon,
  active,
}: {
  href: string;
  label: string;
  Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex items-center gap-4 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-surface text-ink"
          : "text-ink-2 hover:bg-surface/60 hover:text-ink",
      )}
    >
      <Icon className="h-[22px] w-[22px] shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function Shell({
  children,
  playlists,
}: {
  children: React.ReactNode;
  playlists: Playlist[];
}) {
  const pathname = usePathname();
  const [nowPlaying, setNowPlaying] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="flex h-dvh flex-col bg-void">
      <div className="flex min-h-0 flex-1">
        {/* ---------------- sidebar ---------------- */}
        <aside
          className={cx(
            "z-40 flex w-[248px] shrink-0 flex-col bg-sidebar transition-transform lg:translate-x-0",
            "max-lg:fixed max-lg:inset-y-0 max-lg:left-0",
            menuOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full",
          )}
        >
          <div className="px-6 pb-6 pt-6">
            <Link href="/" aria-label="Sona — início">
              <Logo />
            </Link>
          </div>

          <nav className="px-3">
            <ul className="space-y-1">
              {NAV.map((item) => (
                <li key={item.href}>
                  <NavLink
                    href={item.href}
                    label={item.label}
                    Icon={isActive(item.href) ? item.activeIcon : item.icon}
                    active={isActive(item.href)}
                  />
                </li>
              ))}
            </ul>
          </nav>

          <div className="mt-7 px-3">
            <p className="px-4 pb-2 text-xs font-medium uppercase tracking-wider text-ink-3">
              Sua música
            </p>
            <ul className="space-y-1">
              {LIBRARY.map((item) => (
                <li key={item.href}>
                  <NavLink
                    href={item.href}
                    label={item.label}
                    Icon={item.icon}
                    active={isActive(item.href)}
                  />
                </li>
              ))}
            </ul>
          </div>

          {/* playlists editoriais */}
          {playlists.length > 0 && (
            <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-3 pb-4">
              <div className="flex items-center justify-between px-4 pb-2">
                <p className="text-xs font-medium uppercase tracking-wider text-ink-3">
                  Playlists
                </p>
                <Link
                  href="/studio/playlists"
                  className="text-ink-3 transition-colors hover:text-ink"
                  aria-label="Criar playlist no Studio"
                >
                  <I.Plus className="h-4 w-4" />
                </Link>
              </div>
              <ul className="space-y-0.5">
                {playlists.map((pl) => (
                  <li key={pl.id}>
                    <Link
                      href={`/playlist/${pl.id}`}
                      className="flex items-center gap-3 rounded-lg px-4 py-2 text-sm text-ink-2 transition-colors hover:bg-surface/60 hover:text-ink"
                    >
                      <Cover
                        src={pl.cover}
                        seed={pl.id}
                        name={pl.title}
                        className="h-9 w-9"
                      />
                      <span className="truncate">{pl.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* card promocional, como na referência */}
          <div className="mt-auto p-4">
            <div className="relative overflow-hidden rounded-xl border border-hairline bg-gradient-to-br from-surface-2 to-surface p-4">
              <div
                className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full blur-2xl"
                style={{ background: "radial-gradient(circle,#7b5cf0,transparent 70%)" }}
              />
              <p className="relative text-[15px] font-semibold leading-snug text-ink">
                Música
                <br />
                em todo
                <br />
                lugar
              </p>
              <p className="relative mt-2 text-xs leading-relaxed text-ink-2">
                Alimente o catálogo e publique suas faixas no Sona.
              </p>
              <Link
                href="/studio"
                className="relative mt-3 inline-flex items-center rounded-full bg-ink px-4 py-1.5 text-xs font-semibold text-void transition-transform hover:scale-[1.03]"
              >
                Abrir o Studio
              </Link>
            </div>
          </div>
        </aside>

        {menuOpen && (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-black/60 lg:hidden"
            onClick={() => setMenuOpen(false)}
            aria-label="Fechar menu"
          />
        )}

        {/* ---------------- conteúdo ---------------- */}
        <main className="relative min-w-0 flex-1 overflow-y-auto bg-canvas">
          <TopBar onMenu={() => setMenuOpen(true)} />
          {children}
        </main>
      </div>

      <PlayerBar onOpenNowPlaying={() => setNowPlaying(true)} />
      {nowPlaying && <NowPlaying onClose={() => setNowPlaying(false)} />}
    </div>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const [q, setQ] = useState("");

  return (
    <header className="sticky top-0 z-20 flex items-center gap-4 bg-canvas/85 px-6 py-4 backdrop-blur-xl">
      <button
        type="button"
        onClick={onMenu}
        className="rounded p-1 text-ink-2 hover:text-ink lg:hidden"
        aria-label="Abrir menu"
      >
        <I.Grip className="h-6 w-6" />
      </button>

      <form
        action="/buscar"
        className="relative w-full max-w-[440px]"
        role="search"
      >
        <I.Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-2" />
        <input
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="O que você quer ouvir hoje?"
          aria-label="Buscar"
          className="h-11 w-full rounded-full bg-surface pl-12 pr-4 text-sm text-ink placeholder:text-ink-2 focus:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
        />
      </form>

      <div className="ml-auto flex items-center gap-3">
        <button
          type="button"
          className="rounded-full p-2 text-ink-2 transition-colors hover:text-ink"
          aria-label="Notificações"
        >
          <I.Bell className="h-[20px] w-[20px]" />
        </button>
        <Link
          href="/studio"
          className="flex items-center gap-2 rounded-full bg-surface py-1 pl-1 pr-3 transition-colors hover:bg-surface-2"
        >
          <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-dusk to-ocean text-xs font-bold text-ink">
            L
          </span>
          <span className="hidden text-sm font-medium text-ink sm:block">
            Lucas
          </span>
          <I.ChevronDown className="hidden h-4 w-4 text-ink-2 sm:block" />
        </Link>
      </div>
    </header>
  );
}
