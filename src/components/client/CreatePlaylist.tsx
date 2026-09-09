"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMyPlaylist } from "@/lib/actions";
import type { ActionState } from "@/lib/actions";
import * as I from "../Icons";

/**
 * Criação de playlist pelo ouvinte. Um diálogo curto: só o nome é
 * obrigatório — capa e descrição são detalhes que atrapalham na hora de
 * salvar uma música que acabou de tocar.
 */
export function CreatePlaylistButton({ label = "Nova playlist" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, setState] = useState<ActionState | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Fechar no próprio envio mantém o efeito fora disso: reagir ao estado
  // num `useEffect` dispararia um render em cascata.
  const action = (form: FormData) =>
    startTransition(async () => {
      const res = await createMyPlaylist(null, form);
      setState(res);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      }
    });

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setState(null);
          setOpen(true);
        }}
        className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-ink transition-all hover:scale-[1.03] hover:bg-accent-hover"
      >
        <I.Plus className="h-[18px] w-[18px]" />
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Nova playlist"
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-w-sm rounded-2xl border border-hairline bg-surface p-6 shadow-2xl shadow-black/50">
            <h2 className="text-lg font-semibold text-ink">Nova playlist</h2>

            <form action={action} className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="playlist-title"
                  className="mb-1.5 block text-xs font-medium text-ink-2"
                >
                  Nome
                </label>
                <input
                  ref={inputRef}
                  id="playlist-title"
                  name="title"
                  required
                  maxLength={80}
                  placeholder="Minhas favoritas"
                  className="h-11 w-full rounded-xl bg-surface-2 px-4 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                />
              </div>

              <fieldset>
                <legend className="mb-1.5 text-xs font-medium text-ink-2">
                  Visibilidade
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ["private", "Privada", "Só você vê"],
                      ["public", "Pública", "Quem tiver o link vê"],
                    ] as const
                  ).map(([value, title, hint]) => (
                    <label
                      key={value}
                      className="cursor-pointer rounded-xl border border-hairline bg-surface-2 px-3 py-2.5 text-left transition-colors has-[:checked]:border-accent/50 has-[:checked]:bg-accent/10"
                    >
                      <input
                        type="radio"
                        name="visibility"
                        value={value}
                        defaultChecked={value === "private"}
                        className="sr-only"
                      />
                      <span className="block text-sm font-medium text-ink">
                        {title}
                      </span>
                      <span className="block text-[11px] leading-tight text-ink-3">
                        {hint}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {state && !state.ok && (
                <p role="alert" className="text-xs text-rose">
                  {state.message}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full px-4 py-2.5 text-sm text-ink-2 transition-colors hover:text-ink"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-60"
                >
                  {pending ? "Criando…" : "Criar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
