/**
 * Esqueletos de carregamento.
 *
 * O `loading.tsx` de cada rota é prefetchado junto com o layout, então
 * aparece no instante do clique — a navegação deixa de parecer travada
 * enquanto o servidor monta a página.
 */

/** Bloco cinza com a pulsação padrão. */
function Bar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-surface-2 ${className}`} />;
}

/** Grade de capas — home, playlists, artistas, álbuns. */
export function CardGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <Bar className="aspect-square w-full" />
          <Bar className="mt-3 h-3.5 w-3/4" />
          <Bar className="mt-2 h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/** Lista de faixas — biblioteca, curtidas, busca. */
export function TrackListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="mt-2 space-y-1">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-2">
          <Bar className="h-4 w-4 shrink-0" />
          <Bar className="h-10 w-10 shrink-0" />
          <div className="min-w-0 flex-1">
            <Bar className="h-3.5 w-1/3" />
            <Bar className="mt-2 h-3 w-1/4" />
          </div>
          <Bar className="h-3 w-10 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** Cabeçalho de página com capa grande — álbum, playlist. */
export function PageHeaderSkeleton() {
  return (
    <header className="flex flex-col gap-6 md:flex-row md:items-end">
      <Bar className="aspect-square w-full max-w-[220px] shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <Bar className="h-3 w-24" />
        <Bar className="mt-3 h-10 w-2/3" />
        <Bar className="mt-4 h-3.5 w-40" />
        <div className="mt-6 flex gap-3">
          <Bar className="h-12 w-40 rounded-full" />
          <Bar className="h-12 w-32 rounded-full" />
        </div>
      </div>
    </header>
  );
}

/** Lista de pessoas — amigos, participantes de um jam. */
export function PeopleListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <Bar className="h-11 w-11 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Bar className="h-3.5 w-40" />
            <Bar className="mt-2 h-3 w-52" />
          </div>
          <Bar className="h-8 w-24 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Título simples das páginas de listagem. */
export function TitleSkeleton() {
  return <Bar className="mb-6 h-9 w-56" />;
}

/** Moldura comum das rotas do cliente. */
export function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="px-6 pb-12 pt-2 md:px-8">{children}</div>;
}
