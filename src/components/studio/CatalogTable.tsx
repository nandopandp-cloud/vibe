"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { deleteTrack, updateTrack, type ActionState } from "@/lib/actions";
import { Cover } from "../Cover";
import { Button, Field, FormMessage, Input, Select } from "./Form";
import { cx, foldText, formatNumber, formatTime } from "@/lib/utils";
import * as I from "../Icons";
import type { Album, Artist, HydratedTrack } from "@/lib/types";

/** Edição inline de uma faixa, aberta sob a linha da tabela. */
function EditRow({
  track,
  artists,
  albums,
  onDone,
}: {
  track: HydratedTrack;
  artists: Artist[];
  albums: Album[];
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionState | null>(null);

  return (
    <form
      action={(fd) => {
        fd.set("id", track.id);
        start(async () => {
          const res = await updateTrack(null, fd);
          setMsg(res);
          if (res.ok) onDone();
        });
      }}
      className="space-y-4 border-t border-hairline bg-surface-2/40 px-4 py-5"
    >
      <FormMessage state={msg} />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Field label="Título">
          <Input name="title" defaultValue={track.title} />
        </Field>
        <Field label="Artista">
          <Select name="artistId" defaultValue={track.artistId}>
            {artists.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Gênero">
          <Input name="genre" defaultValue={track.genre} placeholder="Ex.: Axé" />
        </Field>
        <Field label="Ano">
          <Input name="year" type="number" defaultValue={track.year} />
        </Field>
        <Field label="Álbum">
          <Select name="albumId" defaultValue={track.albumId ?? ""}>
            <option value="">Single</option>
            {albums
              .filter((al) => al.artistId === track.artistId)
              .map((al) => (
                <option key={al.id} value={al.id}>
                  {al.title}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Trocar capa" hint="Opcional">
          <Input name="cover" type="file" accept="image/*" className="py-2" />
        </Field>
        <Field label="Substituir áudio" hint="Opcional">
          <Input
            name="audio"
            type="file"
            accept="audio/*,.mpeg,.mpga,.mp3"
            className="py-2"
          />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export function CatalogTable({
  tracks,
  artists,
  albums,
}: {
  tracks: HydratedTrack[];
  artists: Artist[];
  albums: Album[];
}) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionState | null>(null);

  const filtered = useMemo(() => {
    const needle = foldText(q.trim());
    if (!needle) return tracks;
    return tracks.filter(
      (t) =>
        foldText(t.title).includes(needle) ||
        foldText(t.artist?.name ?? "").includes(needle) ||
        foldText(t.genre).includes(needle),
    );
  }, [tracks, q]);

  return (
    <div className="space-y-4">
      <FormMessage state={msg} />

      <div className="relative max-w-sm">
        <I.Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-3" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por título, artista ou gênero"
          aria-label="Buscar no catálogo"
          className="h-11 w-full rounded-lg border border-hairline bg-surface-2 pl-11 pr-4 text-sm text-ink placeholder:text-ink-3 focus:border-ink-3 focus:outline-none"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-hairline">
        <div className="hidden grid-cols-[1fr_150px_110px_90px_90px_150px] gap-4 border-b border-hairline bg-surface/60 px-4 py-3 text-xs font-medium uppercase tracking-wider text-ink-3 lg:grid">
          <span>Faixa</span>
          <span>Gênero</span>
          <span>Reproduções</span>
          <span>Duração</span>
          <span>Letra</span>
          <span className="text-right">Ações</span>
        </div>

        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-3">
            {tracks.length === 0
              ? "Nenhuma faixa publicada ainda."
              : "Nenhuma faixa corresponde à busca."}
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {filtered.map((t) => (
              <li key={t.id} className="bg-surface/30">
                <div className="grid grid-cols-1 items-center gap-4 px-4 py-3 lg:grid-cols-[1fr_150px_110px_90px_90px_150px]">
                  <div className="flex min-w-0 items-center gap-3">
                    <Cover
                      src={t.cover}
                      seed={t.id}
                      name={t.title}
                      className="h-11 w-11"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {t.title}
                      </p>
                      <p className="truncate text-xs text-ink-2">
                        {t.artist?.name ?? "—"} • {t.album?.title ?? "Single"} •{" "}
                        {t.year}
                      </p>
                    </div>
                  </div>

                  <span className="truncate text-sm text-ink-2">
                    {t.genre || "—"}
                  </span>
                  <span className="text-sm tabular-nums text-ink-2">
                    {formatNumber(t.plays)}
                  </span>
                  <span className="text-sm tabular-nums text-ink-2">
                    {formatTime(t.duration)}
                  </span>
                  <span>
                    {t.lyrics.length > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">
                        <I.Check className="h-3 w-3" />
                        {t.lyrics.length}
                      </span>
                    ) : (
                      <Link
                        href={`/studio/letras?track=${t.id}`}
                        className="text-xs text-ink-3 underline-offset-2 hover:text-ink hover:underline"
                      >
                        adicionar
                      </Link>
                    )}
                  </span>

                  <div className="flex items-center justify-start gap-1 lg:justify-end">
                    <button
                      type="button"
                      onClick={() => setEditing(editing === t.id ? null : t.id)}
                      className="rounded-lg p-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                      aria-label={`Editar ${t.title}`}
                    >
                      <I.Edit className="h-[18px] w-[18px]" />
                    </button>
                    <Link
                      href={`/studio/letras?track=${t.id}`}
                      className="rounded-lg p-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                      aria-label={`Editar letra de ${t.title}`}
                    >
                      <I.Mic className="h-[18px] w-[18px]" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => setConfirming(t.id)}
                      className="rounded-lg p-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-rose"
                      aria-label={`Remover ${t.title}`}
                    >
                      <I.Trash className="h-[18px] w-[18px]" />
                    </button>
                  </div>
                </div>

                {confirming === t.id && (
                  <div className="flex flex-wrap items-center gap-3 border-t border-hairline bg-rose/5 px-4 py-3">
                    <p className="flex-1 text-sm text-ink">
                      Remover <strong>{t.title}</strong>? O arquivo de áudio e a
                      capa serão apagados.
                    </p>
                    <Button
                      variant="danger"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          setMsg(await deleteTrack(t.id));
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

                {editing === t.id && (
                  <EditRow
                    track={t}
                    artists={artists}
                    albums={albums}
                    onDone={() => setEditing(null)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className={cx("text-xs text-ink-3", filtered.length === 0 && "hidden")}>
        {filtered.length} de {tracks.length} faixa(s)
      </p>
    </div>
  );
}
