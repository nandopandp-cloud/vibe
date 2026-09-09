"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  deleteMyPlaylist,
  renameMyPlaylist,
  toggleMyPlaylistVisibility,
} from "@/lib/actions";
import { cx } from "@/lib/utils";
import * as I from "../Icons";

/** Renomear e excluir — só aparecem para quem é dono da playlist. */
export function PlaylistOwnerActions({
  playlistId,
  title,
  visibility,
}: {
  playlistId: string;
  title: string;
  visibility: "public" | "private";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [value, setValue] = useState(title);
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

  if (renaming) {
    return (
      <form
        className="flex items-center gap-2"
        action={() =>
          startTransition(async () => {
            await renameMyPlaylist(playlistId, value);
            setRenaming(false);
            router.refresh();
          })
        }
      >
        <input
          autoFocus
          value={value}
          maxLength={80}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Nome da playlist"
          className="h-11 rounded-xl bg-surface-2 px-4 text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-60"
        >
          Salvar
        </button>
        <button
          type="button"
          onClick={() => {
            setValue(title);
            setRenaming(false);
          }}
          className="rounded-full px-3 py-2.5 text-sm text-ink-2 hover:text-ink"
        >
          Cancelar
        </button>
      </form>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Opções da playlist"
        className={cx(
          "grid h-11 w-11 place-items-center rounded-full border border-hairline transition-colors",
          open ? "text-ink" : "text-ink-2 hover:border-ink/40 hover:text-ink",
        )}
      >
        <I.Dots className="h-[18px] w-[18px]" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-[calc(100%+6px)] z-50 w-52 overflow-hidden rounded-xl border border-hairline bg-surface p-1.5 shadow-2xl shadow-black/50"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setRenaming(true);
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <I.Edit className="h-[18px] w-[18px]" />
            Renomear
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await toggleMyPlaylistVisibility(playlistId);
                setOpen(false);
                router.refresh();
              })
            }
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            {visibility === "public" ? (
              <I.Lock className="h-[18px] w-[18px]" />
            ) : (
              <I.Globe className="h-[18px] w-[18px]" />
            )}
            {visibility === "public" ? "Tornar privada" : "Tornar pública"}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                // Excluir some com a página atual, então voltamos à lista.
                await deleteMyPlaylist(playlistId);
                router.push("/playlists");
              })
            }
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-rose transition-colors hover:bg-rose/10"
          >
            <I.Trash className="h-[18px] w-[18px]" />
            Excluir playlist
          </button>
        </div>
      )}
    </div>
  );
}
