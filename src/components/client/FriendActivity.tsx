"use client";

import { UserAvatar } from "./UserMenu";
import { useFriendsActivity } from "./PresenceProvider";
import { usePlayIntent } from "./usePlayIntent";
import { Cover } from "../Cover";
import { cx } from "@/lib/utils";
import * as I from "../Icons";
import type { FriendActivity as Activity } from "@/lib/types";

/**
 * O que os amigos estão ouvindo.
 *
 * A tela toda gira em torno de uma pergunta pequena — "está online?" — e
 * de uma resposta que só vale no presente. Por isso a faixa aparece
 * apenas de quem está online: mostrar a última música de quem saiu há
 * uma hora seria um retrato antigo passando por notícia.
 */

/**
 * A bolinha de presença.
 *
 * Verde cheio para quem está com música no ar, verde vazado para quem
 * está por aqui em silêncio, e apagada para quem saiu. A diferença entre
 * os dois primeiros importa: "online" e "ouvindo" são coisas distintas,
 * e um círculo só não saberia dizer qual das duas.
 */
function PresenceDot({ online, playing }: { online: boolean; playing: boolean }) {
  return (
    <span
      className={cx(
        "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-canvas",
        online
          ? playing
            ? "bg-accent"
            : "bg-accent/35"
          : "bg-surface-3",
      )}
    />
  );
}

/** "há 4 min", "há 2 h" — a idade da última notícia, arredondada. */
function agoLabel(iso: string | null): string {
  if (!iso) return "Nunca esteve por aqui";

  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "Agora mesmo";
  if (minutes < 60) return `Visto há ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Visto há ${hours} h`;

  const days = Math.floor(hours / 24);
  return days === 1 ? "Visto ontem" : `Visto há ${days} dias`;
}

/**
 * Uma pessoa e o que ela está ouvindo.
 *
 * Clicar na faixa toca a mesma música — é o gesto que a tela toda
 * sugere, e negá-lo faria da lista um cartaz. O clique passa pelo
 * `usePlayIntent`, então ele também respeita um jam em andamento: o
 * convidado põe a música na fila da sala em vez de sair tocando sozinho.
 *
 * As ações ficam com quem chama, em `children`: a tela de amigos põe
 * aqui o "desfazer amizade", e a sidebar não põe nada. A linha sabe
 * mostrar uma pessoa; o que se pode fazer com ela é assunto do contexto.
 */
export function FriendActivityRow({
  friend,
  children,
}: {
  friend: Activity;
  children?: React.ReactNode;
}) {
  const { play, following } = usePlayIntent();
  const { user, online, track, playing } = friend;

  return (
    <li
      className={cx(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface/60",
        // Quem saiu desbota junto com a informação dele — a lista
        // continua completa, mas o olho vai primeiro a quem está aqui.
        !online && "opacity-55",
      )}
    >
      <div className="relative shrink-0">
        <UserAvatar user={user} className="h-11 w-11 text-sm" />
        <PresenceDot online={online} playing={playing} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{user.name}</p>

        {online && track ? (
          <button
            type="button"
            onClick={() => play(track)}
            title={
              following
                ? `Pôr "${track.title}" na fila do jam`
                : `Tocar "${track.title}"`
            }
            className="group/track mt-0.5 flex max-w-full items-center gap-2 text-left"
          >
            <Cover
              src={track.cover}
              seed={track.id}
              name={track.title}
              className="h-7 w-7"
              rounded="rounded"
            />
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium text-ink-2 group-hover/track:text-accent">
                {track.title}
              </span>
              <span className="block truncate text-[11px] text-ink-3">
                {track.artist?.name ?? "Artista desconhecido"}
              </span>
            </span>
          </button>
        ) : (
          <p className="truncate text-xs text-ink-3">
            {online ? "Online — sem música no ar" : agoLabel(friend.lastSeenAt)}
          </p>
        )}
      </div>

      {/* O equalizador é o único sinal que se move, e só quando há som
          de fato: pausado é online, mas não é "tocando agora". */}
      {online && track && playing && (
        <I.EqualizerBars className="shrink-0 text-accent" />
      )}
      {online && track && !playing && (
        <I.Pause className="h-4 w-4 shrink-0 text-ink-3" />
      )}

      {children && (
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      )}
    </li>
  );
}

/** Quantos estão online, dito em português. */
export function onlineSummary(count: number): string {
  if (count === 0) return "Ninguém online agora.";
  return count === 1 ? "1 amigo online." : `${count} amigos online.`;
}

/**
 * A lista inteira, já ordenada pelo servidor: quem está tocando primeiro,
 * depois quem está online, e os ausentes no fim.
 */
export function FriendsActivityList({
  emptyHint,
  actions,
}: {
  /** O que dizer quando a pessoa ainda não tem amigos. */
  emptyHint?: React.ReactNode;
  /** Botões de cada linha — a tela de amigos manda o "desfazer". */
  actions?: (friend: Activity) => React.ReactNode;
}) {
  const { friends, onlineCount } = useFriendsActivity();

  if (friends.length === 0) return <>{emptyHint}</>;

  return (
    <>
      <p className="mb-2 px-3 text-xs text-ink-3">
        {onlineSummary(onlineCount)}
      </p>
      <ul className="space-y-0.5">
        {friends.map((friend) => (
          <FriendActivityRow key={friend.user.id} friend={friend}>
            {actions?.(friend)}
          </FriendActivityRow>
        ))}
      </ul>
    </>
  );
}
