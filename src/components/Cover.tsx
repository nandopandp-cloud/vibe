import { cx, gradientFor, initials } from "@/lib/utils";
import { Music } from "./Icons";

/**
 * Capa de faixa/álbum/playlist. Sem imagem enviada, cai num gradiente
 * determinístico com a inicial — nunca um buraco cinza na grade.
 */
export function Cover({
  src,
  seed,
  name,
  className,
  rounded = "rounded-md",
  icon = false,
}: {
  src?: string | null;
  seed: string;
  name?: string;
  className?: string;
  rounded?: string;
  icon?: boolean;
}) {
  const base = cx(
    "relative overflow-hidden bg-surface-2 shrink-0 select-none [container-type:size]",
    rounded,
    className,
  );

  if (src) {
    return (
      <div className={base}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={name ? `Capa de ${name}` : ""}
          className="h-full w-full object-cover"
          loading="lazy"
          draggable={false}
        />
      </div>
    );
  }

  return (
    <div className={base} style={{ background: gradientFor(seed) }}>
      <div className="absolute inset-0 grid place-items-center">
        {icon || !name ? (
          <Music className="h-1/3 w-1/3 text-white/70" />
        ) : (
          <span
            className="font-extrabold tracking-tight text-white/85"
            style={{ fontSize: "clamp(14px, 34cqw, 64px)" }}
          >
            {initials(name)}
          </span>
        )}
      </div>
      {/* Brilho sutil no topo, como as capas fotográficas das referências */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/12 to-transparent" />
    </div>
  );
}

/** Avatar redondo de artista/usuário. */
export function Avatar({
  src,
  seed,
  name,
  className,
}: {
  src?: string | null;
  seed: string;
  name?: string;
  className?: string;
}) {
  return (
    <Cover
      src={src}
      seed={seed}
      name={name}
      rounded="rounded-full"
      className={className}
    />
  );
}

/**
 * Capa em mosaico para playlists sem imagem própria.
 *
 * As quatro primeiras capas distintas das faixas viram um grid 2×2; com
 * menos de quatro, a primeira ocupa tudo — um mosaico incompleto fica
 * pior do que uma capa só. Sem nenhuma capa, cai no gradiente do `Cover`,
 * então a playlist nunca aparece como um buraco na grade.
 *
 * Nada disso é gravado: a capa é derivada das faixas e acompanha a
 * playlist conforme ela muda.
 */
export function MosaicCover({
  covers,
  seed,
  name,
  className,
  rounded = "rounded-md",
}: {
  covers: Array<string | null>;
  seed: string;
  name?: string;
  className?: string;
  rounded?: string;
}) {
  // Distintas: a mesma capa repetida quatro vezes não é um mosaico. A
  // ordem de chegada é preservada, então a capa da primeira faixa fica
  // sempre no lugar de destaque.
  const unique = [...new Set(covers.filter((c): c is string => Boolean(c)))];

  // Sem nenhuma capa, o gradiente com as iniciais.
  if (unique.length === 0) {
    return (
      <Cover
        src={null}
        seed={seed}
        name={name}
        rounded={rounded}
        className={className}
      />
    );
  }

  // Uma só: ocupa tudo, sem moldura de mosaico.
  if (unique.length === 1) {
    return (
      <Cover
        src={unique[0]}
        seed={seed}
        name={name}
        rounded={rounded}
        className={className}
      />
    );
  }

  const shown = unique.slice(0, 4);

  /*
   * O mosaico cresce com a playlist, em vez de esperar quatro capas para
   * existir: duas dividem ao meio, três põem a primeira alta à esquerda
   * com as outras empilhadas, e quatro fecham o grid clássico.
   */
  const layout =
    shown.length === 2
      ? "grid-cols-2 grid-rows-1"
      : shown.length === 3
        ? "grid-cols-2 grid-rows-2"
        : "grid-cols-2 grid-rows-2";

  return (
    <div
      className={cx(
        "relative grid shrink-0 overflow-hidden bg-surface-2 select-none",
        layout,
        rounded,
        className,
      )}
      role="img"
      aria-label={name ? `Capa de ${name}` : undefined}
    >
      {shown.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${src}-${i}`}
          src={src}
          alt=""
          // Com três capas, a primeira ocupa a coluna inteira à esquerda.
          className={cx(
            "h-full w-full object-cover",
            shown.length === 3 && i === 0 && "row-span-2",
          )}
          loading="lazy"
          draggable={false}
        />
      ))}
    </div>
  );
}
