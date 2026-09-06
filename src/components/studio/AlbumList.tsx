"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { deleteAlbum, type ActionState } from "@/lib/actions";
import { Cover } from "../Cover";
import { Button, FormMessage } from "./Form";
import { formatTime } from "@/lib/utils";
import * as I from "../Icons";

export type AlbumResumo = {
  id: string;
  title: string;
  artistName: string;
  cover: string | null;
  year: number;
  trackCount: number;
  duration: number;
};

export function AlbumList({ albums }: { albums: AlbumResumo[] }) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionState | null>(null);

  if (albums.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-hairline px-6 py-14 text-center">
        <p className="text-sm text-ink-2">
          Nenhum álbum publicado ainda. Faixas enviadas avulsas aparecem como
          singles no catálogo.
        </p>
        <Link
          href="/studio/album/novo"
          className="mt-4 inline-flex items-center rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink"
        >
          Publicar álbum
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FormMessage state={msg} />
      <ul className="space-y-3">
        {albums.map((a) => (
          <li
            key={a.id}
            className="rounded-xl border border-hairline bg-surface/60 p-4"
          >
            <div className="flex flex-wrap items-center gap-4">
              <Cover
                src={a.cover}
                seed={a.id}
                name={a.title}
                className="h-16 w-16"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{a.title}</p>
                <p className="mt-0.5 truncate text-xs text-ink-2">
                  {a.artistName} • {a.year} • {a.trackCount} faixa(s)
                  {a.duration > 0 && ` • ${formatTime(a.duration)}`}
                </p>
              </div>

              <div className="flex items-center gap-1">
                <Link
                  href={`/studio/album/${a.id}`}
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <I.Edit className="h-[18px] w-[18px]" />
                  Editar
                </Link>
                <Link
                  href={`/album/${a.id}`}
                  className="rounded-lg p-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                  aria-label={`Ver ${a.title} como ouvinte`}
                >
                  <I.Play className="h-[18px] w-[18px]" />
                </Link>
                <button
                  type="button"
                  onClick={() => setConfirming(a.id)}
                  className="rounded-lg p-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-rose"
                  aria-label={`Remover ${a.title}`}
                >
                  <I.Trash className="h-[18px] w-[18px]" />
                </button>
              </div>
            </div>

            {confirming === a.id && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-rose/5 p-3">
                <p className="flex-1 text-sm text-ink">
                  Remover <strong>{a.title}</strong> e suas {a.trackCount}{" "}
                  faixa(s)? Os arquivos serão apagados.
                </p>
                <Button
                  variant="danger"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      setMsg(await deleteAlbum(a.id));
                      setConfirming(null);
                    })
                  }
                >
                  Remover
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(null)}>
                  Cancelar
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
