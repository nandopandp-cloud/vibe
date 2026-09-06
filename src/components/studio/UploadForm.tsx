"use client";

import { useActionState, useState } from "react";
import { createTrack } from "@/lib/actions";
import {
  Card,
  Field,
  FileDrop,
  FormMessage,
  Input,
  Select,
  SubmitButton,
} from "./Form";
import type { Album, Artist } from "@/lib/types";

const GENRES = [
  "Axé", "Pagode", "Samba", "Sertanejo", "MPB", "Forró", "Funk",
  "Pop", "Rock", "R&B", "Hip Hop", "Eletrônica", "Gospel", "Reggae",
];

export function UploadForm({
  artists,
  albums,
}: {
  artists: Artist[];
  albums: Album[];
}) {
  const [state, action] = useActionState(createTrack, null);
  // Vazio = "novo artista", o caminho natural na primeira publicação.
  const [artistId, setArtistId] = useState(artists[0]?.id ?? "");

  const albumsOfArtist = albums.filter((a) => a.artistId === artistId);

  return (
    <form action={action} className="space-y-5">
      <FormMessage state={state} />

      <Card title="Arquivos" description="O áudio é obrigatório; a capa é opcional, mas recomendada.">
        <div className="grid gap-5 md:grid-cols-2">
          <FileDrop
            name="audio"
            accept="audio/*"
            label="Arquivo de áudio"
            hint="MP3, WAV, OGG, FLAC ou M4A — até 40 MB"
            required
            preview="audio"
          />
          <FileDrop
            name="cover"
            accept="image/*"
            label="Capa"
            hint="JPG, PNG ou WebP — quadrada, até 8 MB"
            preview="image"
          />
        </div>
      </Card>

      <Card title="Informações da faixa">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Título" required className="md:col-span-2">
            <Input name="title" required placeholder="Ex.: Vem Dançar Comigo" />
          </Field>

          <Field label="Artista" required>
            <Select
              name="artistId"
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
                name="newArtistName"
                required
                placeholder="Ex.: Banda Sol do Mar"
              />
            </Field>
          )}

          <Field label="Gênero">
            <Select name="genre" defaultValue="">
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
              name="year"
              type="number"
              min={1900}
              max={2100}
              defaultValue={new Date().getFullYear()}
            />
          </Field>

          {albumsOfArtist.length > 0 && (
            <Field label="Álbum" hint="Deixe em branco para publicar como single.">
              <Select name="albumId" defaultValue="">
                <option value="">Single</option>
                {albumsOfArtist.map((al) => (
                  <option key={al.id} value={al.id}>
                    {al.title}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel="Publicando…">Publicar faixa</SubmitButton>
        <p className="text-xs text-ink-3">
          A faixa fica disponível para os ouvintes assim que publicada.
        </p>
      </div>
    </form>
  );
}
