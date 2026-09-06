import Link from "next/link";
import { cx } from "@/lib/utils";

/** Cabeçalho de seção com "Ver todos" à direita, como nas referências. */
export function Section({
  title,
  href,
  children,
  className,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("mt-8", className)}>
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-bold tracking-tight text-ink">{title}</h2>
        {href && (
          <Link
            href={href}
            className="shrink-0 text-xs font-medium text-ink-2 transition-colors hover:text-ink hover:underline"
          >
            Ver todos
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** Grade responsiva padrão para cards de faixa/artista. */
export function CardGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Estado vazio. A biblioteca nasce sem conteúdo, então esta tela é
 * parte do produto — ela ensina o caminho até o Studio.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-hairline bg-surface/30 px-6 py-16 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-surface-2 text-ink-2">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
        {description}
      </p>
      {action && (
        <Link
          href={action.href}
          className="mt-6 inline-flex items-center rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-accent-ink transition-all hover:scale-[1.03] hover:bg-accent-hover"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

/** Cabeçalho grande de páginas de coleção (álbum, playlist, artista). */
export function PageHeader({
  eyebrow,
  title,
  meta,
  children,
  cover,
}: {
  eyebrow?: string;
  title: string;
  meta?: React.ReactNode;
  children?: React.ReactNode;
  cover?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-6 md:flex-row md:items-end">
      {cover}
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-ink-2">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-2 text-4xl font-bold leading-tight tracking-tight text-ink md:text-5xl">
          {title}
        </h1>
        {meta && <div className="mt-3 text-sm text-ink-2">{meta}</div>}
        {children && <div className="mt-6">{children}</div>}
      </div>
    </header>
  );
}
