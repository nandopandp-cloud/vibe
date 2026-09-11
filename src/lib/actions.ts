"use server";

import { revalidatePath } from "next/cache";
import { hydrateAll, likedTracks, mutate, newId, readDb } from "./db";
import { fileField, removeUpload, saveAudio, saveImage, UploadError } from "./storage";
import { foldText, normalizeLyrics, parseLyrics } from "./utils";
import { currentUser } from "./auth";
import type { Database, HydratedTrack, LyricLine, Track } from "./types";

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
/* Publicação a partir de arquivos já enviados ao Blob                 */
/* ------------------------------------------------------------------ */

/** Uma faixa já com áudio e capa no Blob. */
export type PendingTrack = {
  title: string;
  audioUrl: string;
  duration: number;
  coverUrl?: string | null;
  /** Posição no álbum; usada para ordenar. */
  trackNumber?: number;
};

/** Resolve o artista pelo id ou cria um novo com o nome informado. */
function resolveArtist(
  db: Database,
  artistId: string,
  newArtistName: string,
): string {
  if (artistId) return artistId;
  const match = db.artists.find(
    (a) => a.name.toLowerCase() === newArtistName.toLowerCase(),
  );
  if (match) return match.id;

  const id = newId();
  db.artists.push({
    id,
    name: newArtistName,
    image: null,
    bio: "",
    featured: false,
    createdAt: new Date().toISOString(),
  });
  return id;
}

/**
 * Publica uma faixa avulsa cujo áudio já está no Blob.
 * O arquivo vai do navegador direto para o storage; aqui só registramos.
 */
export async function publishTrack(input: {
  artistId: string;
  newArtistName: string;
  genre: string;
  year: number;
  track: PendingTrack;
}): Promise<ActionState> {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const title = input.track.title.trim();
    if (!title) return { ok: false, message: "O título da faixa é obrigatório." };
    if (!input.track.audioUrl) {
      return { ok: false, message: "O envio do áudio não foi concluído." };
    }
    if (!input.artistId && !input.newArtistName.trim()) {
      return { ok: false, message: "Escolha ou informe um artista." };
    }

    await mutate((db) => {
      const artistId = resolveArtist(
        db,
        input.artistId,
        input.newArtistName.trim(),
      );
      db.tracks.push({
        id: newId(),
        title,
        artistId,
        albumId: null,
        genre: input.genre,
        year: input.year || new Date().getFullYear(),
        duration: input.track.duration,
        audio: input.track.audioUrl,
        cover: input.track.coverUrl ?? null,
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

/**
 * Publica um álbum inteiro de uma vez: cria o álbum e todas as faixas,
 * já vinculadas a ele. As faixas herdam a capa do álbum quando não têm
 * uma própria.
 */
export async function publishAlbum(input: {
  albumTitle: string;
  artistId: string;
  newArtistName: string;
  genre: string;
  year: number;
  coverUrl: string | null;
  tracks: PendingTrack[];
}): Promise<ActionState> {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const albumTitle = input.albumTitle.trim();
    if (!albumTitle) {
      return { ok: false, message: "O título do álbum é obrigatório." };
    }
    if (!input.artistId && !input.newArtistName.trim()) {
      return { ok: false, message: "Escolha ou informe um artista." };
    }

    const tracks = input.tracks
      .filter((t) => t.audioUrl && t.title.trim())
      .sort((a, b) => (a.trackNumber ?? 0) - (b.trackNumber ?? 0));

    if (tracks.length === 0) {
      return { ok: false, message: "Adicione ao menos uma faixa ao álbum." };
    }

    await mutate((db) => {
      const artistId = resolveArtist(
        db,
        input.artistId,
        input.newArtistName.trim(),
      );
      const year = input.year || new Date().getFullYear();
      const albumId = newId();

      db.albums.push({
        id: albumId,
        title: albumTitle,
        artistId,
        cover: input.coverUrl,
        year,
        createdAt: new Date().toISOString(),
      });

      // `createdAt` crescente preserva a ordem do disco nas listagens.
      const base = Date.now();
      tracks.forEach((t, i) => {
        db.tracks.push({
          id: newId(),
          title: t.title.trim(),
          artistId,
          albumId,
          genre: input.genre,
          year,
          duration: t.duration,
          audio: t.audioUrl,
          cover: t.coverUrl ?? input.coverUrl,
          lyrics: [],
          plays: 0,
          playLog: [],
          createdAt: new Date(base + i).toISOString(),
        });
      });
    });

    refresh();
    return {
      ok: true,
      message: `Álbum “${albumTitle}” publicado com ${tracks.length} faixa(s).`,
    };
  } catch (e) {
    return fail(e);
  }
}


/** Faixa já existente no álbum, como o editor a devolve. */
export type ExistingTrack = {
  id: string;
  title: string;
  /** Nova posição no disco. */
  trackNumber: number;
};

/**
 * Salva a edição de um álbum numa operação: metadados, ordem e títulos
 * das faixas atuais, faixas acrescentadas e faixas retiradas.
 *
 * Retirar uma faixa do álbum a apaga do catálogo — é o que "remover do
 * disco" significa aqui, já que ela não existe fora dele.
 */
export async function updateAlbum(input: {
  albumId: string;
  albumTitle: string;
  artistId: string;
  newArtistName: string;
  genre: string;
  year: number;
  /** URL nova da capa, ou null para manter a atual. */
  coverUrl: string | null;
  tracks: ExistingTrack[];
  newTracks: PendingTrack[];
  removedTrackIds: string[];
}): Promise<ActionState> {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const albumTitle = input.albumTitle.trim();
    if (!albumTitle) {
      return { ok: false, message: "O título do álbum é obrigatório." };
    }
    if (!input.artistId && !input.newArtistName.trim()) {
      return { ok: false, message: "Escolha ou informe um artista." };
    }
    if (
      input.tracks.length === 0 &&
      input.newTracks.filter((t) => t.audioUrl && t.title.trim()).length === 0
    ) {
      return {
        ok: false,
        message: "O álbum precisa ter ao menos uma faixa.",
      };
    }

    const res = await mutate((db) => {
      const album = db.albums.find((a) => a.id === input.albumId);
      if (!album) return null;

      const artistId = resolveArtist(
        db,
        input.artistId,
        input.newArtistName.trim(),
      );
      const year = input.year || album.year;
      const capaAntiga = album.cover;

      if (input.coverUrl) {
        album.cover = input.coverUrl;
        void removeUpload(capaAntiga);
      }
      album.title = albumTitle;
      album.artistId = artistId;
      album.year = year;

      // --- faixas retiradas: sai do álbum e do catálogo ---
      const removidas = new Set(input.removedTrackIds);
      for (const t of db.tracks) {
        if (!removidas.has(t.id)) continue;
        void removeUpload(t.audio);
        // A capa herdada do álbum é compartilhada; só apaga a própria.
        if (t.cover && t.cover !== capaAntiga && t.cover !== album.cover) {
          void removeUpload(t.cover);
        }
      }
      db.tracks = db.tracks.filter((t) => !removidas.has(t.id));
      for (const uid of Object.keys(db.liked)) {
        db.liked[uid] = db.liked[uid].filter((id) => !removidas.has(id));
      }
      for (const p of db.playlists) {
        p.trackIds = p.trackIds.filter((id) => !removidas.has(id));
      }
      if (db.spotlight.trackId && removidas.has(db.spotlight.trackId)) {
        db.spotlight.trackId = null;
      }

      // `createdAt` crescente é o que ordena as faixas na página do álbum.
      const base = Date.parse(album.createdAt) || Date.now();

      // --- faixas mantidas: título, ordem e metadados herdados ---
      for (const edit of input.tracks) {
        const track = db.tracks.find((t) => t.id === edit.id);
        if (!track || track.albumId !== album.id) continue;
        track.title = edit.title.trim() || track.title;
        track.artistId = artistId;
        track.genre = input.genre;
        track.year = year;
        if (input.coverUrl && track.cover === capaAntiga) {
          track.cover = input.coverUrl;
        }
        track.createdAt = new Date(base + edit.trackNumber).toISOString();
      }

      // --- faixas acrescentadas ---
      const novas = input.newTracks.filter((t) => t.audioUrl && t.title.trim());
      for (const t of novas) {
        db.tracks.push({
          id: newId(),
          title: t.title.trim(),
          artistId,
          albumId: album.id,
          genre: input.genre,
          year,
          duration: t.duration,
          audio: t.audioUrl,
          cover: t.coverUrl ?? album.cover,
          lyrics: [],
          plays: 0,
          playLog: [],
          createdAt: new Date(base + (t.trackNumber ?? 0)).toISOString(),
        });
      }

      return {
        title: albumTitle,
        novas: novas.length,
        removidas: removidas.size,
      };
    });

    if (!res) return { ok: false, message: "Álbum não encontrado." };
    refresh();

    const partes = [`Álbum “${res.title}” atualizado`];
    if (res.novas) partes.push(`${res.novas} faixa(s) adicionada(s)`);
    if (res.removidas) partes.push(`${res.removidas} removida(s)`);
    return { ok: true, message: partes.join(" — ") + "." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteAlbum(id: string): Promise<ActionState> {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const removed = await mutate((db) => {
      const album = db.albums.find((a) => a.id === id);
      if (!album) return null;

      const tracks = db.tracks.filter((t) => t.albumId === id);
      for (const t of tracks) {
        void removeUpload(t.audio);
        if (t.cover !== album.cover) void removeUpload(t.cover);
      }
      const ids = new Set(tracks.map((t) => t.id));

      db.tracks = db.tracks.filter((t) => t.albumId !== id);
      for (const uid of Object.keys(db.liked)) {
        db.liked[uid] = db.liked[uid].filter((tid) => !ids.has(tid));
      }
      for (const p of db.playlists) {
        p.trackIds = p.trackIds.filter((tid) => !ids.has(tid));
      }
      if (db.spotlight.trackId && ids.has(db.spotlight.trackId)) {
        db.spotlight.trackId = null;
      }
      void removeUpload(album.cover);
      db.albums = db.albums.filter((a) => a.id !== id);
      return { title: album.title, n: tracks.length };
    });

    if (!removed) return { ok: false, message: "Álbum não encontrado." };
    refresh();
    return {
      ok: true,
      message: `Álbum “${removed.title}” e ${removed.n} faixa(s) removidos.`,
    };
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
  const db = await readDb();
  const duration = db.tracks.find((t) => t.id === trackId)?.duration ?? 0;
  return saveLyrics(trackId, parseLyrics(raw, duration));
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
        // Playlist do Studio é da casa: sem dono, visível para todos.
        ownerId: null,
        visibility: "public",
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

/**
 * Registra uma reprodução — alimenta o dashboard do studio e os totais de
 * execuções mostrados em artistas, álbuns e faixas.
 */
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

/* ------------------------------------------------------------------ */
/* Continuidade da reprodução                                          */
/* ------------------------------------------------------------------ */

/** Embaralha uma cópia (Fisher-Yates). */
function shuffleCopy<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Faixas para continuar tocando quando a fila acaba.
 *
 * A cascata segue o pedido do produto: primeiro o resto do artista (outros
 * álbuns e singles), depois o mesmo gênero por outros artistas e, por fim,
 * os demais gêneros — sempre pulando o que já está na fila, para não repetir.
 */
export async function fetchAutoplay(input: {
  /** Faixa que acabou de terminar; define artista e gênero de partida. */
  seedTrackId: string;
  /** Ids já tocados/enfileirados, que não devem voltar. */
  excludeIds?: string[];
  /** Quantas faixas trazer de uma vez. */
  limit?: number;
  /** Em modo aleatório a cascata é embaralhada dentro de cada camada. */
  shuffle?: boolean;
}): Promise<HydratedTrack[]> {
  try {
    const user = await currentUser();
    const db = await readDb();

    const seed = db.tracks.find((t) => t.id === input.seedTrackId);
    const limit = Math.max(1, Math.min(input.limit ?? 20, 100));
    const skip = new Set(input.excludeIds ?? []);
    skip.add(input.seedTrackId);

    const pool = db.tracks.filter((t) => !skip.has(t.id) && t.audio);
    if (pool.length === 0) return [];

    const order = (list: Track[]) =>
      input.shuffle
        ? shuffleCopy(list)
        : [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const genre = seed?.genre?.trim().toLowerCase() ?? "";
    const sameArtist: Track[] = [];
    const sameGenre: Track[] = [];
    const rest: Track[] = [];
    for (const t of pool) {
      if (seed && t.artistId === seed.artistId) sameArtist.push(t);
      else if (genre && t.genre.trim().toLowerCase() === genre) sameGenre.push(t);
      else rest.push(t);
    }

    // A última camada é sempre embaralhada: sem afinidade com a semente,
    // uma ordem fixa faria todo mundo cair sempre na mesma faixa.
    const chain = [...order(sameArtist), ...order(sameGenre), ...shuffleCopy(rest)];

    return hydrateAll(db, chain.slice(0, limit), user?.id);
  } catch (e) {
    console.error(e);
    return [];
  }
}

/**
 * Fila aleatória da plataforma inteira — o "aleatório geral" acionado
 * quando o usuário liga o shuffle sem nada tocando.
 */
export async function fetchShuffleAll(
  limit = 50,
): Promise<HydratedTrack[]> {
  try {
    const user = await currentUser();
    const db = await readDb();
    const pool = db.tracks.filter((t) => t.audio);
    return hydrateAll(db, shuffleCopy(pool).slice(0, limit), user?.id);
  } catch (e) {
    console.error(e);
    return [];
  }
}

/**
 * O que se oferece a quem quer pôr música no jam sem ter um nome em
 * mente.
 *
 * Um campo de busca vazio pressupõe que a pessoa já sabe o que quer, e
 * numa sala com amigos quase nunca sabe: a vontade é vaga ("põe alguma
 * coisa boa"). Estas são as três listas de onde ela tiraria a música se
 * estivesse navegando o app — as curtidas dela, o que tocou há pouco, e
 * o catálogo recente. A busca continua existindo para quando o nome
 * existe.
 */
export async function jamPickerSources(): Promise<{
  liked: HydratedTrack[];
  recent: HydratedTrack[];
  fresh: HydratedTrack[];
}> {
  try {
    const user = await currentUser();
    const db = await readDb();
    const playable = (t: Track) => Boolean(t.audio);

    const liked = user ? likedTracks(db, user.id).slice(0, 30) : [];

    // "Tocou há pouco" é a contagem de execuções: o acervo não guarda um
    // histórico por pessoa, e o mais ouvido da casa é o palpite honesto
    // mais próximo disso.
    const recent = hydrateAll(
      db,
      [...db.tracks]
        .filter(playable)
        .sort((a, b) => b.plays - a.plays)
        .slice(0, 30),
      user?.id,
    );

    const fresh = hydrateAll(
      db,
      [...db.tracks]
        .filter(playable)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 30),
      user?.id,
    );

    return { liked, recent, fresh };
  } catch (e) {
    console.error(e);
    return { liked: [], recent: [], fresh: [] };
  }
}

/**
 * Busca faixas pelo título, artista, álbum ou gênero.
 *
 * Existe para o painel do jam poder oferecer a busca ali dentro: mandar
 * a pessoa até a página de busca para acrescentar uma música significa
 * sair da sala, achar a faixa, abrir o menu "⋯" e voltar — e era por
 * isso que "como eu adiciono música no jam?" não tinha resposta óbvia.
 */
export async function searchTracks(
  query: string,
  limit = 20,
): Promise<HydratedTrack[]> {
  try {
    const needle = foldText(query.trim());
    if (needle.length < 2) return [];

    const user = await currentUser();
    const db = await readDb();

    const artistName = (id: string) =>
      db.artists.find((a) => a.id === id)?.name ?? "";
    const albumTitle = (id: string | null) =>
      id ? (db.albums.find((a) => a.id === id)?.title ?? "") : "";

    // O título pesa mais que o resto: quem digita "amanhã" quer a música
    // com esse nome antes do álbum que por acaso a contém.
    const scored = db.tracks
      .filter((t) => t.audio)
      .map((t) => {
        const title = foldText(t.title);
        const haystack = foldText(
          [t.title, artistName(t.artistId), albumTitle(t.albumId), t.genre].join(" "),
        );
        if (title.startsWith(needle)) return { t, score: 0 };
        if (title.includes(needle)) return { t, score: 1 };
        if (haystack.includes(needle)) return { t, score: 2 };
        return null;
      })
      .filter((x): x is { t: Track; score: number } => x !== null)
      .sort((a, b) => a.score - b.score || a.t.title.localeCompare(b.t.title));

    return hydrateAll(db, scored.slice(0, limit).map((x) => x.t), user?.id);
  } catch (e) {
    console.error(e);
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Playlists do ouvinte                                                */
/* ------------------------------------------------------------------ */

/**
 * As playlists do ouvinte são do próprio ouvinte: qualquer ação abaixo
 * confere a posse antes de mexer. Sem isso, o id na URL bastaria para
 * editar a playlist de outra pessoa — ou uma editorial do Studio.
 */
async function ownedPlaylist(
  db: Database,
  playlistId: string,
  userId: string,
) {
  const p = db.playlists.find((x) => x.id === playlistId);
  if (!p || p.ownerId !== userId) return null;
  return p;
}

export async function createMyPlaylist(
  _prev: ActionState | null,
  form: FormData,
): Promise<ActionState> {
  try {
    const user = await currentUser();
    if (!user) return { ok: false, message: "Faça login para continuar." };

    const title = str(form, "title");
    if (!title) return { ok: false, message: "Dê um nome à playlist." };

    // Uma faixa pode vir junto quando a playlist nasce do menu "Adicionar a".
    const seedTrackId = str(form, "trackId");

    await mutate((db) => {
      db.playlists.push({
        id: newId(),
        title,
        description: str(form, "description"),
        cover: null,
        trackIds: seedTrackId ? [seedTrackId] : [],
        editorial: false,
        ownerId: user.id,
        // Privada por padrão: publicar é uma escolha, não um descuido.
        visibility: form.get("visibility") === "public" ? "public" : "private",
        createdAt: new Date().toISOString(),
      });
    });

    refresh();
    return { ok: true, message: `Playlist “${title}” criada.` };
  } catch (e) {
    return fail(e);
  }
}

export async function renameMyPlaylist(
  playlistId: string,
  title: string,
): Promise<ActionState> {
  try {
    const user = await currentUser();
    if (!user) return { ok: false, message: "Faça login para continuar." };
    const clean = title.trim();
    if (!clean) return { ok: false, message: "Dê um nome à playlist." };

    const ok = await mutate(async (db) => {
      const p = await ownedPlaylist(db, playlistId, user.id);
      if (!p) return false;
      p.title = clean;
      return true;
    });
    if (!ok) return { ok: false, message: "Playlist não encontrada." };

    refresh();
    return { ok: true, message: "Playlist renomeada." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteMyPlaylist(
  playlistId: string,
): Promise<ActionState> {
  try {
    const user = await currentUser();
    if (!user) return { ok: false, message: "Faça login para continuar." };

    const ok = await mutate(async (db) => {
      const p = await ownedPlaylist(db, playlistId, user.id);
      if (!p) return false;
      db.playlists = db.playlists.filter((x) => x.id !== playlistId);
      return true;
    });
    if (!ok) return { ok: false, message: "Playlist não encontrada." };

    refresh();
    return { ok: true, message: "Playlist excluída." };
  } catch (e) {
    return fail(e);
  }
}

/** Adiciona ou remove uma faixa de uma playlist do próprio ouvinte. */
export async function toggleMyPlaylistTrack(
  playlistId: string,
  trackId: string,
): Promise<ActionState> {
  try {
    const user = await currentUser();
    if (!user) return { ok: false, message: "Faça login para continuar." };

    const res = await mutate(async (db) => {
      const p = await ownedPlaylist(db, playlistId, user.id);
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

/* ------------------------------------------------------------------ */
/* Artistas seguidos                                                   */
/* ------------------------------------------------------------------ */

/** Segue/deixa de seguir — alimenta a página "Seus Artistas". */
export async function toggleFollowArtist(
  artistId: string,
): Promise<ActionState> {
  try {
    const user = await currentUser();
    if (!user) {
      return { ok: false, message: "Faça login para seguir artistas." };
    }

    const following = await mutate((db) => {
      const list = (db.following[user.id] ??= []);
      const i = list.indexOf(artistId);
      if (i >= 0) {
        list.splice(i, 1);
        return false;
      }
      list.push(artistId);
      return true;
    });

    refresh();
    return {
      ok: true,
      message: following ? "Artista salvo." : "Artista removido.",
    };
  } catch (e) {
    return fail(e);
  }
}

/** Alterna entre pública e privada — só o dono decide. */
export async function toggleMyPlaylistVisibility(
  playlistId: string,
): Promise<ActionState> {
  try {
    const user = await currentUser();
    if (!user) return { ok: false, message: "Faça login para continuar." };

    const now = await mutate(async (db) => {
      const p = await ownedPlaylist(db, playlistId, user.id);
      if (!p) return null;
      p.visibility = p.visibility === "public" ? "private" : "public";
      return p.visibility;
    });
    if (!now) return { ok: false, message: "Playlist não encontrada." };

    refresh();
    return {
      ok: true,
      message: now === "public" ? "Playlist pública." : "Playlist privada.",
    };
  } catch (e) {
    return fail(e);
  }
}
