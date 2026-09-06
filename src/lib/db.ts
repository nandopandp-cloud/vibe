import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { connection } from "next/server";
import {
  EMPTY_DB,
  type Database,
  type HydratedTrack,
  type Track,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "sona.json");

/**
 * Serializa as escritas. Sem isso, dois uploads simultâneos fariam
 * read-modify-write em cima do mesmo snapshot e um perderia o outro.
 */
let queue: Promise<unknown> = Promise.resolve();

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readDb(): Promise<Database> {
  // O catálogo vive no disco e muda em runtime (uploads no Studio).
  // Sem isto, as páginas seriam pré-renderizadas no build e os ouvintes
  // veriam um catálogo congelado no momento do deploy.
  await connection();
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<Database>;
    // Merge com EMPTY_DB para tolerar arquivos de versões anteriores.
    return {
      ...EMPTY_DB,
      ...parsed,
      spotlight: { ...EMPTY_DB.spotlight, ...(parsed.spotlight ?? {}) },
    };
  } catch {
    return structuredClone(EMPTY_DB);
  }
}

async function writeDb(db: Database): Promise<void> {
  await ensureDir();
  // Escrita atômica: grava em temporário e renomeia, para nunca deixar
  // um JSON truncado se o processo morrer no meio.
  const tmp = `${DB_PATH}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmp, DB_PATH);
}

/** Lê, aplica a mutação e persiste — tudo dentro da fila. */
export function mutate<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const db = await readDb();
    const result = await fn(db);
    await writeDb(db);
    return result;
  });
  // A fila continua mesmo se esta mutação falhar.
  queue = run.catch(() => undefined);
  return run;
}

export const newId = () => randomUUID().slice(0, 8);

/* ------------------------------------------------------------------ */
/* Leitura hidratada                                                    */
/* ------------------------------------------------------------------ */

export function hydrate(db: Database, track: Track): HydratedTrack {
  return {
    ...track,
    artist: db.artists.find((a) => a.id === track.artistId) ?? null,
    album: track.albumId
      ? (db.albums.find((al) => al.id === track.albumId) ?? null)
      : null,
    liked: db.liked.includes(track.id),
  };
}

export function hydrateAll(db: Database, tracks: Track[]): HydratedTrack[] {
  return tracks.map((t) => hydrate(db, t));
}

/** Faixas mais recentes primeiro. */
export function recentTracks(db: Database, limit?: number): HydratedTrack[] {
  const sorted = [...db.tracks].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  return hydrateAll(db, limit ? sorted.slice(0, limit) : sorted);
}
