"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePlayer } from "./PlayerProvider";
import { useMyPlaylists } from "./AddToPlaylist";
import { useJam } from "./JamProvider";
import { createMyPlaylist, toggleMyPlaylistTrack } from "@/lib/actions";
import { cx } from "@/lib/utils";
import * as I from "../Icons";
import type { HydratedTrack } from "@/lib/types";

/**
 * Menu dos três pontinhos da barra do player.
 *
 * Reúne o que se quer fazer com a faixa que está tocando: guardar numa
 * playlist, curtir, ir para o artista ou o álbum. Antes era um ícone sem
 * função nenhuma.
 */
export function TrackMenu({ track }: { track: HydratedTrack }) {
  const p = usePlayer();
  const playlists = useMyPlaylists();
  const { jam, isHost, addTrack, playNext } = useJam();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  /** Confirmação curta depois de enfileirar no jam. */
  const [jamNote, setJamNote] = useState<string | null>(null);
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

  const close = () => {
    setOpen(false);
    setCreating(false);
    setJamNote(null);
  };

  const liked = p.isLiked(track.id);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Mais opções"
        className={cx(
          "grid h-8 w-8 place-items-center rounded-full transition-colors",
          open ? "text-ink" : "text-ink-2 hover:text-ink",
        )}
      >
        <I.Dots className="h-[18px] w-[18px]" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-[calc(100%+8px)] left-0 z-50 w-64 overflow-hidden rounded-xl border border-hairline bg-surface shadow-2xl shadow-black/60"
        >
          {creating ? (
            <form
              action={async (form) => {
                await createMyPlaylist(null, form);
                close();
                router.refresh();
              }}
              className="p-3"
            >
              <input type="hidden" name="trackId" value={track.id} />
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
              {/* A entrada colaborativa do jam: quem não comanda a sala
                  ainda escolhe o que vem depois. */}
              {jam && (
                <div className="border-b border-hairline p-1.5">
                  <p className="px-3 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-3">
                    {jam.name}
                  </p>
                  {/* "A seguir" vem primeiro: numa sala, a diferença que
                      importa é entre soar daqui a pouco e soar daqui a
                      vinte músicas. */}
                  <button
                    type="button"
                    role="menuitem"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        setJamNote(await playNext(track));
                      })
                    }
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-dusk transition-colors hover:bg-dusk/10 disabled:opacity-60"
                  >
                    <I.Next className="h-4 w-4 shrink-0" />
                    <span className="truncate">
                      {isHost ? "Tocar a seguir" : "Pedir para tocar a seguir"}
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        setJamNote(await addTrack(track));
                      })
                    }
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-dusk transition-colors hover:bg-dusk/10 disabled:opacity-60"
                  >
                    <I.Jam className="h-4 w-4 shrink-0" />
                    <span className="truncate">Adicionar ao fim da fila</span>
                  </button>
                  {jamNote && (
                    <p role="status" className="px-3 pb-1.5 pt-1 text-[11px] text-dusk">
                      {jamNote}
                    </p>
                  )}
                </div>
              )}

              <div className="border-b border-hairline p-1.5">
                <p className="px-3 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-3">
                  Adicionar à playlist
                </p>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setCreating(true)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-ink transition-colors hover:bg-surface-2"
                >
                  <I.Plus className="h-4 w-4 shrink-0" />
                  Nova playlist
                </button>

                {playlists.length > 0 && (
                  <ul className="max-h-48 overflow-y-auto">
                    {playlists.map((pl) => {
                      const has = pl.trackIds.includes(track.id);
                      return (
                        <li key={pl.id}>
                          <button
                            type="button"
                            role="menuitem"
                            disabled={pending}
                            onClick={() =>
                              startTransition(async () => {
                                await toggleMyPlaylistTrack(pl.id, track.id);
                                close();
                                router.refresh();
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
              </div>

              <div className="p-1.5">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    p.like(track.id);
                    close();
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  {liked ? (
                    <I.HeartFilled className="h-4 w-4 shrink-0 text-accent" />
                  ) : (
                    <I.Heart className="h-4 w-4 shrink-0" />
                  )}
                  {liked ? "Remover das curtidas" : "Curtir"}
                </button>

                {track.artist && (
                  <Link
                    href={`/artista/${track.artist.id}`}
                    role="menuitem"
                    onClick={close}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    <I.User className="h-4 w-4 shrink-0" />
                    <span className="truncate">Ir para o artista</span>
                  </Link>
                )}

                {track.album && (
                  <Link
                    href={`/album/${track.album.id}`}
                    role="menuitem"
                    onClick={close}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    <I.Album className="h-4 w-4 shrink-0" />
                    <span className="truncate">Ir para o álbum</span>
                  </Link>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
