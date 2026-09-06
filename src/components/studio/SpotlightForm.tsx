"use client";

import { useActionState, useState } from "react";
import { updateSpotlight } from "@/lib/actions";
import { Cover } from "../Cover";
import {
  Card,
  Field,
  FormMessage,
  Input,
  Select,
  SubmitButton,
  Textarea,
} from "./Form";
import type { HydratedTrack, Spotlight } from "@/lib/types";

export function SpotlightForm({
  spotlight,
  tracks,
}: {
  spotlight: Spotlight;
  tracks: HydratedTrack[];
}) {
  const [state, action] = useActionState(updateSpotlight, null);
  const [trackId, setTrackId] = useState(
    spotlight.trackId ?? tracks[0]?.id ?? "",
  );
  const [eyebrow, setEyebrow] = useState(spotlight.eyebrow);
  const [blurb, setBlurb] = useState(spotlight.blurb);
  const [quote, setQuote] = useState(spotlight.quote);

  const selected = tracks.find((t) => t.id === trackId) ?? null;

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[400px_1fr]">
      <Card title="Banner da home" className="h-fit">
        <div className="space-y-4">
          <FormMessage state={state} />

          <Field label="Faixa em destaque" required>
            <Select
              name="trackId"
              value={trackId}
              onChange={(e) => setTrackId(e.target.value)}
            >
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} — {t.artist?.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Etiqueta" hint="Texto pequeno acima do título.">
            <Input
              name="eyebrow"
              value={eyebrow}
              onChange={(e) => setEyebrow(e.target.value)}
              placeholder="Lançamento"
            />
          </Field>

          <Field label="Chamada" hint="Uma ou duas frases sobre a faixa.">
            <Textarea
              name="blurb"
              rows={3}
              value={blurb}
              onChange={(e) => setBlurb(e.target.value)}
              placeholder="Uma balada sobre despedidas, recomeços e tudo que ainda fica na memória."
            />
          </Field>

          <Field label="Citação lateral" hint="Aparece à direita em telas largas.">
            <Textarea
              name="quote"
              rows={2}
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              placeholder="Às vezes, as melhores músicas voltam pra gente."
            />
          </Field>

          <SubmitButton pendingLabel="Salvando…">Salvar destaque</SubmitButton>
        </div>
      </Card>

      {/* prévia ao vivo do banner */}
      <div>
        <p className="mb-2 text-sm font-medium text-ink-2">
          Prévia do banner
        </p>
        <div className="relative overflow-hidden rounded-2xl border border-hairline">
          <div className="absolute inset-0">
            {selected?.cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selected.cover}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-surface-2" />
            )}
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/70 to-black/20" />

          <div className="relative flex min-h-[280px] flex-col justify-center gap-4 p-8">
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-ink-2">
              {eyebrow || "Lançamento"}
            </p>
            <div>
              <p className="text-4xl font-bold leading-tight text-ink">
                {selected?.title ?? "Sem faixa selecionada"}
              </p>
              <p className="mt-1 text-lg text-ink-2">
                {selected?.artist?.name ?? ""}
              </p>
            </div>
            {blurb && (
              <p className="max-w-md text-sm leading-relaxed text-ink-2">
                {blurb}
              </p>
            )}
            <div className="mt-1 flex gap-3">
              <span className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-accent-ink">
                Ouvir agora
              </span>
              <span className="rounded-full border border-ink/30 px-6 py-2.5 text-sm font-semibold text-ink">
                Salvar
              </span>
            </div>
          </div>

          {quote && (
            <div className="absolute right-8 top-1/2 hidden w-[170px] -translate-y-1/2 xl:block">
              <p className="text-[11px] uppercase leading-relaxed tracking-[0.18em] text-ink-2">
                {quote}
              </p>
              <div className="mt-4 h-px w-10 bg-ink-3" />
            </div>
          )}
        </div>

        {selected && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-hairline bg-surface/60 p-3">
            <Cover
              src={selected.cover}
              seed={selected.id}
              name={selected.title}
              className="h-12 w-12"
            />
            <p className="text-sm text-ink-2">
              A capa desta faixa é o fundo do banner.{" "}
              {!selected.cover && (
                <span className="text-ink-3">
                  Esta faixa não tem capa — envie uma no catálogo para o banner
                  ficar completo.
                </span>
              )}
            </p>
          </div>
        )}
      </div>
    </form>
  );
}
