"use client";

import { useRef, useState, useTransition } from "react";
import { publishAlbum, type ActionState } from "@/lib/actions";
import { BlobDrop, type UploadedFile } from "./BlobDrop";
import { GENRES } from "./UploadForm";
import { Button, Card, Field, FormMessage, Input, Select } from "./Form";
import {
  looksLikeValidFile,
  readAudioDuration,
  uploadToBlob,
} from "@/lib/upload-client";
import { cx, formatTime } from "@/lib/utils";
import * as I from "../Icons";
import type { Artist } from "@/lib/types";

type Faixa = {
  key: string;
  title: string;
  fileName: string;
  url: string | null;
  duration: number;
  progresso: number;
  erro: string;
};

let seq = 0;
const novaKey = () => `f${++seq}-${Date.now()}`;

/** Tira a extensão e numeração comum de nome de arquivo: "03 - Titulo.mp3". */
function tituloDoArquivo(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/^\s*\d{1,2}\s*[-._)]\s*/, "")
    .trim();
}

export function AlbumForm({ artists }: { artists: Artist[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [albumTitle, setAlbumTitle] = useState("");
  const [artistId, setArtistId] = useState(artists[0]?.id ?? "");
  const [newArtistName, setNewArtistName] = useState("");
  const [genre, setGenre] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [cover, setCover] = useState<UploadedFile | null>(null);
  const [faixas, setFaixas] = useState<Faixa[]>([]);

  const enviando = faixas.some((f) => !f.url && !f.erro);
  const prontas = faixas.filter((f) => f.url);
  const podePublicar =
    albumTitle.trim() !== "" &&
    prontas.length > 0 &&
    !enviando &&
    (artistId || newArtistName.trim());

  const patch = (key: string, campos: Partial<Faixa>) =>
    setFaixas((prev) =>
      prev.map((f) => (f.key === key ? { ...f, ...campos } : f)),
    );

  /** Aceita vários arquivos de uma vez e envia todos em paralelo. */
  async function adicionar(files: FileList | null) {
    if (!files?.length) return;

    // Ordena por nome: discos costumam vir com faixas numeradas.
    const lista = [...files].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR", { numeric: true }),
    );

    const novas: Faixa[] = lista.map((f) => ({
      key: novaKey(),
      title: tituloDoArquivo(f.name),
      fileName: f.name,
      url: null,
      duration: 0,
      progresso: 0,
      erro: "",
    }));
    setFaixas((prev) => [...prev, ...novas]);

    await Promise.all(
      lista.map(async (file, i) => {
        const { key } = novas[i];
        if (!(await looksLikeValidFile(file, "audio"))) {
          patch(key, { erro: "Não é um áudio válido." });
          return;
        }
        try {
          const duration = await readAudioDuration(file);
          const url = await uploadToBlob(file, "audio", (p) =>
            patch(key, { progresso: p }),
          );
          patch(key, { url, duration, progresso: 100 });
        } catch (e) {
          patch(key, {
            erro: e instanceof Error ? e.message : "Falha no envio.",
          });
        }
      }),
    );
  }

  const mover = (i: number, delta: number) =>
    setFaixas((prev) => {
      const j = i + delta;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  function publicar() {
    start(async () => {
      const res = await publishAlbum({
        albumTitle,
        artistId,
        newArtistName,
        genre,
        year: Number(year),
        coverUrl: cover?.url ?? null,
        tracks: faixas
          .filter((f) => f.url)
          .map((f, i) => ({
            title: f.title,
            audioUrl: f.url as string,
            duration: f.duration,
            trackNumber: i + 1,
          })),
      });
      setMsg(res);
      if (res.ok) {
        setAlbumTitle("");
        setFaixas([]);
        setCover(null);
        setNewArtistName("");
      }
    });
  }

  const duracaoTotal = prontas.reduce((s, f) => s + f.duration, 0);

  return (
    <div className="space-y-5">
      <FormMessage state={msg} />

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <Card title="Capa do álbum" className="h-fit">
          <BlobDrop
            folder="covers"
            label="Arte"
            accept="image/*"
            hint="JPG, PNG ou WebP — quadrada"
            preview="image"
            value={cover}
            onChange={setCover}
          />
          <p className="mt-3 text-xs text-ink-3">
            As faixas herdam esta capa.
          </p>
        </Card>

        <Card title="Informações do álbum">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Título do álbum" required className="md:col-span-2">
              <Input
                value={albumTitle}
                onChange={(e) => setAlbumTitle(e.target.value)}
                placeholder="Ex.: Verão Sem Fim"
                required
              />
            </Field>

            <Field label="Artista" required>
              <Select
                value={artistId}
                onChange={(e) => setArtistId(e.target.value)}
              >
                {artists.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
                <option value="">+ Novo artista</option>
              </Select>
            </Field>

            {artistId === "" && (
              <Field label="Nome do novo artista" required>
                <Input
                  value={newArtistName}
                  onChange={(e) => setNewArtistName(e.target.value)}
                  placeholder="Ex.: Banda Sol do Mar"
                  required
                />
              </Field>
            )}

            <Field label="Gênero">
              <Select value={genre} onChange={(e) => setGenre(e.target.value)}>
                <option value="">Sem gênero</option>
                {GENRES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Ano">
              <Input
                type="number"
                min={1900}
                max={2100}
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </Field>
          </div>
        </Card>
      </div>

      <Card
        title="Faixas"
        description="Escolha vários arquivos de uma vez. Eles são enviados em paralelo e ordenados pelo nome; o título vem do arquivo e pode ser corrigido."
      >
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void adicionar(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-hairline bg-surface-2/50 px-4 py-7 text-center transition-colors hover:border-ink-3"
        >
          <span className="grid h-11 w-11 place-items-center rounded-full bg-surface-3 text-ink-2">
            <I.Upload className="h-5 w-5" />
          </span>
          <span className="text-sm text-ink-2">
            Arraste as faixas do álbum ou{" "}
            <span className="font-medium text-ink underline underline-offset-2">
              escolha do computador
            </span>
          </span>
          <span className="text-xs text-ink-3">
            Pode selecionar vários arquivos ao mesmo tempo
          </span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          multiple
          className="sr-only"
          onChange={(e) => void adicionar(e.target.files)}
        />

        {faixas.length > 0 && (
          <ul className="mt-5 space-y-1.5">
            {faixas.map((f, i) => (
              <li
                key={f.key}
                className={cx(
                  "grid grid-cols-[28px_1fr_auto] items-center gap-3 rounded-lg border px-3 py-2",
                  f.erro
                    ? "border-rose/40 bg-rose/5"
                    : f.url
                      ? "border-hairline bg-surface-2"
                      : "border-hairline bg-surface-2/50",
                )}
              >
                <span className="text-center text-xs tabular-nums text-ink-3">
                  {i + 1}
                </span>

                <div className="min-w-0">
                  <input
                    value={f.title}
                    onChange={(e) => patch(f.key, { title: e.target.value })}
                    aria-label={`Título da faixa ${i + 1}`}
                    className="w-full bg-transparent text-sm text-ink placeholder:text-ink-3 focus:outline-none"
                    placeholder="Título da faixa"
                  />
                  {f.erro ? (
                    <p className="mt-0.5 text-xs text-rose">{f.erro}</p>
                  ) : f.url ? (
                    <p className="mt-0.5 truncate text-xs text-ink-3">
                      {f.fileName} • {formatTime(f.duration)}
                    </p>
                  ) : (
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3">
                      <div
                        className="h-full rounded-full bg-accent transition-[width]"
                        style={{ width: `${f.progresso}%` }}
                      />
                    </div>
                  )}
                </div>

                <span className="flex items-center">
                  {f.url && (
                    <I.Check className="mr-1 h-4 w-4 text-accent" />
                  )}
                  <button
                    type="button"
                    onClick={() => mover(i, -1)}
                    disabled={i === 0}
                    className="rounded p-1 text-ink-2 hover:text-ink disabled:opacity-30"
                    aria-label="Mover para cima"
                  >
                    <I.ChevronDown className="h-4 w-4 rotate-180" />
                  </button>
                  <button
                    type="button"
                    onClick={() => mover(i, 1)}
                    disabled={i === faixas.length - 1}
                    className="rounded p-1 text-ink-2 hover:text-ink disabled:opacity-30"
                    aria-label="Mover para baixo"
                  >
                    <I.ChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setFaixas((prev) => prev.filter((x) => x.key !== f.key))
                    }
                    className="rounded p-1 text-ink-2 hover:text-rose"
                    aria-label={`Remover faixa ${i + 1}`}
                  >
                    <I.X className="h-4 w-4" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={publicar} disabled={!podePublicar || pending}>
          {pending && (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent-ink/30 border-t-accent-ink" />
          )}
          {pending ? "Publicando…" : "Publicar álbum"}
        </Button>
        <p className="text-xs text-ink-3">
          {enviando
            ? "Aguardando o envio das faixas…"
            : prontas.length > 0
              ? `${prontas.length} faixa(s) • ${formatTime(duracaoTotal)}`
              : "Adicione as faixas do álbum."}
        </p>
      </div>
    </div>
  );
}
