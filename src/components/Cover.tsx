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
