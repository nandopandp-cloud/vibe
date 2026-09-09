"use client";

import { useOptimistic, useTransition } from "react";
import { toggleFollowArtist } from "@/lib/actions";
import { cx } from "@/lib/utils";
import * as I from "../Icons";

/**
 * Salva o artista em "Seus Artistas". Otimista: o estado vira na hora e
 * o servidor confirma depois — seguir é barato e reversível, então não
 * vale travar a interface esperando a resposta.
 */
export function FollowButton({
  artistId,
  following,
  className,
}: {
  artistId: string;
  following: boolean;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(following);

  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={optimistic}
      onClick={() =>
        startTransition(async () => {
          setOptimistic(!optimistic);
          await toggleFollowArtist(artistId);
        })
      }
      className={cx(
        "inline-flex items-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold transition-all hover:scale-[1.03]",
        optimistic
          ? "border-accent/40 bg-accent/10 text-accent"
          : "border-hairline text-ink hover:border-ink/60 hover:bg-surface",
        className,
      )}
    >
      {optimistic ? (
        <I.HeartFilled className="h-[18px] w-[18px]" />
      ) : (
        <I.Heart className="h-[18px] w-[18px]" />
      )}
      {optimistic ? "Salvo" : "Salvar artista"}
    </button>
  );
}
