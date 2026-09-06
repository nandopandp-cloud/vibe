import Image from "next/image";
import { cx } from "@/lib/utils";

/** Proporção do arquivo original (1556×302), preservada em qualquer tamanho. */
const RATIO = 1556 / 302;

/**
 * Wordmark do Sona — o arquivo enviado pela marca, recortado no conteúdo.
 * É a logo oficial, então usamos a arte em si em vez de redesenhá-la:
 * no original o N e o A dividem a mesma diagonal e o A tem o vértice
 * chanfrado, detalhes que um traçado aproximado perde.
 */
export function SonaMark({
  className,
  width = 108,
  priority = false,
}: {
  className?: string;
  width?: number;
  priority?: boolean;
}) {
  return (
    <Image
      src="/images/sona-logo.png"
      alt="Sona"
      width={width}
      height={Math.round(width / RATIO)}
      priority={priority}
      // A logo é pequena e cheia de contornos finos: sem qualidade alta
      // e sem pedir o dobro da largura, o Next serve uma versão que
      // borra em telas retina.
      quality={95}
      sizes={`${width * 2}px`}
      className={cx("h-auto select-none", className)}
    />
  );
}

/** Logo + tagline, como aparece no topo da sidebar nas referências. */
export function Logo({
  className,
  tagline = true,
  width = 108,
  priority = false,
}: {
  className?: string;
  tagline?: boolean;
  width?: number;
  priority?: boolean;
}) {
  return (
    <div className={cx("select-none", className)}>
      <SonaMark width={width} priority={priority} />
      {tagline && (
        <div className="tagline mt-1.5 pl-0.5">Música sem fronteiras</div>
      )}
    </div>
  );
}
