"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePlayer } from "./PlayerProvider";
import { useJam } from "./JamProvider";
import { usePlayIntent } from "./usePlayIntent";
import { Avatar, Cover } from "../Cover";
import { activeLyricIndex, cx, formatPlays, formatTime } from "@/lib/utils";
import * as I from "../Icons";

/** Letra que acompanha a reprodução e permite pular para um verso. */
function Lyrics({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const p = usePlayer();
  const lines = p.current?.lyrics ?? [];
  const active = activeLyricIndex(lines, p.time);
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Mantém o verso atual sempre visível.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [active]);

  return (
    <section
      className={cx(
        "flex flex-col rounded-xl bg-surface/70 p-5 backdrop-blur",
        expanded ? "min-h-[420px]" : "h-[240px]",
      )}
    >
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink">Letra</h2>
        {lines.length > 0 && (
          <button
            type="button"
            onClick={onToggle}
            className="rounded p-1 text-ink-2 transition-colors hover:text-ink"
            aria-label={expanded ? "Recolher letra" : "Expandir letra"}
          >
            <I.Expand className="h-[18px] w-[18px]" />
          </button>
        )}
      </header>

      {lines.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <I.Mic className="h-7 w-7 text-ink-3" />
          <p className="text-sm text-ink-3">
            Esta faixa ainda não tem letra sincronizada.
          </p>
          <Link
            href="/studio/letras"
            className="text-xs text-ink-2 underline-offset-4 hover:text-ink hover:underline"
          >
            Adicionar no Studio
          </Link>
        </div>
      ) : (
        <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto pr-2">
          {lines.map((line, i) => (
            <button
              key={`${line.time}-${i}`}
              ref={i === active ? activeRef : null}
              type="button"
              onClick={() => p.seek(line.time)}
              className={cx(
                "block w-full text-left text-lg leading-snug transition-all duration-300",
                i === active
                  ? "font-semibold text-ink"
                  : i < active
                    ? "text-ink-3 hover:text-ink-2"
                    : "text-ink-2/70 hover:text-ink-2",
              )}
            >
              {line.text}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** Painel "Tocando agora" + "Próximas da fila". */
function QueuePanel() {
  const p = usePlayer();
  const { jam, isHost } = useJam();
  const { play } = usePlayIntent();
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const following = Boolean(jam) && !isHost;
  // Reordenar arrastando é do host e de quem ouve sozinho: no convidado
  // a fila é a da sala, e um arrasto ali seria desfeito pelo polling.
  const canReorder = !following;

  return (
    <aside className="flex w-full flex-col gap-5 rounded-xl bg-surface/70 p-4 backdrop-blur lg:w-[320px]">
      <div>
        <h2 className="mb-3 text-sm font-semibold text-ink">Tocando agora</h2>
        {p.current ? (
          <div className="flex items-center gap-3 rounded-lg bg-surface-2 p-2">
            <Cover
              src={p.current.cover}
              seed={p.current.id}
              name={p.current.title}
              className="h-11 w-11"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">
                {p.current.title}
              </p>
              <p className="truncate text-xs text-ink-2">
                {p.current.artist?.name}
              </p>
            </div>
            {p.playing && <I.EqualizerBars className="text-accent" />}
          </div>
        ) : (
          <p className="text-sm text-ink-3">Nada tocando.</p>
        )}
      </div>

      <div className="min-h-0 flex-1">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Próximas da fila</h2>
          {p.upNext.length > 0 && (
            <span className="text-[11px] tabular-nums text-ink-3">
              {p.upNext.length}
            </span>
          )}
        </div>

        {following && (
          <p className="mb-2 rounded-lg bg-dusk/10 px-3 py-2 text-[11px] leading-relaxed text-dusk">
            Esta é a fila do jam. Clique numa faixa para pedir que ela
            toque a seguir.
          </p>
        )}

        {p.upNext.length === 0 ? (
          <p className="text-xs text-ink-3">
            {p.loadingMore
              ? "Procurando o que tocar em seguida…"
              : following
                ? "O anfitrião ainda não enfileirou mais nada."
                : p.current
                  ? "Quando esta acabar, o Sona continua com algo parecido."
                  : "Escolha um álbum ou playlist para começar."}
          </p>
        ) : (
          <ul className="space-y-1 overflow-y-auto">
            {p.upNext.map((t, i) => {
              // A posição real na fila; `i` conta só a partir da atual.
              const at = p.index + 1 + i;
              return (
                <li
                  key={`${t.id}-${i}`}
                  draggable={canReorder}
                  onDragStart={(e) => {
                    setDragging(at);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", t.id);
                  }}
                  onDragOver={(e) => {
                    if (!canReorder || dragging === null || dragging === at)
                      return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setOver(at);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragging !== null && dragging !== at) {
                      p.moveInQueue(dragging, at);
                    }
                    setDragging(null);
                    setOver(null);
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setOver(null);
                  }}
                  className={cx(
                    "rounded-lg",
                    dragging === at && "opacity-40",
                    over === at && "ring-1 ring-inset ring-dusk",
                  )}
                >
                  <div className="group flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-surface-2">
                    {canReorder && (
                      <span
                        className="-ml-1 shrink-0 cursor-grab text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
                        aria-hidden
                      >
                        <I.Grip className="h-4 w-4" />
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => (following ? play(t) : p.playAt(at))}
                      title={following ? "Tocar a seguir no jam" : undefined}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <Cover src={t.cover} seed={t.id} name={t.title} className="h-10 w-10" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-ink">
                          {t.title}
                        </span>
                        <span className="block truncate text-xs text-ink-2">
                          {t.artist?.name}
                        </span>
                      </span>
                    </button>
                    {!following && (
                      <button
                        type="button"
                        onClick={() => p.removeFromQueue(at)}
                        className="shrink-0 text-ink-3 opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
                        aria-label={`Remover ${t.title} da fila`}
                      >
                        <I.X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}

/** Tela cheia de reprodução, sobreposta ao app. */
export function NowPlaying({ onClose }: { onClose: () => void }) {
  const p = usePlayer();
  const { jam, isHost } = useJam();
  const t = p.current;
  const [expandedLyrics, setExpandedLyrics] = useState(false);

  /**
   * Os controles grandes desta tela obedecem à mesma regra da barra de
   * baixo: num jam, quem comanda é o host. Sem isto, a tela cheia
   * oferecia um play e um "próxima" que o polling desfazia meio segundo
   * depois — o mesmo botão dizia sim aqui e não lá embaixo.
   */
  const following = Boolean(jam) && !isHost;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const bg = useMemo(
    () => (t?.cover ? `url(${t.cover})` : undefined),
    [t?.cover],
  );

  if (!t) return null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-canvas">
      {/* Fundo desfocado a partir da capa, como na referência */}
      {bg && (
        <div
          className="pointer-events-none absolute inset-0 scale-110 bg-cover bg-center opacity-30 blur-3xl"
          style={{ backgroundImage: bg }}
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-void/50 via-canvas/80 to-canvas" />

      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
        <header className="flex items-center justify-between px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-ink-2 transition-colors hover:bg-surface hover:text-ink"
          >
            <I.ChevronDown className="h-5 w-5" />
            Voltar
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded p-2 text-ink-2 hover:text-ink"
              aria-label="Conectar dispositivo"
            >
              <I.Devices className="h-[18px] w-[18px]" />
            </button>
            <button
              type="button"
              className="rounded bg-surface-2 p-2 text-ink"
              aria-label="Fila"
            >
              <I.Queue className="h-[18px] w-[18px]" />
            </button>
          </div>
        </header>

        <div className="mx-auto grid w-full max-w-[1400px] grid-cols-1 gap-6 px-6 pb-10 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* coluna principal */}
          <div className="space-y-6">
            <div className="flex flex-col gap-6 md:flex-row md:items-end">
              <Cover
                src={t.cover}
                seed={t.id}
                name={t.title}
                rounded="rounded-xl"
                className="aspect-square w-full max-w-[300px] shadow-2xl shadow-black/50"
              />
              <div className="min-w-0 flex-1 pb-2">
                {t.genre && (
                  <p className="mb-2 text-xs uppercase tracking-[0.2em] text-ink-2">
                    {t.genre}
                  </p>
                )}
                <h1 className="text-4xl font-bold leading-tight text-ink md:text-5xl">
                  {t.title}
                </h1>
                {t.artist && (
                  <Link
                    href={`/artista/${t.artist.id}`}
                    onClick={onClose}
                    className="mt-2 inline-block text-xl text-ink-2 hover:text-ink hover:underline"
                  >
                    {t.artist.name}
                  </Link>
                )}
                <div className="mt-5 flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => p.like(t.id)}
                    className={cx(
                      "transition-colors",
                      p.isLiked(t.id) ? "text-accent" : "text-ink-2 hover:text-ink",
                    )}
                    aria-label={p.isLiked(t.id) ? "Remover das curtidas" : "Curtir"}
                    aria-pressed={p.isLiked(t.id)}
                  >
                    {p.isLiked(t.id) ? (
                      <I.HeartFilled className="h-6 w-6" />
                    ) : (
                      <I.Heart className="h-6 w-6" />
                    )}
                  </button>
                  <button
                    type="button"
                    className="text-ink-2 transition-colors hover:text-ink"
                    aria-label="Mais opções"
                  >
                    <I.Dots className="h-6 w-6" />
                  </button>
                </div>
              </div>
            </div>

            {/* controles grandes */}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="w-10 text-right text-xs tabular-nums text-ink-2">
                  {formatTime(p.time)}
                </span>
                <input
                  type="range"
                  className="sona-range flex-1"
                  min={0}
                  max={p.duration || 1}
                  step={0.1}
                  value={p.time}
                  aria-label="Progresso da faixa"
                  disabled={following}
                  onChange={(e) =>
                    !following && p.seek(Number(e.target.value))
                  }
                  style={
                    {
                      "--track-pct": `${p.duration ? (p.time / p.duration) * 100 : 0}%`,
                      "--track-fill": following ? "#7b5cf0" : "#fff",
                    } as React.CSSProperties
                  }
                />
                <span className="w-10 text-xs tabular-nums text-ink-2">
                  {formatTime(p.duration)}
                </span>
              </div>
              <div className="flex items-center justify-center gap-6">
                <button
                  type="button"
                  onClick={p.toggleShuffle}
                  disabled={following}
                  className={cx(
                    p.shuffle ? "text-accent" : "text-ink-2 hover:text-ink",
                    following && "opacity-40",
                  )}
                  aria-label="Aleatório"
                  aria-pressed={p.shuffle}
                >
                  <I.Shuffle className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={p.prev}
                  disabled={following}
                  className={cx(
                    "text-ink hover:scale-105",
                    following && "opacity-40 hover:scale-100",
                  )}
                  aria-label="Anterior"
                >
                  <I.Prev className="h-7 w-7" />
                </button>
                <button
                  type="button"
                  onClick={p.toggle}
                  disabled={following}
                  className={cx(
                    "grid h-16 w-16 place-items-center rounded-full border transition-transform",
                    following
                      ? "border-hairline text-ink-3"
                      : "border-ink/70 text-ink hover:scale-105",
                  )}
                  aria-label={
                    following
                      ? "O anfitrião do jam controla a reprodução"
                      : p.playing
                        ? "Pausar"
                        : "Tocar"
                  }
                  title={
                    following
                      ? "O anfitrião do jam controla a reprodução"
                      : undefined
                  }
                >
                  {p.playing ? (
                    <I.Pause className="h-6 w-6" />
                  ) : (
                    <I.Play className="ml-1 h-6 w-6" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={p.next}
                  disabled={following}
                  className={cx(
                    "text-ink hover:scale-105",
                    following && "opacity-40 hover:scale-100",
                  )}
                  aria-label="Próxima"
                >
                  <I.Next className="h-7 w-7" />
                </button>
                <button
                  type="button"
                  onClick={p.cycleRepeat}
                  disabled={following}
                  className={cx(
                    p.repeat !== "off" ? "text-accent" : "text-ink-2 hover:text-ink",
                    following && "opacity-40",
                  )}
                  aria-label="Repetir"
                >
                  <I.Repeat className="h-5 w-5" />
                </button>
              </div>

              {following && (
                <p className="text-center text-xs text-dusk">
                  {jam?.name} — o anfitrião comanda a reprodução.
                </p>
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
              <Lyrics
                expanded={expandedLyrics}
                onToggle={() => setExpandedLyrics((v) => !v)}
              />

              {/* Sobre o artista */}
              {t.artist && (
                <section className="rounded-xl bg-surface/70 p-5 backdrop-blur">
                  <h2 className="mb-4 text-base font-semibold text-ink">
                    Sobre o artista
                  </h2>
                  <div className="flex items-center gap-4">
                    <Avatar
                      src={t.artist.image}
                      seed={t.artist.id}
                      name={t.artist.name}
                      className="h-16 w-16"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">
                        {t.artist.name}
                      </p>
                      <p className="text-sm text-ink-2">
                        {formatPlays(t.plays)} desta faixa
                      </p>
                    </div>
                  </div>
                  {t.artist.bio && (
                    <p className="mt-4 line-clamp-4 text-sm leading-relaxed text-ink-2">
                      {t.artist.bio}
                    </p>
                  )}
                  <Link
                    href={`/artista/${t.artist.id}`}
                    onClick={onClose}
                    className="mt-4 inline-flex items-center gap-1 text-sm text-ink-2 transition-colors hover:text-ink"
                  >
                    Ver mais <I.ChevronRight className="h-4 w-4" />
                  </Link>
                </section>
              )}
            </div>
          </div>

          <QueuePanel />
        </div>
      </div>
    </div>
  );
}
