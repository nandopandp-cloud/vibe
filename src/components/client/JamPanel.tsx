"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useJam } from "./JamProvider";
import { usePlayer } from "./PlayerProvider";
import { UserAvatar } from "./UserMenu";
import { Cover } from "../Cover";
import { inviteFriendToJam, removeFromJam } from "@/lib/jam-actions";
import { cx } from "@/lib/utils";
import * as I from "../Icons";
import type { FriendEdge, JamParticipant } from "@/lib/types";

/**
 * O painel do jam: quem está ouvindo, o que vem depois, e como chamar
 * mais gente. Abre por cima do conteúdo, como o "tocando agora".
 */

/* ------------------------------------------------------------------ */
/* Participantes                                                       */
/* ------------------------------------------------------------------ */

function ParticipantRow({ person }: { person: JamParticipant }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <div className="relative shrink-0">
        <UserAvatar user={person} className="h-10 w-10 text-xs" />
        {/* A bolinha só acende com ping recente: mostrar todo mundo como
            presente faria a sala parecer cheia depois de esvaziar. */}
        <span
          className={cx(
            "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface",
            person.online ? "bg-accent" : "bg-surface-3",
          )}
          aria-hidden
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{person.name}</p>
        <p className="truncate text-xs text-ink-3">
          {person.isHost
            ? "Anfitrião"
            : person.online
              ? "Ouvindo agora"
              : "Ausente"}
        </p>
      </div>
      {person.isHost && (
        <span className="shrink-0 rounded-full bg-dusk/15 px-2.5 py-1 text-[11px] font-medium text-dusk">
          Host
        </span>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Convidar                                                            */
/* ------------------------------------------------------------------ */

function InviteFriends({
  jamId,
  friends,
  alreadyIn,
}: {
  jamId: string;
  friends: FriendEdge[];
  alreadyIn: Set<string>;
}) {
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const available = friends.filter((f) => !alreadyIn.has(f.user.id));

  if (friends.length === 0) {
    return (
      <p className="px-1 py-3 text-xs leading-relaxed text-ink-3">
        Você ainda não tem amigos por aqui. Compartilhe o link acima, ou
        adicione pessoas em{" "}
        <a href="/amigos" className="text-ink-2 underline">
          Amigos
        </a>
        .
      </p>
    );
  }

  if (available.length === 0) {
    return (
      <p className="px-1 py-3 text-xs text-ink-3">
        Todos os seus amigos já estão no jam.
      </p>
    );
  }

  return (
    <ul className="space-y-0.5">
      {available.map(({ user }) => {
        const sent = invited.has(user.id);
        return (
          <li key={user.id} className="flex items-center gap-3 py-1.5">
            <UserAvatar user={user} className="h-9 w-9 text-xs" />
            <span className="min-w-0 flex-1 truncate text-sm text-ink-2">
              {user.name}
            </span>
            <button
              type="button"
              disabled={pending || sent}
              onClick={() =>
                startTransition(async () => {
                  const res = await inviteFriendToJam(jamId, user.id);
                  // O convite fica marcado mesmo se falhar por já existir:
                  // nos dois casos a pessoa foi chamada.
                  if (res.ok) {
                    setInvited((prev) => new Set(prev).add(user.id));
                  }
                })
              }
              className={cx(
                "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60",
                sent
                  ? "text-accent"
                  : "border border-hairline text-ink-2 hover:border-ink/40 hover:text-ink",
              )}
            >
              {sent ? (
                <span className="inline-flex items-center gap-1">
                  <I.Check className="h-3.5 w-3.5" />
                  Convidado
                </span>
              ) : (
                "Convidar"
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Link                                                                */
/* ------------------------------------------------------------------ */

function ShareLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  // O link só é montado no navegador: a origem depende de onde o app
  // está publicado, e no servidor ela seria um palpite.
  const url =
    typeof window === "undefined" ? "" : `${window.location.origin}/jam/${code}`;

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard
          ?.writeText(url)
          .then(() => setCopied(true))
          .catch(() => {});
      }}
      className="flex w-full items-center gap-3 rounded-xl border border-hairline bg-surface-2 px-4 py-3 text-left transition-colors hover:border-ink/30"
    >
      <I.Link className="h-[18px] w-[18px] shrink-0 text-ink-2" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-ink">
          {copied ? "Link copiado!" : "Copiar link do jam"}
        </p>
        <p className="truncate text-[11px] text-ink-3">
          Código {code} — quem tiver o link entra.
        </p>
      </div>
      {copied && <I.Check className="h-4 w-4 shrink-0 text-accent" />}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Painel                                                              */
/* ------------------------------------------------------------------ */

export function JamPanel({
  friends,
  onClose,
}: {
  friends: FriendEdge[];
  onClose: () => void;
}) {
  const { jam, isHost, leave, sync } = useJam();
  const player = usePlayer();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // O jam pode terminar com o painel aberto — aí não há mais o que ver.
  useEffect(() => {
    if (!jam) onClose();
  }, [jam, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!jam) return null;

  const inRoom = new Set(jam.participants.map((p) => p.id));
  const upNext = jam.queue.slice(Math.max(jam.index, 0) + 1);
  const online = jam.participants.filter((p) => p.online).length;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Jam"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <aside className="flex h-full w-full max-w-[400px] flex-col border-l border-hairline bg-sidebar">
        <header className="flex items-start gap-3 border-b border-hairline px-5 py-4">
          <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-dusk/15 text-dusk">
            <I.Jam className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-ink">
              {jam.name}
            </h2>
            <p className="mt-0.5 text-xs text-ink-3">
              {online} {online === 1 ? "pessoa ouvindo" : "pessoas ouvindo"}
              {!isHost && " • seguindo o anfitrião"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="shrink-0 rounded-full p-1.5 text-ink-2 transition-colors hover:bg-surface hover:text-ink"
          >
            <I.X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <ShareLink code={jam.code} />

          <section>
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-ink-3">
              Na sala
            </h3>
            <ul>
              {jam.participants.map((p) => (
                <ParticipantRow key={p.id} person={p} />
              ))}
            </ul>
          </section>

          <section>
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-ink-3">
              Convidar amigos
            </h3>
            <InviteFriends
              jamId={jam.id}
              friends={friends}
              alreadyIn={inRoom}
            />
          </section>

          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-3">
              Na fila
            </h3>
            {upNext.length === 0 ? (
              <p className="px-1 text-xs leading-relaxed text-ink-3">
                A fila acabou. Qualquer pessoa da sala pode adicionar música
                pelo menu “⋯” de uma faixa.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {upNext.map((track) => (
                  <li
                    key={track.id}
                    className="group flex items-center gap-3 rounded-lg px-1 py-1.5"
                  >
                    <Cover
                      src={track.cover}
                      seed={track.id}
                      name={track.title}
                      className="h-10 w-10 shrink-0 rounded"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">
                        {track.title}
                      </p>
                      <p className="truncate text-xs text-ink-3">
                        {track.artist?.name ?? "Artista desconhecido"}
                      </p>
                    </div>
                    {isHost && (
                      <button
                        type="button"
                        aria-label={`Remover ${track.title} da fila`}
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            await removeFromJam(jam.id, track.id);
                            sync();
                          })
                        }
                        className="shrink-0 rounded-full p-1.5 text-ink-3 opacity-0 transition-opacity hover:text-rose focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <I.X className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <footer className="border-t border-hairline p-4">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await leave();
                // Sair devolve o player a você: sem o modo seguidor, a
                // música que estava tocando continua, agora só sua.
                player.setFollower(false);
                onClose();
                router.refresh();
              })
            }
            className="w-full rounded-full border border-hairline px-4 py-3 text-sm font-semibold text-ink-2 transition-colors hover:border-rose/50 hover:text-rose disabled:opacity-60"
          >
            {isHost ? "Encerrar jam para todos" : "Sair do jam"}
          </button>
        </footer>
      </aside>
    </div>
  );
}
