"use client";

import { useActionState, useState, useTransition } from "react";
import {
  createPlaylist,
  deletePlaylist,
  reorderPlaylist,
  togglePlaylistTrack,
  type ActionState,
} from "@/lib/actions";
import { Cover } from "../Cover";
import {
  Button,
  Card,
  Checkbox,
  Field,
  FileDrop,
  FormMessage,
  Input,
  SubmitButton,
  Textarea,
} from "./Form";
import { cx, foldText } from "@/lib/utils";
import * as I from "../Icons";
import type { HydratedTrack, Playlist } from "@/lib/types";

/** Curadoria das faixas de uma playlist, com reordenação. */
function TrackPicker({
  playlist,
  tracks,
  onMessage,
}: {
  playlist: Playlist;
  tracks: HydratedTrack[];
  onMessage: (s: ActionState) => void;
}) {
  const [pending, start] = useTransition();
  const [order, setOrder] = useState(playlist.trackIds);
  const [q, setQ] = useState("");

  const inList = new Set(order);
  const chosen = order
    .map((id) => tracks.find((t) => t.id === id))
    .filter((t): t is HydratedTrack => Boolean(t));

  const available = tracks.filter((t) => {
    if (inList.has(t.id)) return false;
    const needle = foldText(q.trim());
    if (!needle) return true;
    return (
      foldText(t.title).includes(needle) ||
      foldText(t.artist?.name ?? "").includes(needle)
    );
  });

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setOrder(next);
    start(async () => onMessage(await reorderPlaylist(playlist.id, next)));
  };

  const toggle = (trackId: string) => {
    setOrder((prev) =>
      prev.includes(trackId)
        ? prev.filter((id) => id !== trackId)
        : [...prev, trackId],
    );
    start(async () =>
      onMessage(await togglePlaylistTrack(playlist.id, trackId)),
    );
  };

  return (
    <div className="mt-4 grid gap-5 border-t border-hairline pt-4 md:grid-cols-2">
      <div>
        <h4 className="mb-2 text-sm font-medium text-ink">
          Na playlist ({chosen.length})
        </h4>
        {chosen.length === 0 ? (
          <p className="rounded-lg border border-dashed border-hairline px-3 py-6 text-center text-xs text-ink-3">
            Nenhuma faixa ainda. Adicione ao lado.
          </p>
        ) : (
          <ul className="space-y-1">
            {chosen.map((t, i) => (
              <li
                key={t.id}
                className="flex items-center gap-2 rounded-lg bg-surface-2 p-2"
              >
                <span className="w-4 text-center text-xs tabular-nums text-ink-3">
                  {i + 1}
                </span>
                <Cover src={t.cover} seed={t.id} name={t.title} className="h-9 w-9" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">
                    {t.title}
                  </span>
                  <span className="block truncate text-xs text-ink-2">
                    {t.artist?.name}
                  </span>
                </span>
                <span className="flex items-center">
                  <button
                    type="button"
                    onClick={() => move(i, i - 1)}
                    disabled={i === 0 || pending}
                    className="rounded p-1 text-ink-2 hover:text-ink disabled:opacity-30"
                    aria-label="Mover para cima"
                  >
                    <I.ChevronDown className="h-4 w-4 rotate-180" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, i + 1)}
                    disabled={i === chosen.length - 1 || pending}
                    className="rounded p-1 text-ink-2 hover:text-ink disabled:opacity-30"
                    aria-label="Mover para baixo"
                  >
                    <I.ChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle(t.id)}
                    className="rounded p-1 text-ink-2 hover:text-rose"
                    aria-label={`Remover ${t.title} da playlist`}
                  >
                    <I.X className="h-4 w-4" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 className="mb-2 text-sm font-medium text-ink">Adicionar faixas</h4>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar faixa…"
          aria-label="Buscar faixa para adicionar"
          className="mb-2 h-9 w-full rounded-lg border border-hairline bg-surface-2 px-3 text-sm text-ink placeholder:text-ink-3 focus:border-ink-3 focus:outline-none"
        />
        {available.length === 0 ? (
          <p className="rounded-lg border border-dashed border-hairline px-3 py-6 text-center text-xs text-ink-3">
            {tracks.length === 0
              ? "Nenhuma faixa publicada."
              : "Todas as faixas já estão na playlist."}
          </p>
        ) : (
          <ul className="max-h-[320px] space-y-1 overflow-y-auto pr-1">
            {available.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => toggle(t.id)}
                  className="flex w-full items-center gap-2 rounded-lg p-2 text-left transition-colors hover:bg-surface-2"
                >
                  <Cover src={t.cover} seed={t.id} name={t.title} className="h-9 w-9" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">
                      {t.title}
                    </span>
                    <span className="block truncate text-xs text-ink-2">
                      {t.artist?.name}
                    </span>
                  </span>
                  <I.Plus className="h-4 w-4 shrink-0 text-ink-2" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function PlaylistManager({
  playlists,
  tracks,
}: {
  playlists: Playlist[];
  tracks: HydratedTrack[];
}) {
  const [state, action] = useActionState(createPlaylist, null);
  const [open, setOpen] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionState | null>(null);

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Card title="Nova playlist" className="h-fit">
        <form action={action} className="space-y-4">
          <FormMessage state={state} />
          <Field label="Nome" required>
            <Input name="title" required placeholder="Ex.: Axé 90s" />
          </Field>
          <Field label="Descrição">
            <Textarea
              name="description"
              rows={3}
              placeholder="Como esta seleção é apresentada ao ouvinte."
            />
          </Field>
          <FileDrop
            name="cover"
            accept="image/*"
            label="Capa"
            hint="Opcional — quadrada"
            preview="image"
          />
          <Checkbox
            name="editorial"
            label="Playlist editorial"
            hint="Aparece na home e na sidebar dos ouvintes."
            defaultChecked
          />
          <SubmitButton pendingLabel="Criando…">Criar playlist</SubmitButton>
        </form>
      </Card>

      <div className="space-y-4">
        <FormMessage state={msg} />
        {playlists.length === 0 ? (
          <div className="rounded-xl border border-dashed border-hairline px-6 py-14 text-center">
            <p className="text-sm text-ink-2">
              Nenhuma playlist criada. Monte a primeira seleção ao lado.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {playlists.map((pl) => (
              <li
                key={pl.id}
                className="rounded-xl border border-hairline bg-surface/60 p-4"
              >
                <div className="flex flex-wrap items-center gap-4">
                  <Cover
                    src={pl.cover}
                    seed={pl.id}
                    name={pl.title}
                    className="h-14 w-14"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-ink">{pl.title}</p>
                      {pl.editorial && (
                        <span className="shrink-0 rounded-full bg-dusk/15 px-2 py-0.5 text-[11px] font-medium text-[#a48ff5]">
                          editorial
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-2">
                      {pl.trackIds.length} faixa(s)
                      {pl.description ? ` • ${pl.description}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setOpen(open === pl.id ? null : pl.id)}
                      className={cx(
                        "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        open === pl.id
                          ? "bg-surface-2 text-ink"
                          : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                      )}
                    >
                      {open === pl.id ? "Fechar" : "Curar faixas"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(pl.id)}
                      className="rounded-lg p-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-rose"
                      aria-label={`Remover ${pl.title}`}
                    >
                      <I.Trash className="h-[18px] w-[18px]" />
                    </button>
                  </div>
                </div>

                {confirming === pl.id && (
                  <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-rose/5 p-3">
                    <p className="flex-1 text-sm text-ink">
                      Remover a playlist <strong>{pl.title}</strong>? As faixas
                      continuam no catálogo.
                    </p>
                    <Button
                      variant="danger"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          setMsg(await deletePlaylist(pl.id));
                          setConfirming(null);
                        })
                      }
                    >
                      Remover
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirming(null)}>
                      Cancelar
                    </Button>
                  </div>
                )}

                {open === pl.id && (
                  <TrackPicker
                    playlist={pl}
                    tracks={tracks}
                    onMessage={setMsg}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
