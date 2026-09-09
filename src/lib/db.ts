import "server-only";

import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import { connection } from "next/server";
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
type CatalogDoc = Omit<Database, "users" | "liked">;

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

export async function readDb(): Promise<Database> {
  // O catálogo muda em runtime; sem isto as páginas seriam pré-renderizadas
  // no build e os ouvintes veriam um acervo congelado no deploy.
  await connection();
  await ensureSchema();

  const [catalogRows, userRows, likeRows] = await Promise.all([
    sql`SELECT data FROM catalog WHERE id = 1`,
    sql`SELECT id, email, name, role, password_hash, image, google_id,
               created_at
        FROM users ORDER BY created_at`,
    sql`SELECT user_id, track_id FROM likes ORDER BY liked_at`,
  ]);

  const doc = (catalogRows[0]?.data ?? EMPTY_CATALOG) as Partial<CatalogDoc>;

  const liked: Record<string, string[]> = {};
  for (const row of likeRows as { user_id: string; track_id: string }[]) {
    (liked[row.user_id] ??= []).push(row.track_id);
  }

  return {
    ...EMPTY_CATALOG,
    ...doc,
    spotlight: { ...EMPTY_DB.spotlight, ...(doc.spotlight ?? {}) },
    users: (userRows as UserRow[]).map(toUser),
    liked,
  };
}

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
  const snapshot = structuredClone({ users: db.users, liked: db.liked });

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
