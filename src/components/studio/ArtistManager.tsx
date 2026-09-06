"use client";

import { useActionState, useState, useTransition } from "react";
import {
  createArtist,
  deleteArtist,
  toggleArtistFeatured,
  updateArtist,
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
import { cx, formatListeners, formatNumber } from "@/lib/utils";
import * as I from "../Icons";
import type { Artist } from "@/lib/types";

function ArtistForm({ artist, onDone }: { artist: Artist; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionState | null>(null);

  return (
    <form
      action={(fd) => {
        fd.set("id", artist.id);
        start(async () => {
          const res = await updateArtist(null, fd);
          setMsg(res);
          if (res.ok) onDone();
        });
      }}
      className="mt-4 space-y-4 border-t border-hairline pt-4"
    >
      <FormMessage state={msg} />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nome">
          <Input name="name" defaultValue={artist.name} />
        </Field>
        <Field label="Ouvintes mensais">
          <Input
            name="monthlyListeners"
            type="number"
            min={0}
            defaultValue={artist.monthlyListeners}
          />
        </Field>
      </div>
      <Field label="Biografia">
        <Textarea name="bio" defaultValue={artist.bio} rows={3} />
      </Field>
      <Field label="Trocar foto" hint="Opcional">
        <Input name="image" type="file" accept="image/*" className="py-2" />
      </Field>
      <Checkbox
        name="featured"
        label="Artista em destaque"
        hint="Aparece na seção “Artistas em destaque” da home."
        defaultChecked={artist.featured}
      />
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

export function ArtistManager({
  artists,
  trackCounts,
}: {
  artists: Artist[];
  trackCounts: Record<string, number>;
}) {
  const [state, action] = useActionState(createArtist, null);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionState | null>(null);

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      {/* novo artista */}
      <Card title="Novo artista" className="h-fit">
        <form action={action} className="space-y-4">
          <FormMessage state={state} />
          <Field label="Nome" required>
            <Input name="name" required placeholder="Ex.: Banda Sol do Mar" />
          </Field>
          <Field label="Biografia">
            <Textarea
              name="bio"
              rows={4}
              placeholder="Conte a história do artista — aparece na tela de reprodução."
            />
          </Field>
          <Field label="Ouvintes mensais" hint="Usado nas telas do ouvinte.">
            <Input
              name="monthlyListeners"
              type="number"
              min={0}
              defaultValue={0}
            />
          </Field>
          <FileDrop
            name="image"
            accept="image/*"
            label="Foto"
            hint="JPG, PNG ou WebP — quadrada"
            preview="image"
          />
          <Checkbox
            name="featured"
            label="Artista em destaque"
            hint="Aparece na home dos ouvintes."
          />
          <SubmitButton pendingLabel="Salvando…">Adicionar artista</SubmitButton>
        </form>
      </Card>

      {/* lista */}
      <div className="space-y-4">
        <FormMessage state={msg} />
        {artists.length === 0 ? (
          <div className="rounded-xl border border-dashed border-hairline px-6 py-14 text-center">
            <p className="text-sm text-ink-2">
              Nenhum artista no catálogo. Crie o primeiro ao lado — ou publique
              uma faixa e o artista é criado junto.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {artists.map((a) => (
              <li
                key={a.id}
                className="rounded-xl border border-hairline bg-surface/60 p-4"
              >
                <div className="flex flex-wrap items-center gap-4">
                  <Cover
                    src={a.image}
                    seed={a.id}
                    name={a.name}
                    rounded="rounded-full"
                    className="h-14 w-14"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-ink">{a.name}</p>
                      {a.featured && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                          <I.Sparkle className="h-3 w-3" />
                          destaque
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-ink-2">
                      {formatListeners(a.monthlyListeners)} ouvintes •{" "}
                      {formatNumber(trackCounts[a.id] ?? 0)} faixa(s)
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        start(async () => setMsg(await toggleArtistFeatured(a.id)))
                      }
                      disabled={pending}
                      className={cx(
                        "rounded-lg p-2 transition-colors hover:bg-surface-2",
                        a.featured ? "text-accent" : "text-ink-2 hover:text-ink",
                      )}
                      aria-label={
                        a.featured ? "Remover dos destaques" : "Colocar em destaque"
                      }
                      aria-pressed={a.featured}
                    >
                      <I.Sparkle className="h-[18px] w-[18px]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(editing === a.id ? null : a.id)}
                      className="rounded-lg p-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                      aria-label={`Editar ${a.name}`}
                    >
                      <I.Edit className="h-[18px] w-[18px]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(a.id)}
                      className="rounded-lg p-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-rose"
                      aria-label={`Remover ${a.name}`}
                    >
                      <I.Trash className="h-[18px] w-[18px]" />
                    </button>
                  </div>
                </div>

                {a.bio && editing !== a.id && (
                  <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-ink-2">
                    {a.bio}
                  </p>
                )}

                {confirming === a.id && (
                  <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-rose/5 p-3">
                    <p className="flex-1 text-sm text-ink">
                      Remover <strong>{a.name}</strong>
                      {trackCounts[a.id]
                        ? ` e suas ${trackCounts[a.id]} faixa(s)?`
                        : "?"}
                    </p>
                    <Button
                      variant="danger"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          setMsg(await deleteArtist(a.id));
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

                {editing === a.id && (
                  <ArtistForm artist={a} onDone={() => setEditing(null)} />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
