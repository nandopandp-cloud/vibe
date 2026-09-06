"use client";

import { usePlayer } from "./PlayerProvider";
import { cx, gradientFor } from "@/lib/utils";
import * as I from "../Icons";
import type { HydratedTrack, Spotlight } from "@/lib/types";

/**
 * Banner de destaque da home. A capa da faixa vira o fundo, com
 * gradiente da esquerda para dar contraste ao texto — como na referência.
 */
export function Hero({
  track,
  spotlight,
  context,
}: {
  track: HydratedTrack;
  spotlight: Spotlight;
  context: HydratedTrack[];
}) {
  const p = usePlayer();
  const isCurrent = p.current?.id === track.id;
  const isPlaying = isCurrent && p.playing;
  const liked = p.isLiked(track.id);

  return (
    <section className="relative overflow-hidden rounded-2xl">
      {/* Fundo: a capa é quadrada, então preenchemos a faixa panorâmica com
          uma cópia desfocada e ancoramos a arte nítida à direita. */}
      <div className="absolute inset-0">
        {track.cover ? (
          <>
            <div
              className="absolute inset-0 scale-110 bg-cover bg-center opacity-60 blur-2xl"
              style={{ backgroundImage: `url(${track.cover})` }}
            />
            {/* A capa é quadrada: mantemos a proporção num bloco à direita
                em vez de esticá-la na faixa panorâmica. */}
            <div
              className="absolute inset-y-0 right-0 hidden aspect-square bg-cover bg-center md:block"
              style={{
                backgroundImage: `url(${track.cover})`,
                // Dissolve a borda esquerda da arte no fundo desfocado.
                maskImage:
                  "linear-gradient(to right, transparent, #000 45%, #000)",
                WebkitMaskImage:
                  "linear-gradient(to right, transparent, #000 45%, #000)",
              }}
            />
          </>
        ) : (
          <div
            className="h-full w-full"
            style={{ background: gradientFor(track.id) }}
          />
        )}
      </div>
      {/* Escurece a esquerda para o texto respirar, deixando a arte visível
          à direita — a proporção das referências. */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/60 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />

      <div className="relative flex min-h-[320px] flex-col justify-center gap-5 p-8 md:p-12 lg:max-w-[62%]">
        <p className="text-xs font-medium uppercase tracking-[0.28em] text-ink-2">
          {spotlight.eyebrow}
        </p>

        <div>
          <h1 className="text-4xl font-bold leading-[1.05] tracking-tight text-ink md:text-6xl">
            {track.title}
          </h1>
          {track.artist && (
            <p className="mt-2 text-xl text-ink-2 md:text-2xl">
              {track.artist.name}
            </p>
          )}
        </div>

        {spotlight.blurb && (
          <p className="max-w-lg text-sm leading-relaxed text-ink-2 md:text-base">
            {spotlight.blurb}
          </p>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => (isCurrent ? p.toggle() : p.playTrack(track, context))}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-7 py-3 text-sm font-semibold text-accent-ink transition-all hover:scale-[1.03] hover:bg-accent-hover"
          >
            {isPlaying ? (
              <I.Pause className="h-[18px] w-[18px]" />
            ) : (
              <I.Play className="h-[18px] w-[18px]" />
            )}
            {isPlaying ? "Pausar" : "Ouvir agora"}
          </button>

          <button
            type="button"
            onClick={() => p.like(track.id)}
            aria-pressed={liked}
            className={cx(
              "inline-flex items-center gap-2 rounded-full border px-7 py-3 text-sm font-semibold transition-colors",
              liked
                ? "border-accent/60 bg-accent/10 text-accent"
                : "border-ink/30 text-ink hover:border-ink/70 hover:bg-white/5",
            )}
          >
            {liked ? "Salvo" : "Salvar"}
          </button>
        </div>
      </div>

      {/* citação à direita, como no mock */}
      {spotlight.quote && (
        <div className="absolute right-[calc(320px+2.5rem)] top-1/2 hidden w-[190px] -translate-y-1/2 2xl:block">
          <p className="text-[11px] uppercase leading-relaxed tracking-[0.18em] text-ink-2">
            {spotlight.quote}
          </p>
          <div className="mt-4 h-px w-10 bg-ink-3" />
        </div>
      )}
    </section>
  );
}
