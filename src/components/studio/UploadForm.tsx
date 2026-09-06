"use client";

import { useState, useTransition } from "react";
import { publishTrack, type ActionState } from "@/lib/actions";
import { BlobDrop, type UploadedFile } from "./BlobDrop";
import { Button, Card, Field, FormMessage, Input, Select } from "./Form";
import type { Artist } from "@/lib/types";

export const GENRES = [
  "Axé", "Pagode", "Samba", "Sertanejo", "MPB", "Forró", "Funk",
  "Pop", "Rock", "R&B", "Hip Hop", "Eletrônica", "Gospel", "Reggae",
];

export function UploadForm({ artists }: { artists: Artist[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionState | null>(null);

  // Vazio = "novo artista", o caminho natural na primeira publicação.
  const [artistId, setArtistId] = useState(artists[0]?.id ?? "");
  const [newArtistName, setNewArtistName] = useState("");
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [audio, setAudio] = useState<UploadedFile | null>(null);
  const [cover, setCover] = useState<UploadedFile | null>(null);

  const podePublicar =
    Boolean(audio) && title.trim() !== "" && (artistId || newArtistName.trim());

  function publicar() {
    if (!audio) return;
    start(async () => {
      const res = await publishTrack({
        artistId,
        newArtistName,
        genre,
        year: Number(year),
        track: {
          title,
          audioUrl: audio.url,
          duration: audio.duration,
          coverUrl: cover?.url ?? null,
        },
      });
      setMsg(res);
      if (res.ok) {
        setTitle("");
        setAudio(null);
        setCover(null);
        setNewArtistName("");
      }
    });
  }

  return (
    <div className="space-y-5">
      <FormMessage state={msg} />

      <Card
        title="Arquivos"
        description="Os arquivos vão direto para o storage — não há limite de 4,5 MB por requisição."
      >
        <div className="grid gap-5 md:grid-cols-2">
          <BlobDrop
            folder="audio"
            label="Arquivo de áudio"
            accept="audio/*"
            hint="MP3, WAV, OGG, FLAC ou M4A — até 60 MB"
            required
            preview="audio"
            value={audio}
            onChange={setAudio}
          />
          <BlobDrop
            folder="covers"
            label="Capa"
            accept="image/*"
            hint="JPG, PNG ou WebP — quadrada, até 8 MB"
            preview="image"
            value={cover}
            onChange={setCover}
          />
        </div>
      </Card>

      <Card title="Informações da faixa">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Título" required className="md:col-span-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Ex.: Vem Dançar Comigo"
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
                required
                placeholder="Ex.: Banda Sol do Mar"
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

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={publicar} disabled={!podePublicar || pending}>
          {pending && (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent-ink/30 border-t-accent-ink" />
          )}
          {pending ? "Publicando…" : "Publicar faixa"}
        </Button>
        <p className="text-xs text-ink-3">
          {audio
            ? "A faixa fica disponível para os ouvintes assim que publicada."
            : "Envie o arquivo de áudio para liberar a publicação."}
        </p>
      </div>
    </div>
  );
}
