"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { useJam } from "./JamProvider";
import { usePlayer } from "./PlayerProvider";
import { UserAvatar } from "./UserMenu";
import { Cover } from "../Cover";
import { inviteFriendToJam } from "@/lib/jam-actions";
import { jamPickerSources, searchTracks } from "@/lib/actions";
import { cx, formatTime } from "@/lib/utils";
import * as I from "../Icons";
import type { FriendEdge, HydratedTrack, JamParticipant } from "@/lib/types";

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
/* Fila                                                                */
/* ------------------------------------------------------------------ */

/**
 * Uma faixa da fila do jam.
 *
 * A linha inteira é clicável, e o que ela faz depende de quem clica: o
 * host pula direto para a música, os convidados a puxam para logo
 * depois da atual. Os dois gestos são "quero ouvir isto agora" — o que
 * muda é só o quanto a sala aceita de cada um.
 */
function QueueRow({
  track,
  position,
  state,
  canReorder,
  onPlay,
  onPlayNext,
  onRemove,
  busy,
  drag,
}: {
  track: HydratedTrack;
  position: number;
  state: "playing" | "past" | "next" | "queued";
  canReorder: boolean;
  onPlay: () => void;
  onPlayNext: () => void;
  /** `null` quando quem está vendo não pode remover — só o host pode. */
  onRemove: (() => void) | null;
  busy: boolean;
  drag: {
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onDragEnd: () => void;
    dragging: boolean;
    over: "above" | "below" | null;
  };
}) {
  const playing = state === "playing";

  return (
    <li
      draggable={canReorder}
      onDragStart={drag.onDragStart}
      onDragOver={drag.onDragOver}
      onDrop={drag.onDrop}
      onDragEnd={drag.onDragEnd}
      className={cx(
        "group relative flex items-center gap-3 rounded-lg py-1.5 pl-1 pr-1 transition-colors",
        playing ? "bg-dusk/10" : "hover:bg-surface-2",
        drag.dragging && "opacity-40",
        // A linha de inserção diz onde a faixa vai cair antes de soltar,
        // que é a única pergunta que se faz durante um arrasto.
        drag.over === "above" && "before:absolute before:inset-x-1 before:-top-px before:h-0.5 before:rounded-full before:bg-dusk",
        drag.over === "below" && "after:absolute after:inset-x-1 after:-bottom-px after:h-0.5 after:rounded-full after:bg-dusk",
      )}
    >
      {canReorder ? (
        <span
          className="shrink-0 cursor-grab text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
          aria-hidden
        >
          <I.Grip className="h-4 w-4" />
        </span>
      ) : (
        <span
          className="w-4 shrink-0 text-center text-[11px] tabular-nums text-ink-3"
          aria-hidden
        >
          {position}
        </span>
      )}

      <button
        type="button"
        disabled={busy || playing}
        onClick={onPlay}
        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
      >
        <span className="relative shrink-0">
          <Cover
            src={track.cover}
            seed={track.id}
            name={track.title}
            className={cx("h-10 w-10 rounded", state === "past" && "opacity-50")}
          />
          {!playing && (
            <span className="absolute inset-0 grid place-items-center rounded bg-black/55 opacity-0 transition-opacity group-hover:opacity-100">
              <I.Play className="ml-0.5 h-4 w-4 text-ink" />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cx(
              "block truncate text-sm",
              playing
                ? "font-medium text-dusk"
                : state === "past"
                  ? "text-ink-3"
                  : "text-ink",
            )}
          >
            {track.title}
          </span>
          <span className="block truncate text-xs text-ink-3">
            {playing
              ? "Tocando agora"
              : state === "next"
                ? `A seguir • ${track.artist?.name ?? "Artista desconhecido"}`
                : (track.artist?.name ?? "Artista desconhecido")}
          </span>
        </span>
      </button>

      {playing ? (
        <I.EqualizerBars className="mr-1 shrink-0 text-dusk" />
      ) : (
        <span className="flex shrink-0 items-center">
          <span className="text-[11px] tabular-nums text-ink-3 transition-opacity group-hover:opacity-0">
            {formatTime(track.duration)}
          </span>
          {/* Os botões ocupam o lugar da duração em vez de empurrarem a
              linha: um controle que aparece do nada muda a largura do
              texto e faz o título pular debaixo do cursor. */}
          <span className="absolute right-1 flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            {state !== "next" && state !== "past" && (
              <button
                type="button"
                disabled={busy}
                onClick={onPlayNext}
                aria-label={`Tocar ${track.title} a seguir`}
                title="Tocar a seguir"
                className="rounded-full p-1.5 text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink disabled:opacity-50"
              >
                <I.Next className="h-4 w-4" />
              </button>
            )}
            {onRemove && (
              <button
                type="button"
                disabled={busy}
                onClick={onRemove}
                aria-label={`Remover ${track.title} da fila`}
                title="Remover da fila"
                className="rounded-full p-1.5 text-ink-3 transition-colors hover:bg-surface-3 hover:text-rose disabled:opacity-50"
              >
                <I.X className="h-4 w-4" />
              </button>
            )}
          </span>
        </span>
      )}
    </li>
  );
}

/**
 * A fila inteira, e não só o que vem depois.
 *
 * Mostrar o que já passou custa algumas linhas e responde a uma pergunta
 * que aparece o tempo todo numa sala com gente — "que música era aquela
 * de antes?" — sem a qual só resta perguntar em voz alta.
 */
function JamQueue({ onAdd }: { onAdd: () => void }) {
  const { jam, isHost, playNext, jumpTo, removeTrack, reorder } = useJam();
  const [note, setNote] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; below: boolean } | null>(null);

  // A confirmação some sozinha: ela informa, não pede resposta.
  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), 2600);
    return () => clearTimeout(timer);
  }, [note]);

  /**
   * Solta a faixa arrastada na posição de destino.
   *
   * Manda a ordem inteira, e não "mova X para N": duas pessoas
   * arrastando ao mesmo tempo produziriam índices que já não querem
   * dizer nada quando chegam ao servidor.
   *
   * `useCallback` aqui não é memoização — é o que diz ao React que o
   * corpo só roda a partir de um evento. Por isso também fica acima do
   * `return` que checa a sala: hook nenhum pode ficar atrás de uma saída
   * antecipada.
   */
  const drop = useCallback(
    (targetId: string, below: boolean) => {
      const fromId = dragging;
      setDragging(null);
      setOver(null);
      if (!jam || !fromId || fromId === targetId) return;

      const ids = jam.queue.map((t) => t.id);
      const rest = ids.filter((id) => id !== fromId);
      const anchor = rest.indexOf(targetId);
      if (anchor < 0) return;
      rest.splice(below ? anchor + 1 : anchor, 0, fromId);

      void reorder(rest).then(setNote);
    },
    [jam, dragging, reorder],
  );

  if (!jam) return null;

  const at = Math.max(jam.index, 0);

  if (jam.queue.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-hairline px-4 py-8 text-center">
        <I.Queue className="mx-auto h-6 w-6 text-ink-3" />
        <p className="mt-2 text-sm text-ink-2">A fila está vazia.</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-3">
          Qualquer pessoa da sala pode acrescentar música.
        </p>
        <button
          type="button"
          onClick={onAdd}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-dusk px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
        >
          <I.Plus className="h-4 w-4" />
          Adicionar faixas
        </button>
      </div>
    );
  }

  return (
    <div>
      {note && (
        <p
          role="status"
          className="mb-2 rounded-lg bg-dusk/10 px-3 py-2 text-xs text-dusk"
        >
          {note}
        </p>
      )}

      <p className="mb-2 px-1 text-[11px] leading-relaxed text-ink-3">
        Arraste para reordenar, X para tirar da fila.{" "}
        {isHost
          ? "Clique numa faixa para tocá-la agora."
          : "Clique numa faixa para pedir que ela toque a seguir."}
      </p>

      <ul className="space-y-0.5">
        {jam.queue.map((track, i) => {
          const state =
            i === at
              ? ("playing" as const)
              : i < at
                ? ("past" as const)
                : i === at + 1
                  ? ("next" as const)
                  : ("queued" as const);

          return (
            <QueueRow
              key={track.id}
              track={track}
              position={i + 1}
              state={state}
              canReorder={jam.queue.length > 1}
              busy={false}
              onPlay={() => {
                if (state === "playing") return;
                void (isHost ? jumpTo(track) : playNext(track)).then(setNote);
              }}
              onPlayNext={() => void playNext(track).then(setNote)}
              onRemove={
                // A que toca fica: tirá-la cortaria o áudio da sala.
                state === "playing"
                  ? null
                  : () => void removeTrack(track).then(setNote)
              }
              drag={{
                dragging: dragging === track.id,
                over:
                  over?.id === track.id
                    ? over.below
                      ? "below"
                      : "above"
                    : null,
                onDragStart: (e) => {
                  setDragging(track.id);
                  e.dataTransfer.effectAllowed = "move";
                  // O Firefox só inicia o arrasto com algum dado dentro.
                  e.dataTransfer.setData("text/plain", track.id);
                },
                onDragOver: (e) => {
                  if (!dragging || dragging === track.id) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  const box = e.currentTarget.getBoundingClientRect();
                  setOver({
                    id: track.id,
                    below: e.clientY > box.top + box.height / 2,
                  });
                },
                onDrop: (e) => {
                  e.preventDefault();
                  const box = e.currentTarget.getBoundingClientRect();
                  drop(track.id, e.clientY > box.top + box.height / 2);
                },
                onDragEnd: () => {
                  setDragging(null);
                  setOver(null);
                },
              }}
            />
          );
        })}
      </ul>

      {/* Num jam a fila não se enche sozinha: quando a última acaba, a
          sala fica em silêncio de propósito. Dizer isso antes evita que
          o fim pareça defeito. */}
      {at >= jam.queue.length - 1 && (
        <p className="mt-3 px-1 text-[11px] leading-relaxed text-ink-3">
          Esta é a última da fila. Quando ela acabar, a sala espera —
          acrescente mais para a música continuar.
        </p>
      )}

      {/* O convite para acrescentar fica no fim da fila, que é onde o
          olho chega depois de ler o que já tem — e onde a música nova
          vai parar. */}
      <button
        type="button"
        onClick={onAdd}
        className="mt-2 flex w-full items-center gap-3 rounded-lg border border-dashed border-hairline px-3 py-2.5 text-left text-sm text-ink-3 transition-colors hover:border-dusk/40 hover:text-dusk"
      >
        <I.Plus className="h-4 w-4 shrink-0" />
        Adicionar faixas à fila
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Adicionar faixas                                                    */
/* ------------------------------------------------------------------ */

/** Uma faixa oferecida para entrar na fila. */
function PickRow({
  track,
  already,
  note,
  onAdd,
  onPlayNext,
  playNextLabel,
}: {
  track: HydratedTrack;
  already: boolean;
  note?: string;
  onAdd: () => void;
  onPlayNext: () => void;
  playNextLabel: string;
}) {
  return (
    <li className="group flex items-center gap-3 rounded-lg px-1 py-1.5 transition-colors hover:bg-surface-2">
      <Cover
        src={track.cover}
        seed={track.id}
        name={track.title}
        className="h-10 w-10 shrink-0 rounded"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink">{track.title}</p>
        <p className="truncate text-xs text-ink-3">
          {note ??
            (already
              ? "Já está na fila"
              : (track.artist?.name ?? "Artista desconhecido"))}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onPlayNext}
          aria-label={`Tocar ${track.title} a seguir`}
          title={playNextLabel}
          className="rounded-full p-1.5 text-ink-3 opacity-0 transition-opacity hover:text-dusk focus-visible:opacity-100 group-hover:opacity-100"
        >
          <I.Next className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={already}
          onClick={onAdd}
          aria-label={`Adicionar ${track.title} à fila do jam`}
          className={cx(
            "rounded-full p-1.5 transition-colors",
            already
              ? "text-accent"
              : "text-ink-2 hover:bg-dusk/15 hover:text-dusk",
          )}
        >
          {already ? (
            <I.Check className="h-4 w-4" />
          ) : (
            <I.Plus className="h-4 w-4" />
          )}
        </button>
      </div>
    </li>
  );
}

type Source = "curtidas" | "tocadas" | "novas";

/**
 * Como a música entra na fila do jam.
 *
 * A primeira versão disto era só um campo de busca, e um campo de busca
 * vazio pressupõe que a pessoa já sabe o nome do que quer. Numa sala com
 * amigos a vontade costuma ser vaga — "põe alguma coisa" — então o que
 * abre agora são as listas de onde ela tiraria a música se estivesse
 * navegando o app. A busca continua aqui, para quando o nome existe.
 */
function AddTracks() {
  const { jam, isHost, addTrack, playNext } = useJam();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HydratedTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [sources, setSources] = useState<{
    liked: HydratedTrack[];
    recent: HydratedTrack[];
    fresh: HydratedTrack[];
  } | null>(null);
  const [source, setSource] = useState<Source>("curtidas");
  const [done, setDone] = useState<Record<string, string>>({});
  /** Descarta respostas de buscas já superadas pelo que se digitou. */
  const latest = useRef(0);

  const term = query.trim();
  const active = term.length >= 2;

  // As listas vêm uma vez, na abertura: elas não mudam durante a sala, e
  // recarregá-las a cada tecla só atrapalharia a busca.
  useEffect(() => {
    let alive = true;
    void jamPickerSources().then((s) => {
      if (alive) setSources(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!active) return;

    // Espera a digitação parar: uma chamada por tecla encheria a rede e
    // ainda chegaria fora de ordem.
    const ticket = ++latest.current;
    const timer = setTimeout(() => {
      setSearching(true);
      void searchTracks(term)
        .then((found) => {
          if (ticket !== latest.current) return;
          setResults(found);
        })
        .catch(() => {})
        .finally(() => {
          if (ticket === latest.current) setSearching(false);
        });
    }, 220);

    return () => clearTimeout(timer);
  }, [term, active]);

  if (!jam) return null;

  const inQueue = new Set(jam.queue.map((t) => t.id));
  const playNextLabel = isHost
    ? "Tocar a seguir"
    : "Pedir para tocar a seguir";

  const browse: HydratedTrack[] =
    source === "curtidas"
      ? (sources?.liked ?? [])
      : source === "tocadas"
        ? (sources?.recent ?? [])
        : (sources?.fresh ?? []);

  // Buscando, a busca manda; parado, a lista escolhida.
  const shown = active ? results : browse;

  const row = (track: HydratedTrack) => (
    <PickRow
      key={track.id}
      track={track}
      already={inQueue.has(track.id)}
      note={done[track.id]}
      playNextLabel={playNextLabel}
      onAdd={() =>
        void addTrack(track).then((m) =>
          setDone((d) => ({ ...d, [track.id]: m })),
        )
      }
      onPlayNext={() =>
        void playNext(track).then((m) =>
          setDone((d) => ({ ...d, [track.id]: m })),
        )
      }
    />
  );

  return (
    <div>
      <div className="relative">
        <I.Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por título, artista ou álbum"
          aria-label="Buscar faixa para adicionar ao jam"
          className="h-11 w-full rounded-full bg-surface-2 pl-10 pr-9 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-dusk/40"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Limpar busca"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"
          >
            <I.X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Sem busca ativa, as listas de onde a música costuma sair. */}
      {!active && (
        <div className="mt-3 flex gap-1.5">
          {(
            [
              ["curtidas", "Curtidas"],
              ["tocadas", "Mais tocadas"],
              ["novas", "Novidades"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSource(id)}
              aria-pressed={source === id}
              className={cx(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                source === id
                  ? "bg-dusk/20 text-dusk"
                  : "bg-surface-2 text-ink-3 hover:text-ink-2",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {active && searching && shown.length === 0 ? (
        <p className="mt-4 px-1 text-xs text-ink-3">Procurando…</p>
      ) : shown.length === 0 ? (
        <p className="mt-4 px-1 text-xs leading-relaxed text-ink-3">
          {active
            ? `Nada encontrado para “${term}”.`
            : !sources
              ? "Carregando…"
              : source === "curtidas"
                ? "Você ainda não curtiu nenhuma faixa. Experimente as outras listas ou busque pelo nome."
                : "Nada por aqui ainda."}
        </p>
      ) : (
        <ul className="mt-3 space-y-0.5">{shown.map(row)}</ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Painel                                                              */
/* ------------------------------------------------------------------ */

type Tab = "fila" | "adicionar" | "sala";

export function JamPanel({
  friends,
  onClose,
}: {
  friends: FriendEdge[];
  onClose: () => void;
}) {
  const { jam, isHost, leave } = useJam();
  const player = usePlayer();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  /**
   * A fila abre primeiro. Ela é o que muda a cada minuto numa sala; a
   * lista de quem está ouvindo se lê uma vez e depois só se confere.
   */
  const [tab, setTab] = useState<Tab>("fila");

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
  const online = jam.participants.filter((p) => p.online).length;
  const ahead = Math.max(jam.queue.length - Math.max(jam.index, 0) - 1, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Jam"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <aside className="flex h-full w-full max-w-[420px] flex-col border-l border-hairline bg-sidebar">
        <header className="border-b border-hairline px-5 pt-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-dusk/15 text-dusk">
              <I.Jam className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-base font-semibold text-ink">
                {jam.name}
              </h2>
              <p className="mt-0.5 text-xs text-ink-3">
                {online} {online === 1 ? "pessoa ouvindo" : "pessoas ouvindo"}
                {isHost ? " • você comanda" : " • seguindo o anfitrião"}
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
          </div>

          {/* As abas em vez de uma rolagem só: a fila precisa da altura
              inteira para caber sem espremer, e quem veio mexer nela não
              deveria passar por cima da lista de convites toda vez. */}
          <div className="mt-3 flex gap-1" role="tablist">
            {([
              ["fila", "Fila", ahead > 0 ? String(ahead) : null],
              ["adicionar", "Adicionar", null],
              ["sala", "Sala", String(jam.participants.length)],
            ] as const).map(([id, label, badge]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cx(
                  "flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  tab === id
                    ? "border-dusk text-ink"
                    : "border-transparent text-ink-3 hover:text-ink-2",
                )}
              >
                {label}
                {badge && (
                  <span
                    className={cx(
                      "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                      tab === id
                        ? "bg-dusk/20 text-dusk"
                        : "bg-surface-2 text-ink-3",
                    )}
                  >
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {tab === "fila" ? (
            <JamQueue onAdd={() => setTab("adicionar")} />
          ) : tab === "adicionar" ? (
            <AddTracks />
          ) : (
            <div className="space-y-6">
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
            </div>
          )}
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
