"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { createMyPlaylist, toggleMyPlaylistTrack } from "@/lib/actions";
import { cx } from "@/lib/utils";
import * as I from "../Icons";

/** Playlist do ouvinte, no mínimo que o menu precisa saber. */
export type MyPlaylist = { id: string; title: string; trackIds: string[] };

/**
 * As playlists do usuário chegam pelo layout e ficam disponíveis a
 * qualquer linha de faixa — passá-las por props atravessaria meia dúzia
 * de componentes que não têm nada a ver com isso.
 */
const MyPlaylistsCtx = createContext<MyPlaylist[]>([]);

export function MyPlaylistsProvider({
  playlists,
  children,
}: {
  playlists: MyPlaylist[];
  children: React.ReactNode;
}) {
  return (
    <MyPlaylistsCtx.Provider value={playlists}>
      {children}
    </MyPlaylistsCtx.Provider>
  );
}

export const useMyPlaylists = () => useContext(MyPlaylistsCtx);

/**
 * Menu "Adicionar a" de uma faixa.
 *
 * Serve a dois lugares: nas linhas de lista, onde só aparece no hover, e
 * na barra do player, onde fica sempre visível — ali a faixa que toca é a
 * que a pessoa quer guardar, e esconder o botão atrás do hover deixava a
 * ação difícil de achar.
 */
export function AddToPlaylistButton({
  trackId,
  className,
  /** `bar` mantém o botão visível e abre o menu para cima. */
  variant = "row",
  label,
}: {
  trackId: string;
  className?: string;
  variant?: "row" | "bar";
  label?: string;
}) {
  const playlists = useMyPlaylists();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setCreating(false);
      }
    };
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
        aria-label={label ?? "Adicionar à playlist"}
        title={label ?? "Adicionar à playlist"}
        className={cx(
          "transition-all hover:text-ink",
          open ? "text-ink" : "text-ink-2",
          variant === "row" &&
            "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
          variant === "bar" &&
            "grid h-8 w-8 place-items-center rounded-full",
          className,
        )}
      >
        <I.Plus className="h-[18px] w-[18px]" />
      </button>

      {open && (
        <div
          role="menu"
          className={cx(
            "absolute left-0 z-50 w-60 overflow-hidden rounded-xl border border-hairline bg-surface shadow-2xl shadow-black/50",
            variant === "bar"
              ? "bottom-[calc(100%+8px)]"
              : "right-0 left-auto top-[calc(100%+6px)]",
          )}
        >
          {creating ? (
            <form
              action={async (form) => {
                await createMyPlaylist(null, form);
                setCreating(false);
                setOpen(false);
              }}
              className="p-3"
            >
              <input type="hidden" name="trackId" value={trackId} />
              {/* A criação rápida nasce privada; dá para publicar depois
                  no menu da própria playlist. */}
              <input type="hidden" name="visibility" value="private" />
              <input
                name="title"
                required
                maxLength={80}
                autoFocus
                placeholder="Nome da playlist"
                className="h-10 w-full rounded-lg bg-surface-2 px-3 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="rounded-full px-3 py-1.5 text-xs text-ink-2 hover:text-ink"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink hover:bg-accent-hover"
                >
                  Criar
                </button>
              </div>
            </form>
          ) : (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-3 border-b border-hairline px-4 py-3 text-left text-sm text-ink transition-colors hover:bg-surface-2"
              >
                <I.Plus className="h-4 w-4" />
                Nova playlist
              </button>

              {playlists.length === 0 ? (
                <p className="px-4 py-3 text-xs text-ink-3">
                  Você ainda não tem playlists.
                </p>
              ) : (
                <ul className="max-h-64 overflow-y-auto p-1.5">
                  {playlists.map((pl) => {
                    const has = pl.trackIds.includes(trackId);
                    return (
                      <li key={pl.id}>
                        <button
                          type="button"
                          role="menuitem"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              await toggleMyPlaylistTrack(pl.id, trackId);
                              setOpen(false);
                            })
                          }
                          className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                        >
                          <span className="truncate">{pl.title}</span>
                          {has && (
                            <I.Check className="h-4 w-4 shrink-0 text-accent" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
