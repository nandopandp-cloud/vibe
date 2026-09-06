"use server";

import { revalidatePath } from "next/cache";
import { mutate, newId, readDb } from "./db";
import { fileField, removeUpload, saveAudio, saveImage, UploadError } from "./storage";
import { normalizeLyrics, parseTimecode } from "./utils";
import { currentUser } from "./auth";
import type { LyricLine } from "./types";

export type ActionState = { ok: boolean; message: string };

/** Revalida as duas áreas: o que o studio muda, o cliente vê. */
function refresh() {
  revalidatePath("/", "layout");
}

function fail(e: unknown): ActionState {
  if (e instanceof UploadError) return { ok: false, message: e.message };
  console.error(e);
  return { ok: false, message: "Algo deu errado. Tente novamente." };
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/**
 * Barreira de permissão do Studio. As páginas já redirecionam quem não é
 * admin, mas Server Actions são endpoints públicos: sem esta checagem,
 * qualquer pessoa poderia invocá-las diretamente.
 */
async function denyIfNotAdmin(): Promise<ActionState | null> {
  const user = await currentUser();
  if (!user) return { ok: false, message: "Faça login para continuar." };
  if (user.role !== "admins") {
    return { ok: false, message: "Apenas administradores podem fazer isso." };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Artistas                                                            */
/* ------------------------------------------------------------------ */

export async function createArtist(
  _prev: ActionState | null,
  form: FormData,
): Promise<ActionState> {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const name = str(form, "name");
    if (!name) return { ok: false, message: "O nome do artista é obrigatório." };

    const existing = await readDb();
    if (
      existing.artists.some(
        (a) => a.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      return { ok: false, message: `“${name}” já está no catálogo.` };
    }

    const photo = fileField(form, "image");
    const image = photo ? await saveImage(photo) : null;

    await mutate((db) => {
      db.artists.push({
        id: newId(),
        name,
        image,
        bio: str(form, "bio"),
        monthlyListeners: Number(form.get("monthlyListeners") ?? 0) || 0,
        featured: form.get("featured") === "on",
        createdAt: new Date().toISOString(),
      });
    });

    refresh();
    return { ok: true, message: `${name} adicionado ao catálogo.` };
  } catch (e) {
    return fail(e);
  }
}

export async function updateArtist(
  _prev: ActionState | null,
  form: FormData,
): Promise<ActionState> {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const id = str(form, "id");
    const photo = fileField(form, "image");
    const image = photo ? await saveImage(photo) : null;

    const res = await mutate((db) => {
      const artist = db.artists.find((a) => a.id === id);
      if (!artist) return null;
      if (image) {
        void removeUpload(artist.image);
        artist.image = image;
      }
      artist.name = str(form, "name") || artist.name;
      artist.bio = str(form, "bio");
      artist.monthlyListeners =
        Number(form.get("monthlyListeners") ?? 0) || 0;
      artist.featured = form.get("featured") === "on";
      return artist.name;
    });

    if (!res) return { ok: false, message: "Artista não encontrado." };
    refresh();
    return { ok: true, message: `${res} atualizado.` };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteArtist(id: string): Promise<ActionState> {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const removed = await mutate((db) => {
      const artist = db.artists.find((a) => a.id === id);
      if (!artist) return null;

      // Remove também as faixas do artista e as referências a elas.
      const orphaned = db.tracks.filter((t) => t.artistId === id);
      for (const t of orphaned) {
        void removeUpload(t.audio);
        void removeUpload(t.cover);
      }
      const orphanIds = new Set(orphaned.map((t) => t.id));

      db.tracks = db.tracks.filter((t) => t.artistId !== id);
      db.albums = db.albums.filter((al) => al.artistId !== id);
      // As curtidas são por usuário: limpa as faixas órfãs em todos.
      for (const uid of Object.keys(db.liked)) {
        db.liked[uid] = db.liked[uid].filter((tid) => !orphanIds.has(tid));
      }
      for (const p of db.playlists) {
        p.trackIds = p.trackIds.filter((tid) => !orphanIds.has(tid));
      }
      if (db.spotlight.trackId && orphanIds.has(db.spotlight.trackId)) {
        db.spotlight.trackId = null;
      }
      void removeUpload(artist.image);
      db.artists = db.artists.filter((a) => a.id !== id);
      return { name: artist.name, tracks: orphaned.length };
    });

    if (!removed) return { ok: false, message: "Artista não encontrado." };
    refresh();
    return {
      ok: true,
      message: removed.tracks
        ? `${removed.name} e ${removed.tracks} faixa(s) removidos.`
        : `${removed.name} removido.`,
    };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------------------------------ */
/* Faixas                                                              */
/* ------------------------------------------------------------------ */

export async function createTrack(
  _prev: ActionState | null,
  form: FormData,
): Promise<ActionState> {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const title = str(form, "title");
    if (!title) return { ok: false, message: "O título da faixa é obrigatório." };

    // O artista pode vir de um select ou ser criado na hora pelo nome digitado.
    let artistId = str(form, "artistId");
    const newArtistName = str(form, "newArtistName");
    if (!artistId && !newArtistName) {
      return { ok: false, message: "Escolha ou informe um artista." };
    }

    const audioFile = fileField(form, "audio");
    if (!audioFile) return { ok: false, message: "Envie o arquivo de áudio." };

    const { url: audio, duration } = await saveAudio(audioFile);
    const coverFile = fileField(form, "cover");
    const cover = coverFile ? await saveImage(coverFile) : null;

    await mutate((db) => {
      if (!artistId) {
        const match = db.artists.find(
          (a) => a.name.toLowerCase() === newArtistName.toLowerCase(),
        );
        if (match) {
          artistId = match.id;
        } else {
          artistId = newId();
          db.artists.push({
            id: artistId,
            name: newArtistName,
            image: null,
            bio: "",
            monthlyListeners: 0,
            featured: false,
            createdAt: new Date().toISOString(),
          });
        }
      }

      db.tracks.push({
        id: newId(),
        title,
        artistId,
        albumId: str(form, "albumId") || null,
        genre: str(form, "genre"),
        year: Number(form.get("year")) || new Date().getFullYear(),
        duration,
        audio,
        cover,
        lyrics: [],
        plays: 0,
        playLog: [],
        createdAt: new Date().toISOString(),
      });
    });

    refresh();
    return { ok: true, message: `“${title}” publicada.` };
  } catch (e) {
    return fail(e);
  }
}

export async function updateTrack(
  _prev: ActionState | null,
  form: FormData,
): Promise<ActionState> {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const id = str(form, "id");
    const coverFile = fileField(form, "cover");
    const cover = coverFile ? await saveImage(coverFile) : null;
    const audioFile = fileField(form, "audio");
    const audio = audioFile ? await saveAudio(audioFile) : null;

    const res = await mutate((db) => {
      const track = db.tracks.find((t) => t.id === id);
      if (!track) return null;
      if (cover) {
        void removeUpload(track.cover);
        track.cover = cover;
      }
      if (audio) {
        void removeUpload(track.audio);
        track.audio = audio.url;
        track.duration = audio.duration || track.duration;
      }
      track.title = str(form, "title") || track.title;
      track.artistId = str(form, "artistId") || track.artistId;
      track.albumId = str(form, "albumId") || null;
      track.genre = str(form, "genre");
      track.year = Number(form.get("year")) || track.year;
      return track.title;
    });

    if (!res) return { ok: false, message: "Faixa não encontrada." };
    refresh();
    return { ok: true, message: `“${res}” atualizada.` };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTrack(id: string): Promise<ActionState> {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const removed = await mutate((db) => {
      const track = db.tracks.find((t) => t.id === id);
      if (!track) return null;
      void removeUpload(track.audio);
      void removeUpload(track.cover);
      db.tracks = db.tracks.filter((t) => t.id !== id);
      for (const uid of Object.keys(db.liked)) {
        db.liked[uid] = db.liked[uid].filter((tid) => tid !== id);
      }
      for (const p of db.playlists) {
        p.trackIds = p.trackIds.filter((tid) => tid !== id);
      }
      if (db.spotlight.trackId === id) db.spotlight.trackId = null;
      return track.title;
    });

    if (!removed) return { ok: false, message: "Faixa não encontrada." };
    refresh();
    return { ok: true, message: `“${removed}” removida.` };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------------------------------ */
/* Letras sincronizadas                                                */
/* ------------------------------------------------------------------ */

export async function saveLyrics(
  trackId: string,
  lines: LyricLine[],
): Promise<ActionState> {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const clean = normalizeLyrics(
      lines.map((l) => ({ time: Math.max(0, l.time), text: l.text.trim() })),
    );
    const res = await mutate((db) => {
      const track = db.tracks.find((t) => t.id === trackId);
      if (!track) return null;
      track.lyrics = clean;
      return track.title;
    });
    if (!res) return { ok: false, message: "Faixa não encontrada." };
    refresh();
    return {
      ok: true,
      message: `Letra de “${res}” salva com ${clean.length} linha(s).`,
    };
  } catch (e) {
    return fail(e);
  }
}

/** Importa letra colada em texto, aceitando "[0:12] verso" por linha. */
export async function importLyrics(
  trackId: string,
  raw: string,
): Promise<ActionState> {
  const lines: LyricLine[] = [];
  let fallback = 0;
  for (const line of raw.split("\n")) {
    const text = line.trim();
    if (!text) continue;
    const tagged = /^\[?(\d+:[0-5]?\d(?:[.,]\d+)?)\]?\s+(.*)$/.exec(text);
    if (tagged) {
      const t = parseTimecode(tagged[1]);
      lines.push({ time: t ?? fallback, text: tagged[2] });
      fallback = (t ?? fallback) + 3;
    } else {
      lines.push({ time: fallback, text });
      fallback += 3;
    }
  }
  return saveLyrics(trackId, lines);
}

/* ------------------------------------------------------------------ */
/* Playlists e curadoria                                               */
/* ------------------------------------------------------------------ */

export async function createPlaylist(
  _prev: ActionState | null,
  form: FormData,
): Promise<ActionState> {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const title = str(form, "title");
    if (!title) return { ok: false, message: "Dê um nome à playlist." };
    const coverFile = fileField(form, "cover");
    const cover = coverFile ? await saveImage(coverFile) : null;

    await mutate((db) => {
      db.playlists.push({
        id: newId(),
        title,
        description: str(form, "description"),
        cover,
        trackIds: [],
        editorial: form.get("editorial") === "on",
        createdAt: new Date().toISOString(),
      });
    });

    refresh();
    return { ok: true, message: `Playlist “${title}” criada.` };
  } catch (e) {
    return fail(e);
  }
}

export async function deletePlaylist(id: string): Promise<ActionState> {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const removed = await mutate((db) => {
      const p = db.playlists.find((x) => x.id === id);
      if (!p) return null;
      void removeUpload(p.cover);
      db.playlists = db.playlists.filter((x) => x.id !== id);
      return p.title;
    });
    if (!removed) return { ok: false, message: "Playlist não encontrada." };
    refresh();
    return { ok: true, message: `“${removed}” removida.` };
  } catch (e) {
    return fail(e);
  }
}

/** Alterna a presença de uma faixa numa playlist. */
export async function togglePlaylistTrack(
  playlistId: string,
  trackId: string,
): Promise<ActionState> {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const res = await mutate((db) => {
      const p = db.playlists.find((x) => x.id === playlistId);
      if (!p) return null;
      const i = p.trackIds.indexOf(trackId);
      if (i >= 0) p.trackIds.splice(i, 1);
      else p.trackIds.push(trackId);
      return i >= 0 ? "removida" : "adicionada";
    });
    if (!res) return { ok: false, message: "Playlist não encontrada." };
    refresh();
    return { ok: true, message: `Faixa ${res}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function reorderPlaylist(
  playlistId: string,
  trackIds: string[],
): Promise<ActionState> {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    await mutate((db) => {
      const p = db.playlists.find((x) => x.id === playlistId);
      if (p) p.trackIds = trackIds;
    });
    refresh();
    return { ok: true, message: "Ordem atualizada." };
  } catch (e) {
    return fail(e);
  }
}

export async function updateSpotlight(
  _prev: ActionState | null,
  form: FormData,
): Promise<ActionState> {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    await mutate((db) => {
      db.spotlight = {
        trackId: str(form, "trackId") || null,
        eyebrow: str(form, "eyebrow") || "Lançamento",
        blurb: str(form, "blurb"),
        quote: str(form, "quote"),
      };
    });
    refresh();
    return { ok: true, message: "Destaque da home atualizado." };
  } catch (e) {
    return fail(e);
  }
}

export async function toggleArtistFeatured(id: string): Promise<ActionState> {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const res = await mutate((db) => {
      const a = db.artists.find((x) => x.id === id);
      if (!a) return null;
      a.featured = !a.featured;
      return a.featured;
    });
    if (res === null) return { ok: false, message: "Artista não encontrado." };
    refresh();
    return {
      ok: true,
      message: res ? "Artista em destaque." : "Removido dos destaques.",
    };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------------------------------ */
/* Cliente                                                             */
/* ------------------------------------------------------------------ */

export async function toggleLike(trackId: string): Promise<ActionState> {
  try {
    const user = await currentUser();
    if (!user) return { ok: false, message: "Faça login para curtir músicas." };

    const liked = await mutate((db) => {
      const list = (db.liked[user.id] ??= []);
      const i = list.indexOf(trackId);
      if (i >= 0) {
        list.splice(i, 1);
        return false;
      }
      list.push(trackId);
      return true;
    });
    refresh();
    return { ok: true, message: liked ? "Adicionada às curtidas." : "Removida." };
  } catch (e) {
    return fail(e);
  }
}

/** Registra uma reprodução — alimenta o dashboard do studio. */
export async function registerPlay(trackId: string): Promise<void> {
  try {
    await mutate((db) => {
      const t = db.tracks.find((x) => x.id === trackId);
      if (!t) return;
      t.plays += 1;
      t.playLog.push(new Date().toISOString());
      // Mantém o log limitado; o gráfico só olha os últimos 30 dias.
      if (t.playLog.length > 2000) t.playLog = t.playLog.slice(-2000);
    });
    revalidatePath("/studio");
  } catch (e) {
    console.error(e);
  }
}
