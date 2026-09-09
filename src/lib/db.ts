import "server-only";

import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import { connection } from "next/server";
import { cache } from "react";
import {
  EMPTY_DB,
  type Database,
  type HydratedTrack,
  type Track,
  type User,
} from "./types";

/**
 * O catálogo (artistas, álbuns, faixas, playlists, destaque) vive como um
 * documento JSONB numa linha só: ele é sempre lido inteiro para montar as
 * telas, e assim uma consulta basta. Usuários e curtidas ficam em tabelas
 * próprias — precisam de unicidade por e-mail e de chave estrangeira.
 */

const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  process.env.POSTGRES_URL_NON_POOLING;

if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL não definida. Rode `vercel env pull .env.local` ou configure o Postgres.",
  );
}

const sql = neon(DATABASE_URL);

/** Parte do catálogo que mora no documento JSONB. */
type CatalogDoc = Omit<Database, "users" | "liked" | "following">;

const EMPTY_CATALOG: CatalogDoc = {
  artists: [],
  albums: [],
  tracks: [],
  playlists: [],
  spotlight: EMPTY_DB.spotlight,
};

/* ------------------------------------------------------------------ */
/* Migração                                                            */
/* ------------------------------------------------------------------ */

let migrated: Promise<void> | null = null;

/** Cria as tabelas na primeira consulta; roda uma única vez por instância. */
function ensureSchema(): Promise<void> {
  migrated ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL,
        name          TEXT NOT NULL,
        role          TEXT NOT NULL CHECK (role IN ('admins', 'user')),
        password_hash TEXT NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email))`;
    // Login social: colunas acrescentadas depois do primeiro deploy, por
    // isso bancos já existentes as recebem aqui. Conta do Google não tem
    // senha, então `password_hash` deixa de ser obrigatória.
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS image TEXT`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT`;
    await sql`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_key
        ON users (google_id) WHERE google_id IS NOT NULL`;
    await sql`
      CREATE TABLE IF NOT EXISTS catalog (
        id         INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        data       JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
    await sql`
      CREATE TABLE IF NOT EXISTS likes (
        user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        track_id TEXT NOT NULL,
        liked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, track_id)
      )`;
    await sql`
      CREATE INDEX IF NOT EXISTS likes_user_idx ON likes (user_id, liked_at)`;
    await sql`
      CREATE TABLE IF NOT EXISTS follows (
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        artist_id   TEXT NOT NULL,
        followed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, artist_id)
      )`;
    await sql`
      CREATE INDEX IF NOT EXISTS follows_user_idx
        ON follows (user_id, followed_at)`;
    await sql`
      INSERT INTO catalog (id, data)
      VALUES (1, ${JSON.stringify(EMPTY_CATALOG)}::jsonb)
      ON CONFLICT (id) DO NOTHING`;
  })().catch((e) => {
    // Uma falha não pode ficar em cache como se tivesse dado certo.
    migrated = null;
    throw e;
  });
  return migrated;
}

/* ------------------------------------------------------------------ */
/* Leitura                                                             */
/* ------------------------------------------------------------------ */

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: User["role"];
  password_hash: string | null;
  image: string | null;
  google_id: string | null;
  created_at: Date | string;
};

const toUser = (r: UserRow): User => ({
  id: r.id,
  email: r.email,
  name: r.name,
  role: r.role,
  passwordHash: r.password_hash,
  image: r.image,
  googleId: r.google_id,
  createdAt: new Date(r.created_at).toISOString(),
});

/**
 * Leitura crua do banco. Use `readDb`, que memoiza esta função por
 * requisição — o layout e a página pediam o catálogo várias vezes cada,
 * e cada chamada custava quatro consultas ao Postgres.
 */
async function loadDb(): Promise<Database> {
  // O catálogo muda em runtime; sem isto as páginas seriam pré-renderizadas
  // no build e os ouvintes veriam um acervo congelado no deploy.
  await connection();
  await ensureSchema();

  const [catalogRows, userRows, likeRows, followRows] = await Promise.all([
    sql`SELECT data FROM catalog WHERE id = 1`,
    sql`SELECT id, email, name, role, password_hash, image, google_id,
               created_at
        FROM users ORDER BY created_at`,
    sql`SELECT user_id, track_id FROM likes ORDER BY liked_at`,
    sql`SELECT user_id, artist_id FROM follows ORDER BY followed_at`,
  ]);

  const doc = (catalogRows[0]?.data ?? EMPTY_CATALOG) as Partial<CatalogDoc>;

  const liked: Record<string, string[]> = {};
  for (const row of likeRows as { user_id: string; track_id: string }[]) {
    (liked[row.user_id] ??= []).push(row.track_id);
  }

  const following: Record<string, string[]> = {};
  for (const row of followRows as { user_id: string; artist_id: string }[]) {
    (following[row.user_id] ??= []).push(row.artist_id);
  }

  return {
    ...EMPTY_CATALOG,
    ...doc,
    // Playlists gravadas antes do recurso de playlist do ouvinte não têm
    // `ownerId`: são todas da casa.
    playlists: (doc.playlists ?? []).map((p) => ({
      ...p,
      ownerId: p.ownerId ?? null,
      visibility: p.visibility ?? "public",
    })),
    spotlight: { ...EMPTY_DB.spotlight, ...(doc.spotlight ?? {}) },
    users: (userRows as UserRow[]).map(toUser),
    liked,
    following,
  };
}

/**
 * O catálogo de uma requisição, lido no máximo uma vez.
 *
 * `cache` do React vale só para a requisição em curso: duas navegações
 * seguidas continuam vendo dados frescos, mas o layout, a página e o
 * `currentUser` compartilham a mesma leitura em vez de repetirem quatro
 * consultas cada um.
 */
export const readDb = cache(loadDb);

/* ------------------------------------------------------------------ */
/* Escrita                                                             */
/* ------------------------------------------------------------------ */

/**
 * Lê o estado, aplica a mutação e persiste o que mudou.
 *
 * O callback continua recebendo o `Database` inteiro e mutando-o em memória,
 * como na versão em arquivo — por isso as actions não precisaram mudar.
 * Aqui comparamos com o estado anterior e gravamos: o catálogo como
 * documento, usuários e curtidas linha a linha.
 */
export async function mutate<T>(
  fn: (db: Database) => T | Promise<T>,
): Promise<T> {
  await ensureSchema();
  const db = await readDb();
  // Cópia para comparar depois: o callback muta `db` no lugar.
  const snapshot = structuredClone({
    users: db.users,
    liked: db.liked,
    following: db.following,
  });

  const result = await fn(db);

  const catalog: CatalogDoc = {
    artists: db.artists,
    albums: db.albums,
    tracks: db.tracks,
    playlists: db.playlists,
    spotlight: db.spotlight,
  };

  await sql`
    UPDATE catalog
    SET data = ${JSON.stringify(catalog)}::jsonb, updated_at = now()
    WHERE id = 1`;

  await syncUsers(snapshot.users, db.users);
  await syncLikes(snapshot.liked, db.liked);
  await syncFollows(snapshot.following, db.following);

  return result;
}

async function syncUsers(before: User[], after: User[]) {
  const prev = new Map(before.map((u) => [u.id, u]));
  const next = new Set(after.map((u) => u.id));

  for (const user of after) {
    const old = prev.get(user.id);
    if (!old) {
      await sql`
        INSERT INTO users (id, email, name, role, password_hash, image,
                           google_id, created_at)
        VALUES (${user.id}, ${user.email}, ${user.name}, ${user.role},
                ${user.passwordHash}, ${user.image}, ${user.googleId},
                ${user.createdAt})
        ON CONFLICT (id) DO NOTHING`;
    } else if (
      old.email !== user.email ||
      old.name !== user.name ||
      old.role !== user.role ||
      old.passwordHash !== user.passwordHash ||
      old.image !== user.image ||
      old.googleId !== user.googleId
    ) {
      await sql`
        UPDATE users
        SET email = ${user.email}, name = ${user.name},
            role = ${user.role}, password_hash = ${user.passwordHash},
            image = ${user.image}, google_id = ${user.googleId}
        WHERE id = ${user.id}`;
    }
  }

  for (const user of before) {
    if (!next.has(user.id)) {
      await sql`DELETE FROM users WHERE id = ${user.id}`;
    }
  }
}

async function syncLikes(
  before: Record<string, string[]>,
  after: Record<string, string[]>,
) {
  const userIds = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const userId of userIds) {
    const prev = new Set(before[userId] ?? []);
    const next = new Set(after[userId] ?? []);

    for (const trackId of next) {
      if (!prev.has(trackId)) {
        await sql`
          INSERT INTO likes (user_id, track_id) VALUES (${userId}, ${trackId})
          ON CONFLICT DO NOTHING`;
      }
    }
    for (const trackId of prev) {
      if (!next.has(trackId)) {
        await sql`
          DELETE FROM likes WHERE user_id = ${userId} AND track_id = ${trackId}`;
      }
    }
  }
}

async function syncFollows(
  before: Record<string, string[]>,
  after: Record<string, string[]>,
) {
  const userIds = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const userId of userIds) {
    const prev = new Set(before[userId] ?? []);
    const next = new Set(after[userId] ?? []);

    for (const artistId of next) {
      if (!prev.has(artistId)) {
        await sql`
          INSERT INTO follows (user_id, artist_id)
          VALUES (${userId}, ${artistId})
          ON CONFLICT DO NOTHING`;
      }
    }
    for (const artistId of prev) {
      if (!next.has(artistId)) {
        await sql`
          DELETE FROM follows
          WHERE user_id = ${userId} AND artist_id = ${artistId}`;
      }
    }
  }
}

export const newId = () => randomUUID().slice(0, 8);

/* ------------------------------------------------------------------ */
/* Leitura hidratada                                                   */
/* ------------------------------------------------------------------ */

export function hydrate(
  db: Database,
  track: Track,
  userId?: string | null,
): HydratedTrack {
  return {
    ...track,
    artist: db.artists.find((a) => a.id === track.artistId) ?? null,
    album: track.albumId
      ? (db.albums.find((al) => al.id === track.albumId) ?? null)
      : null,
    liked: userId ? (db.liked[userId]?.includes(track.id) ?? false) : false,
  };
}

export function hydrateAll(
  db: Database,
  tracks: Track[],
  userId?: string | null,
): HydratedTrack[] {
  return tracks.map((t) => hydrate(db, t, userId));
}

/** Faixas mais recentes primeiro. */
export function recentTracks(
  db: Database,
  userId?: string | null,
): HydratedTrack[] {
  const sorted = [...db.tracks].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  return hydrateAll(db, sorted, userId);
}

/** Curtidas de um usuário, na ordem em que foram salvas. */
export function likedTracks(
  db: Database,
  userId: string | null | undefined,
): HydratedTrack[] {
  if (!userId) return [];
  const ids = db.liked[userId] ?? [];
  const tracks = ids
    .map((id) => db.tracks.find((t) => t.id === id))
    .filter((t): t is Track => Boolean(t));
  return hydrateAll(db, tracks, userId);
}

/**
 * Capas para o mosaico de uma playlist.
 *
 * Percorre as faixas na ordem e recolhe capas distintas, mas dá a vez a
 * artistas ainda não representados antes de aceitar uma segunda capa do
 * mesmo — uma playlist de seis músicas de duas bandas rende um mosaico
 * com as duas, e não quatro capas do mesmo álbum.
 */
export function playlistCovers(
  db: Database,
  trackIds: string[],
  limit = 4,
): string[] {
  const tracks = trackIds
    .map((id) => db.tracks.find((t) => t.id === id))
    .filter((t): t is Track => Boolean(t?.cover));

  const chosen: string[] = [];
  const seenCover = new Set<string>();
  const seenArtist = new Set<string>();

  // Primeira passada: um por artista, para o mosaico mostrar variedade.
  for (const t of tracks) {
    if (chosen.length >= limit) break;
    if (seenArtist.has(t.artistId) || seenCover.has(t.cover!)) continue;
    seenArtist.add(t.artistId);
    seenCover.add(t.cover!);
    chosen.push(t.cover!);
  }

  // Segunda: completa com o que sobrou, se ainda faltar espaço.
  for (const t of tracks) {
    if (chosen.length >= limit) break;
    if (seenCover.has(t.cover!)) continue;
    seenCover.add(t.cover!);
    chosen.push(t.cover!);
  }

  return chosen;
}
