"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "../Brand";
import { cx } from "@/lib/utils";
import * as I from "../Icons";

const NAV = [
  { href: "/studio", label: "Visão geral", icon: I.Chart, exact: true },
  { href: "/studio/upload", label: "Publicar faixa", icon: I.Upload },
  { href: "/studio/catalogo", label: "Catálogo", icon: I.Music },
  { href: "/studio/artistas", label: "Artistas", icon: I.User },
  { href: "/studio/letras", label: "Letras", icon: I.Mic },
  { href: "/studio/playlists", label: "Playlists", icon: I.Playlist },
  { href: "/studio/destaques", label: "Destaques", icon: I.Sparkle },
];

export function StudioShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <div className="flex min-h-dvh bg-canvas">
      <aside className="sticky top-0 hidden h-dvh w-[240px] shrink-0 flex-col border-r border-hairline bg-sidebar md:flex">
        <div className="px-6 pb-7 pt-6">
          <Link href="/studio" aria-label="Sona Studio">
            <Logo tagline={false} />
            <p className="mt-1.5 pl-0.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-accent">
              Studio
            </p>
          </Link>
        </div>

        <nav className="flex-1 px-3">
          <ul className="space-y-1">
            {NAV.map((item) => {
              const active = isActive(item.href, item.exact);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-surface text-ink"
                        : "text-ink-2 hover:bg-surface/60 hover:text-ink",
                    )}
                  >
                    <item.icon className="h-[19px] w-[19px] shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-hairline p-4">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-ink-2 transition-colors hover:bg-surface hover:text-ink"
          >
            <I.ArrowLeft className="h-[18px] w-[18px]" />
            Ver como ouvinte
          </Link>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* navegação em barra no mobile */}
        <nav className="sticky top-0 z-20 flex gap-1 overflow-x-auto border-b border-hairline bg-canvas/90 px-4 py-3 backdrop-blur md:hidden">
          <Link href="/" className="shrink-0 rounded-full px-3 py-1.5 text-sm text-ink-2">
            ← Ouvinte
          </Link>
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cx(
                "shrink-0 rounded-full px-3 py-1.5 text-sm",
                isActive(item.href, item.exact)
                  ? "bg-surface-2 text-ink"
                  : "text-ink-2",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="mx-auto max-w-[1180px] px-6 py-8 md:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
