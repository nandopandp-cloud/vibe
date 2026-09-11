"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserAvatar } from "./UserMenu";
import { FriendsActivityList } from "./FriendActivity";
import { useFriendsActivity } from "./PresenceProvider";
import {
  acceptFriendRequest,
  removeFriendship,
  searchPeople,
  sendFriendRequest,
  type FriendsView,
  type PersonResult,
} from "@/lib/friends-actions";
import { cx } from "@/lib/utils";
import * as I from "../Icons";
import type { PublicUser } from "@/lib/types";

/** Espera depois da última tecla antes de consultar o servidor. */
const SEARCH_DEBOUNCE = 300;

/* ------------------------------------------------------------------ */
/* Linha de pessoa                                                     */
/* ------------------------------------------------------------------ */

function PersonRow({
  user,
  subtitle,
  children,
}: {
  user: PublicUser;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface/60">
      <UserAvatar user={user} className="h-11 w-11 text-sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{user.name}</p>
        <p className="truncate text-xs text-ink-3">{subtitle}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </li>
  );
}

function ActionButton({
  onClick,
  pending,
  variant = "ghost",
  children,
}: {
  onClick: () => void;
  pending: boolean;
  variant?: "solid" | "ghost" | "danger";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50",
        variant === "solid" &&
          "bg-accent text-accent-ink hover:bg-accent-hover",
        variant === "ghost" &&
          "border border-hairline text-ink-2 hover:border-ink/40 hover:text-ink",
        variant === "danger" &&
          "border border-hairline text-ink-3 hover:border-rose/50 hover:text-rose",
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Busca                                                               */
/* ------------------------------------------------------------------ */

function SearchPeople({ onChanged }: { onChanged: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [pending, startTransition] = useTransition();
  /** Descarta respostas de buscas que a digitação já tornou obsoletas. */
  const latest = useRef(0);

  const q = query.trim();
  const active = q.length >= 2;

  useEffect(() => {
    // Busca curta demais não vai ao servidor — e o resultado antigo é
    // descartado no render, não aqui, para o efeito não encadear um
    // segundo render só para esvaziar a lista.
    if (q.length < 2) return;

    const ticket = ++latest.current;
    const timer = setTimeout(() => {
      // O "procurando" só aparece quando a consulta sai de fato: mostrá-lo
      // a cada tecla faria a linha piscar durante a digitação.
      setSearching(true);
      void searchPeople(q)
        .then((found) => {
          // Uma busca lenta não pode sobrescrever o resultado de outra
          // mais recente que já voltou.
          if (ticket !== latest.current) return;
          setResults(found);
        })
        .finally(() => {
          if (ticket === latest.current) setSearching(false);
        });
    }, SEARCH_DEBOUNCE);

    return () => clearTimeout(timer);
  }, [q]);

  // A lista visível é derivada: enquanto a busca não tem tamanho, não há
  // resultado nenhum, mesmo que o estado ainda guarde o da busca anterior.
  const visible = active ? results : [];

  /** Refaz a busca depois de agir, para o botão refletir a nova relação. */
  const act = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      if (active) setResults(await searchPeople(q));
      onChanged();
    });

  return (
    <section className="rounded-2xl border border-hairline bg-surface/40 p-5">
      <label
        htmlFor="find-people"
        className="mb-2 block text-sm font-semibold text-ink"
      >
        Encontrar pessoas
      </label>
      <div className="relative">
        <I.Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-3" />
        <input
          id="find-people"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nome ou e-mail completo"
          className="h-12 w-full rounded-xl bg-surface-2 pl-12 pr-4 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        />
      </div>

      {active && (
        <div className="mt-3">
          {searching && visible.length === 0 ? (
            <p className="px-3 py-4 text-xs text-ink-3">Procurando…</p>
          ) : visible.length === 0 ? (
            <p className="px-3 py-4 text-xs text-ink-3">
              Ninguém encontrado. O e-mail precisa ser digitado por inteiro.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {visible.map(({ user, relation }) => (
                <PersonRow
                  key={user.id}
                  user={user}
                  subtitle={
                    relation === "friends"
                      ? "Já é seu amigo"
                      : relation === "sent"
                        ? "Pedido enviado"
                        : relation === "received"
                          ? "Quer ser seu amigo"
                          : user.email
                  }
                >
                  {relation === "none" && (
                    <ActionButton
                      variant="solid"
                      pending={pending}
                      onClick={() => act(() => sendFriendRequest(user.id))}
                    >
                      <I.UserPlus className="h-4 w-4" />
                      Adicionar
                    </ActionButton>
                  )}
                  {relation === "received" && (
                    <ActionButton
                      variant="solid"
                      pending={pending}
                      onClick={() => act(() => acceptFriendRequest(user.id))}
                    >
                      <I.Check className="h-4 w-4" />
                      Aceitar
                    </ActionButton>
                  )}
                  {relation === "sent" && (
                    <ActionButton
                      variant="ghost"
                      pending={pending}
                      onClick={() => act(() => removeFriendship(user.id))}
                    >
                      Cancelar
                    </ActionButton>
                  )}
                  {relation === "friends" && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1.5 text-[11px] font-medium text-accent">
                      <I.Check className="h-3.5 w-3.5" />
                      Amigos
                    </span>
                  )}
                </PersonRow>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Tela                                                                */
/* ------------------------------------------------------------------ */

export function FriendsScreen({ initial }: { initial: FriendsView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // A lista de presença vem do provider, e não do `initial`: aceitar um
  // pedido precisa fazer a pessoa aparecer já com a música dela, sem
  // esperar a próxima batida do polling.
  const { refresh: refreshActivity } = useFriendsActivity();

  const act = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      refreshActivity();
      router.refresh();
    });

  const { incoming, outgoing } = initial;

  return (
    <div className="animate-rise space-y-8 px-6 pb-12 pt-2 md:px-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-ink">Amigos</h1>
        <p className="mt-1.5 text-sm text-ink-2">
          Quem está por aqui com você, o que estão ouvindo agora — e quem
          pode entrar no próximo jam.
        </p>
      </header>

      <SearchPeople
        onChanged={() => {
          refreshActivity();
          router.refresh();
        }}
      />

      {incoming.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
            Pedidos recebidos
            <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-ink">
              {incoming.length}
            </span>
          </h2>
          <ul className="space-y-0.5">
            {incoming.map((edge) => (
              <PersonRow
                key={edge.user.id}
                user={edge.user}
                subtitle={`${edge.user.email} • quer ser seu amigo`}
              >
                <ActionButton
                  variant="solid"
                  pending={pending}
                  onClick={() => act(() => acceptFriendRequest(edge.user.id))}
                >
                  <I.Check className="h-4 w-4" />
                  Aceitar
                </ActionButton>
                <ActionButton
                  variant="danger"
                  pending={pending}
                  onClick={() => act(() => removeFriendship(edge.user.id))}
                >
                  Recusar
                </ActionButton>
              </PersonRow>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink">Seus amigos</h2>
        <FriendsActivityList
          emptyHint={
            <div className="rounded-xl border border-dashed border-hairline px-6 py-10 text-center">
              <I.Users className="mx-auto h-7 w-7 text-ink-3" />
              <p className="mt-3 text-sm text-ink-2">
                Você ainda não adicionou ninguém.
              </p>
              <p className="mt-1 text-xs text-ink-3">
                Procure acima pelo nome ou pelo e-mail para começar.
              </p>
            </div>
          }
          actions={(friend) => (
            <RemoveFriend
              pending={pending}
              onRemove={() => act(() => removeFriendship(friend.user.id))}
            />
          )}
        />
      </section>

      {outgoing.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink">
            Pedidos enviados
          </h2>
          <ul className="space-y-0.5">
            {outgoing.map((edge) => (
              <PersonRow
                key={edge.user.id}
                user={edge.user}
                subtitle="Aguardando resposta"
              >
                <ActionButton
                  variant="ghost"
                  pending={pending}
                  onClick={() => act(() => removeFriendship(edge.user.id))}
                >
                  Cancelar
                </ActionButton>
              </PersonRow>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * "Desfazer amizade" pede confirmação no próprio botão: é destrutivo o
 * bastante para não acontecer por um clique torto, e leve o bastante
 * para não merecer um diálogo por cima da tela.
 */
function RemoveFriend({
  pending,
  onRemove,
}: {
  pending: boolean;
  onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(timer);
  }, [confirming]);

  return confirming ? (
    <ActionButton variant="danger" pending={pending} onClick={onRemove}>
      <I.UserMinus className="h-4 w-4" />
      Confirmar
    </ActionButton>
  ) : (
    <ActionButton
      variant="ghost"
      pending={pending}
      onClick={() => setConfirming(true)}
    >
      Desfazer amizade
    </ActionButton>
  );
}
