import { cx } from "@/lib/utils";

/**
 * Wordmark do Sona, traçado a partir das medidas da logo original
 * (glifos isolados e amostrados pixel a pixel, normalizados para 340x100).
 *
 * Sans geométrico pesado, haste de ~16.8 unidades:
 *  S — um "Z espelhado" de terminais chanfrados, não um S caligráfico
 *  O — anel circular perfeito
 *  N — hastes retas com diagonal cheia
 *  A — ápice fechado, sem travessão
 */
export function SonaMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 340 100"
      className={cx("h-auto", className)}
      role="img"
      aria-label="Sona"
      fill="currentColor"
    >
      {/* S — barra sup., haste esq., barra méd., haste dir., barra inf. */}
      <path d="M12.7 6 H79.8 V22.8 H29.5 V37.5 H62.8 A17 17 0 0 1 62.8 71.5 H16.8 V54.7 H62.8 V40 H29.5 A17 17 0 0 1 29.5 6 Z" />

      {/* O — anel circular */}
      <circle
        cx="123.1"
        cy="50"
        r="28.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="16.8"
      />

      {/* N — haste esquerda, diagonal, haste direita */}
      <path d="M168.1 94 V6 h16.7 l46.5 60.5 V6 h16 v88 h-16 l-46.5 -60.5 V94 Z" />

      {/* A — duas pernas convergindo num ápice fechado */}
      <path d="M289.1 6 h15.5 l35.2 88 h-18.4 l-24.5 -62 -24.5 62 h-18.4 Z" />
    </svg>
  );
}

/** Logo + tagline, como aparece no topo da sidebar nas referências. */
export function Logo({
  className,
  tagline = true,
}: {
  className?: string;
  tagline?: boolean;
}) {
  return (
    <div className={cx("select-none", className)}>
      <SonaMark className="w-[108px] text-ink" />
      {tagline && (
        <div className="tagline mt-1.5 pl-0.5">Música sem fronteiras</div>
      )}
    </div>
  );
}
