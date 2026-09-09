"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { usePlayer } from "./PlayerProvider";
import { Cover } from "../Cover";
import { activeLyricIndex, cx } from "@/lib/utils";
import * as I from "../Icons";

/**
 * A letra em tela cheia, acompanhando a reprodução.
 *
 * O painel "Tocando agora" já mostra a letra, mas espremida ao lado da
 * fila. Aqui ela é o assunto: tipo grande, verso atual em destaque e o
 * resto esmaecido, que é como se lê cantando junto. Clicar num verso
 * salta para aquele ponto da música.
 */
export function LyricsScreen({ onClose }: { onClose: () => void }) {
  const p = usePlayer();
  const t = p.current;
  const lines = t?.lyrics ?? [];
  const active = activeLyricIndex(lines, p.time);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Mantém o verso que está soando no centro da tela.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [active]);

  const bg = useMemo(() => (t?.cover ? `url(${t.cover})` : undefined), [t?.cover]);

  if (!t) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-void">
      {/* A capa desfocada dá cor ao fundo sem competir com o texto. */}
      {bg && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 scale-110 bg-cover bg-center opacity-25 blur-3xl"
          style={{ backgroundImage: bg }}
        />
      )}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-void/80 via-void/40 to-void"
      />

      <header className="relative flex items-center gap-4 px-6 py-5">
        <Cover src={t.cover} seed={t.id} name={t.title} className="h-12 w-12" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{t.title}</p>
          <p className="truncate text-xs text-ink-2">
            {t.artist?.name ?? "Artista desconhecido"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar letra"
          className="grid h-10 w-10 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface hover:text-ink"
        >
          <I.X className="h-5 w-5" />
        </button>
      </header>

      <div className="relative min-h-0 flex-1 overflow-y-auto px-6 pb-16 md:px-12">
        {lines.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <I.Mic className="h-10 w-10 text-ink-3" />
            <p className="text-base text-ink-2">
              Esta faixa ainda não tem letra.
            </p>
            <Link
              href="/studio/letras"
              onClick={onClose}
              className="text-sm text-ink-2 underline-offset-4 hover:text-ink hover:underline"
            >
              Adicionar no Studio
            </Link>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6 py-[30vh]">
            {lines.map((line, i) => (
              <button
                key={`${line.time}-${i}`}
                ref={i === active ? activeRef : null}
                type="button"
                onClick={() => p.seek(line.time)}
                className={cx(
                  "block w-full text-left text-2xl font-semibold leading-snug transition-all duration-500 md:text-4xl",
                  i === active
                    ? "text-ink"
                    : "text-ink-3/50 blur-[0.4px] hover:text-ink-2 hover:blur-0",
                )}
              >
                {line.text}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
