import "server-only";

import { neon } from "@neondatabase/serverless";
import { randomBytes, randomUUID } from "node:crypto";
import { connection } from "next/server";
import { cache } from "react";
import {
  EMPTY_DB,
  type Artist,
  type Database,
  type FriendActivity,
  type FriendEdge,
  type Friendship,
  type HydratedJamInvite,
  type HydratedTrack,
  type Jam,
  type JamInvite,
  type JamMember,
  type JamParticipant,
  type JamSnapshot,
  type PublicUser,
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

/**
 * Parte do catálogo que mora no documento JSONB. Tudo que é por usuário
 * — curtidas, artistas seguidos, amizades, jams — fica em tabela própria:
 * são escritas de uma pessoa só, e não podem reescrever o acervo inteiro.
 */
type CatalogDoc = Omit<
  Database,
  | "users"
  | "liked"
  | "following"
  | "friendships"
  | "jams"
  | "jamMembers"
  | "jamInvites"
>;

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
    // Amigos: uma linha por par, gravada no sentido do pedido. A chave
    // primária composta já impede pedido duplicado no mesmo sentido; o
    // sentido inverso é barrado na action, que checa antes de inserir.
    await sql`
      CREATE TABLE IF NOT EXISTS friendships (
        requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        addressee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status       TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        accepted_at  TIMESTAMPTZ,
        PRIMARY KEY (requester_id, addressee_id),
        CHECK (requester_id <> addressee_id)
      )`;
    // As duas pontas consultam "minhas amizades", e cada uma cai num
    // lado diferente do par — daí dois índices.
    await sql`
      CREATE INDEX IF NOT EXISTS friendships_addressee_idx
        ON friendships (addressee_id, status)`;
    await sql`
      CREATE INDEX IF NOT EXISTS friendships_requester_idx
        ON friendships (requester_id, status)`;

    // Jam: o relógio compartilhado da escuta em conjunto. Fica em tabela
    // própria, e não no documento do catálogo, porque é escrito a cada
    // poucos segundos pelo host e lido em polling por todo mundo — passar
    // isso pelo documento reescreveria o acervo inteiro a cada batida.
    await sql`
      CREATE TABLE IF NOT EXISTS jams (
        id          TEXT PRIMARY KEY,
        code        TEXT NOT NULL,
        host_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        queue       JSONB NOT NULL DEFAULT '[]'::jsonb,
        track_index INT NOT NULL DEFAULT -1,
        position    DOUBLE PRECISION NOT NULL DEFAULT 0,
        position_at BIGINT NOT NULL DEFAULT 0,
        playing     BOOLEAN NOT NULL DEFAULT false,
        revision    BIGINT NOT NULL DEFAULT 1,
        ended_at    TIMESTAMPTZ,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
    // Entrar pelo link busca pelo código; só os jams abertos disputam,
    // então um código só precisa ser único entre os que ainda vivem.
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS jams_code_open_key
        ON jams (code) WHERE ended_at IS NULL`;
    await sql`
      CREATE TABLE IF NOT EXISTS jam_members (
        jam_id       TEXT NOT NULL REFERENCES jams(id) ON DELETE CASCADE,
        user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (jam_id, user_id)
      )`;
    // "Em que jam eu estou?" é a pergunta de toda navegação do cliente.
    await sql`
      CREATE INDEX IF NOT EXISTS jam_members_user_idx
        ON jam_members (user_id)`;
    await sql`
      CREATE TABLE IF NOT EXISTS jam_invites (
        id         TEXT PRIMARY KEY,
        jam_id     TEXT NOT NULL REFERENCES jams(id) ON DELETE CASCADE,
        from_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        to_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
    // Um convite por pessoa por jam: reconvidar apenas renova a data.
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS jam_invites_pair_key
        ON jam_invites (jam_id, to_id)`;
    await sql`
      CREATE INDEX IF NOT EXISTS jam_invites_to_idx ON jam_invites (to_id)`;

    // Presença: o que cada pessoa está ouvindo agora.
    //
    // Uma linha por usuário, sobrescrita a cada troca de faixa — o
    // passado não interessa aqui, só o instante. Fica fora do documento
    // do catálogo porque é escrita a cada poucos segundos por todo mundo
    // que estiver ouvindo, e passar isso pelo JSONB reescreveria o
    // acervo inteiro a cada batida.
    await sql`
      CREATE TABLE IF NOT EXISTS presence (
        user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        track_id   TEXT,
        playing    BOOLEAN NOT NULL DEFAULT false,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;

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

type FriendshipRow = {
  requester_id: string;
  addressee_id: string;
  status: Friendship["status"];
  created_at: Date | string;
  accepted_at: Date | string | null;
};

const toFriendship = (r: FriendshipRow): Friendship => ({
  requesterId: r.requester_id,
  addresseeId: r.addressee_id,
  status: r.status,
  createdAt: new Date(r.created_at).toISOString(),
  acceptedAt: r.accepted_at ? new Date(r.accepted_at).toISOString() : null,
});

type JamRow = {
  id: string;
  code: string;
  host_id: string;
  name: string;
  queue: string[];
  track_index: number;
  position: number;
  position_at: string | number;
  playing: boolean;
  ended_at: Date | string | null;
  created_at: Date | string;
};

const toJam = (r: JamRow): Jam => ({
  id: r.id,
  code: r.code,
  hostId: r.host_id,
  name: r.name,
  queue: r.queue ?? [],
  index: r.track_index,
  position: Number(r.position),
  // `BIGINT` volta como string no driver; sem o Number a conta de deriva
  // viraria concatenação de texto.
  positionAt: Number(r.position_at),
  playing: r.playing,
  endedAt: r.ended_at ? new Date(r.ended_at).toISOString() : null,
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

  const [
    catalogRows,
    userRows,
    likeRows,
    followRows,
    friendRows,
    jamRows,
    memberRows,
    inviteRows,
  ] = await Promise.all([
    sql`SELECT data FROM catalog WHERE id = 1`,
    sql`SELECT id, email, name, role, password_hash, image, google_id,
               created_at
        FROM users ORDER BY created_at`,
    sql`SELECT user_id, track_id FROM likes ORDER BY liked_at`,
    sql`SELECT user_id, artist_id FROM follows ORDER BY followed_at`,
    sql`SELECT requester_id, addressee_id, status, created_at, accepted_at
        FROM friendships ORDER BY created_at`,
    // Só os jams vivos: um encerrado não interessa a nenhuma tela.
    sql`SELECT id, code, host_id, name, queue, track_index, position,
               position_at, playing, ended_at, created_at
        FROM jams WHERE ended_at IS NULL ORDER BY created_at`,
    sql`SELECT m.jam_id, m.user_id, m.joined_at, m.last_seen_at
        FROM jam_members m
        JOIN jams j ON j.id = m.jam_id AND j.ended_at IS NULL
        ORDER BY m.joined_at`,
    sql`SELECT i.id, i.jam_id, i.from_id, i.to_id, i.created_at
        FROM jam_invites i
        JOIN jams j ON j.id = i.jam_id AND j.ended_at IS NULL
        ORDER BY i.created_at DESC`,
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
    // O catálogo já gravado traz `monthlyListeners`, um número digitado à
    // mão que deu lugar às execuções reais. Descartamos na leitura para
    // não reescrevê-lo a cada gravação do documento.
    artists: (doc.artists ?? []).map(
      ({ id, name, image, bio, featured, createdAt }): Artist => ({
        id,
        name,
        image,
        bio,
        featured,
        createdAt,
      }),
    ),
    // Faixas anteriores ao contador não têm `plays`; sem isto as somas
    // por artista e por álbum virariam NaN.
    tracks: (doc.tracks ?? []).map((t) => ({
      ...t,
      plays: t.plays ?? 0,
      playLog: t.playLog ?? [],
    })),
    spotlight: { ...EMPTY_DB.spotlight, ...(doc.spotlight ?? {}) },
    users: (userRows as UserRow[]).map(toUser),
    liked,
    following,
    friendships: (friendRows as FriendshipRow[]).map(toFriendship),
    jams: (jamRows as JamRow[]).map(toJam),
    jamMembers: (
      memberRows as Array<{
        jam_id: string;
        user_id: string;
        joined_at: Date | string;
        last_seen_at: Date | string;
      }>
    ).map(
      (r): JamMember => ({
        jamId: r.jam_id,
        userId: r.user_id,
        joinedAt: new Date(r.joined_at).toISOString(),
        lastSeenAt: new Date(r.last_seen_at).toISOString(),
      }),
    ),
    jamInvites: (
      inviteRows as Array<{
        id: string;
        jam_id: string;
        from_id: string;
        to_id: string;
        created_at: Date | string;
      }>
    ).map(
      (r): JamInvite => ({
        id: r.id,
        jamId: r.jam_id,
        fromId: r.from_id,
        toId: r.to_id,
        createdAt: new Date(r.created_at).toISOString(),
      }),
    ),
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
    friendships: db.friendships,
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
  await syncFriendships(snapshot.friendships, db.friendships);

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

/**
 * Grava as amizades criadas, aceitas e desfeitas.
 *
 * A chave é o par ordenado, e não um id próprio: é assim que o resto do
 * código encontra a relação, em qualquer dos dois sentidos. Só o `status`
 * muda depois de criada (pendente vira aceita), então é o único campo
 * que o UPDATE precisa tocar.
 */
async function syncFriendships(before: Friendship[], after: Friendship[]) {
  const key = (f: Friendship) => `${f.requesterId}:${f.addresseeId}`;
  const prev = new Map(before.map((f) => [key(f), f]));
  const next = new Map(after.map((f) => [key(f), f]));

  for (const [id, link] of next) {
    const old = prev.get(id);
    if (!old) {
      await sql`
        INSERT INTO friendships (requester_id, addressee_id, status,
                                 created_at, accepted_at)
        VALUES (${link.requesterId}, ${link.addresseeId}, ${link.status},
                ${link.createdAt}, ${link.acceptedAt})
        ON CONFLICT (requester_id, addressee_id) DO NOTHING`;
    } else if (old.status !== link.status) {
      await sql`
        UPDATE friendships
        SET status = ${link.status}, accepted_at = ${link.acceptedAt}
        WHERE requester_id = ${link.requesterId}
          AND addressee_id = ${link.addresseeId}`;
    }
  }

  for (const [id, link] of prev) {
    if (!next.has(id)) {
      await sql`
        DELETE FROM friendships
        WHERE requester_id = ${link.requesterId}
          AND addressee_id = ${link.addresseeId}`;
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

/**
 * Execuções somadas por artista — quantas vezes as faixas dele tocaram.
 *
 * O total sai sempre de `track.plays`, que é incrementado a cada
 * reprodução real. Um Map evita varrer o catálogo uma vez por artista
 * nas telas que listam muitos deles.
 */
export function playsByArtist(db: Database): Map<string, number> {
  const total = new Map<string, number>();
  for (const t of db.tracks) {
    total.set(t.artistId, (total.get(t.artistId) ?? 0) + t.plays);
  }
  return total;
}

/** Execuções somadas por álbum, na mesma lógica de `playsByArtist`. */
export function playsByAlbum(db: Database): Map<string, number> {
  const total = new Map<string, number>();
  for (const t of db.tracks) {
    if (!t.albumId) continue;
    total.set(t.albumId, (total.get(t.albumId) ?? 0) + t.plays);
  }
  return total;
}

/** Execuções de um artista específico. */
export function artistPlays(db: Database, artistId: string): number {
  return db.tracks
    .filter((t) => t.artistId === artistId)
    .reduce((s, t) => s + t.plays, 0);
}

/* ------------------------------------------------------------------ */
/* Amigos                                                             */
/* ------------------------------------------------------------------ */

/**
 * A amizade entre duas pessoas, em qualquer sentido que tenha sido pedida.
 *
 * O par é guardado uma única vez, na direção do convite, então toda
 * consulta precisa olhar os dois lados — é o preço de não duplicar a
 * relação, e vale: assim nunca existem duas linhas discordando.
 */
export function friendshipBetween(
  db: Database,
  a: string,
  b: string,
): Friendship | null {
  return (
    db.friendships.find(
      (f) =>
        (f.requesterId === a && f.addresseeId === b) ||
        (f.requesterId === b && f.addresseeId === a),
    ) ?? null
  );
}

/** Ids de quem já é amigo confirmado. */
export function friendIds(db: Database, userId: string): string[] {
  return db.friendships
    .filter(
      (f) =>
        f.status === "accepted" &&
        (f.requesterId === userId || f.addresseeId === userId),
    )
    .map((f) => (f.requesterId === userId ? f.addresseeId : f.requesterId));
}

/**
 * Todas as relações de uma pessoa, já viradas para o ponto de vista dela:
 * quem é amigo, quem convidou, quem foi convidado.
 */
export function friendEdges(db: Database, userId: string): FriendEdge[] {
  const byId = new Map(db.users.map((u) => [u.id, u]));

  return db.friendships
    .filter((f) => f.requesterId === userId || f.addresseeId === userId)
    .flatMap((f) => {
      const outgoing = f.requesterId === userId;
      const other = byId.get(outgoing ? f.addresseeId : f.requesterId);
      // Conta apagada no meio do caminho: a linha cai junto por FK, mas
      // uma leitura concorrente ainda pode vê-la.
      if (!other) return [];
      return [
        {
          user: toPublicUser(other),
          status: f.status,
          direction: outgoing ? ("outgoing" as const) : ("incoming" as const),
          createdAt: f.createdAt,
        },
      ];
    });
}

/** Versão pública de um usuário — sem hash de senha nem id do provedor. */
export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _h, googleId: _g, ...rest } = user;
  void _h;
  void _g;
  return rest;
}

/* ------------------------------------------------------------------ */
/* Jam — escrita                                                       */
/* ------------------------------------------------------------------ */

/**
 * O jam não passa por `mutate`.
 *
 * `mutate` grava o catálogo inteiro e compara snapshots — o certo para
 * uma curtida, que acontece de vez em quando. O jam é o oposto: o host
 * reporta a posição a cada poucos segundos e todos leem em polling. Aqui
 * cada operação é um UPDATE dirigido à linha do jam, o que também evita
 * que dois participantes enfileirando ao mesmo tempo sobrescrevam um ao
 * outro com um documento inteiro cada.
 */

/** Alfabeto sem 0/O e 1/I — o código é ditado em voz alta. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(length = 6): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

/** Cria o jam e já coloca o host dentro dele. */
export async function insertJam(input: {
  hostId: string;
  name: string;
  queue: string[];
  index: number;
}): Promise<Jam> {
  await ensureSchema();

  // Colisão de código é improvável, mas o índice único só cobre os jams
  // abertos: em vez de confiar na sorte, tentamos de novo algumas vezes.
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = newId();
    const code = randomCode();
    const rows = await sql`
      INSERT INTO jams (id, code, host_id, name, queue, track_index,
                        position, position_at, playing)
      VALUES (${id}, ${code}, ${input.hostId}, ${input.name},
              ${JSON.stringify(input.queue)}::jsonb, ${input.index},
              0, ${Date.now()}, false)
      ON CONFLICT DO NOTHING
      RETURNING id, code, host_id, name, queue, track_index, position,
                position_at, playing, ended_at, created_at`;

    const row = (rows as JamRow[])[0];
    if (!row) continue; // código repetido — sorteia outro

    await sql`
      INSERT INTO jam_members (jam_id, user_id)
      VALUES (${id}, ${input.hostId})
      ON CONFLICT DO NOTHING`;

    return toJam(row);
  }

  throw new Error("Não foi possível gerar um código de jam livre.");
}

/** Um jam aberto pelo id, ou `null` se não existe / já encerrou. */
export async function findJam(jamId: string): Promise<Jam | null> {
  await ensureSchema();
  const rows = await sql`
    SELECT id, code, host_id, name, queue, track_index, position,
           position_at, playing, ended_at, created_at
    FROM jams WHERE id = ${jamId} AND ended_at IS NULL`;
  const row = (rows as JamRow[])[0];
  return row ? toJam(row) : null;
}

/** Um jam aberto pelo código do convite — a porta de entrada do link. */
export async function findJamByCode(code: string): Promise<Jam | null> {
  await ensureSchema();
  const rows = await sql`
    SELECT id, code, host_id, name, queue, track_index, position,
           position_at, playing, ended_at, created_at
    FROM jams WHERE code = ${code.toUpperCase()} AND ended_at IS NULL`;
  const row = (rows as JamRow[])[0];
  return row ? toJam(row) : null;
}

/** O jam em que a pessoa está agora, se estiver em algum. */
export async function findJamForUser(userId: string): Promise<Jam | null> {
  await ensureSchema();
  const rows = await sql`
    SELECT j.id, j.code, j.host_id, j.name, j.queue, j.track_index,
           j.position, j.position_at, j.playing, j.ended_at, j.created_at
    FROM jams j
    JOIN jam_members m ON m.jam_id = j.id AND m.user_id = ${userId}
    WHERE j.ended_at IS NULL
    ORDER BY m.joined_at DESC
    LIMIT 1`;
  const row = (rows as JamRow[])[0];
  return row ? toJam(row) : null;
}

/** Entra no jam (ou apenas renova a presença, se já estava dentro). */
export async function joinJam(jamId: string, userId: string): Promise<void> {
  await ensureSchema();
  await sql`
    INSERT INTO jam_members (jam_id, user_id)
    VALUES (${jamId}, ${userId})
    ON CONFLICT (jam_id, user_id)
    DO UPDATE SET last_seen_at = now()`;
  // Entrar consome o convite: ele já cumpriu o papel.
  await sql`
    DELETE FROM jam_invites WHERE jam_id = ${jamId} AND to_id = ${userId}`;
}

export async function leaveJam(jamId: string, userId: string): Promise<void> {
  await ensureSchema();
  await sql`
    DELETE FROM jam_members
    WHERE jam_id = ${jamId} AND user_id = ${userId}`;
}

/** Encerra o jam para todo mundo. Só o host chega aqui. */
export async function endJam(jamId: string): Promise<void> {
  await ensureSchema();
  await sql`
    UPDATE jams SET ended_at = now(), playing = false
    WHERE id = ${jamId} AND ended_at IS NULL`;
}

/** Marca presença — é isso que sustenta o "ouvindo agora". */
export async function touchJamMember(
  jamId: string,
  userId: string,
): Promise<void> {
  await ensureSchema();
  await sql`
    UPDATE jam_members SET last_seen_at = now()
    WHERE jam_id = ${jamId} AND user_id = ${userId}`;
}

/**
 * O relógio do host: em que faixa, em que segundo, medido quando.
 *
 * `revision` só avança quando a faixa muda, porque é ela que faz os
 * convidados recarregarem o áudio — uma batida de posição a cada quatro
 * segundos não deveria acordar ninguém.
 */
export async function updateJamPlayback(
  jamId: string,
  state: { index: number; position: number; positionAt: number; playing: boolean },
): Promise<void> {
  await ensureSchema();
  await sql`
    UPDATE jams
    SET track_index = ${state.index},
        position = ${state.position},
        position_at = ${state.positionAt},
        playing = ${state.playing},
        revision = CASE WHEN track_index <> ${state.index}
                        THEN revision + 1 ELSE revision END
    WHERE id = ${jamId} AND ended_at IS NULL`;
}

/**
 * Acrescenta faixas ao fim da fila, ignorando as que já estão nela.
 *
 * O `jsonb` é montado dentro do próprio UPDATE em vez de ser lido,
 * alterado em JS e regravado: dois convidados enfileirando no mesmo
 * segundo têm as duas músicas somadas, e não uma perdida.
 */
export async function appendToJamQueue(
  jamId: string,
  trackIds: string[],
): Promise<number> {
  await ensureSchema();
  if (trackIds.length === 0) return 0;

  const rows = await sql`
    UPDATE jams
    SET queue = queue || (
          SELECT COALESCE(jsonb_agg(t.value), '[]'::jsonb)
          FROM jsonb_array_elements(${JSON.stringify(trackIds)}::jsonb) AS t(value)
          WHERE NOT queue @> jsonb_build_array(t.value)
        ),
        revision = revision + 1
    WHERE id = ${jamId} AND ended_at IS NULL
    RETURNING jsonb_array_length(queue) AS size`;

  return Number((rows as { size: number }[])[0]?.size ?? 0);
}

/**
 * Substitui a fila inteira — o host trocou de álbum, de playlist, ou
 * arrastou uma faixa para outro lugar.
 *
 * `position` é um parâmetro em vez de zero fixo porque nem toda troca de
 * fila é uma troca de faixa: reordenar o que vem depois, ou tirar uma
 * música do meio, deixa a atual tocando onde estava. Zerar ali faria a
 * sala inteira voltar ao começo por causa de um arrasto.
 */
export async function replaceJamQueue(
  jamId: string,
  trackIds: string[],
  index: number,
  state?: { position?: number; playing?: boolean },
): Promise<void> {
  await ensureSchema();
  await sql`
    UPDATE jams
    SET queue = ${JSON.stringify(trackIds)}::jsonb,
        track_index = ${index},
        position = ${Math.max(0, state?.position ?? 0)},
        position_at = ${Date.now()},
        playing = ${state?.playing ?? true},
        revision = revision + 1
    WHERE id = ${jamId} AND ended_at IS NULL`;
}

/** Tira uma faixa da fila pelo id. Não mexe na que está tocando. */
export async function removeFromJamQueue(
  jamId: string,
  trackId: string,
): Promise<void> {
  await ensureSchema();
  await sql`
    UPDATE jams
    SET queue = (
          SELECT COALESCE(jsonb_agg(value), '[]'::jsonb)
          FROM jsonb_array_elements(queue) AS value
          WHERE value <> to_jsonb(${trackId}::text)
        ),
        revision = revision + 1
    WHERE id = ${jamId} AND ended_at IS NULL`;
}

/* ------------------------------------------------------------------ */
/* Jam — leitura para a UI                                             */
/* ------------------------------------------------------------------ */

/** Depois disso sem dar sinal, o participante deixa de contar como online. */
const PRESENCE_WINDOW_MS = 45_000;

type JamReadRow = JamRow & { revision: string | number };

/**
 * O snapshot que o cliente consome: a fila hidratada, quem está na sala e
 * o relógio do host. É lido em polling, então tudo sai em uma consulta
 * por tabela — nada de N+1 por participante.
 */
export async function readJamSnapshot(
  jamId: string,
  viewerId: string,
): Promise<JamSnapshot | null> {
  await ensureSchema();

  const [jamRows, memberRows] = await Promise.all([
    sql`SELECT id, code, host_id, name, queue, track_index, position,
               position_at, playing, revision, ended_at, created_at
        FROM jams WHERE id = ${jamId}`,
    sql`SELECT m.user_id, m.joined_at, m.last_seen_at,
               u.id, u.email, u.name, u.role, u.image, u.created_at
        FROM jam_members m
        JOIN users u ON u.id = m.user_id
        WHERE m.jam_id = ${jamId}
        ORDER BY m.joined_at`,
  ]);

  const row = (jamRows as JamReadRow[])[0];
  if (!row) return null;

  const jam = toJam(row);
  const db = await readDb();

  // A fila guarda ids; faixas apagadas do catálogo somem daqui em vez de
  // virarem buracos que travariam o player de todo mundo.
  const queue = jam.queue
    .map((id) => db.tracks.find((t) => t.id === id))
    .filter((t): t is Track => Boolean(t))
    .map((t) => hydrate(db, t, viewerId));

  const cutoff = Date.now() - PRESENCE_WINDOW_MS;
  const participants = (
    memberRows as Array<{
      user_id: string;
      joined_at: Date | string;
      last_seen_at: Date | string;
      email: string;
      name: string;
      role: User["role"];
      image: string | null;
      created_at: Date | string;
    }>
  ).map(
    (m): JamParticipant => ({
      id: m.user_id,
      email: m.email,
      name: m.name,
      role: m.role,
      image: m.image,
      createdAt: new Date(m.created_at).toISOString(),
      isHost: m.user_id === jam.hostId,
      online: new Date(m.last_seen_at).getTime() >= cutoff,
      joinedAt: new Date(m.joined_at).toISOString(),
    }),
  );

  return {
    id: jam.id,
    code: jam.code,
    name: jam.name,
    hostId: jam.hostId,
    isHost: jam.hostId === viewerId,
    index: jam.index,
    position: jam.position,
    positionAt: jam.positionAt,
    playing: jam.playing,
    ended: Boolean(jam.endedAt),
    queue,
    participants,
    revision: String(row.revision),
  };
}

/* ------------------------------------------------------------------ */
/* Jam — convites                                                      */
/* ------------------------------------------------------------------ */

export async function insertJamInvite(input: {
  jamId: string;
  fromId: string;
  toId: string;
}): Promise<void> {
  await ensureSchema();
  await sql`
    INSERT INTO jam_invites (id, jam_id, from_id, to_id)
    VALUES (${newId()}, ${input.jamId}, ${input.fromId}, ${input.toId})
    ON CONFLICT (jam_id, to_id) DO UPDATE SET created_at = now()`;
}

export async function deleteJamInvite(
  jamId: string,
  toId: string,
): Promise<void> {
  await ensureSchema();
  await sql`
    DELETE FROM jam_invites WHERE jam_id = ${jamId} AND to_id = ${toId}`;
}

/** Convites pendentes de uma pessoa, já com jam e remetente resolvidos. */
export function pendingInvitesFor(
  db: Database,
  userId: string,
): HydratedJamInvite[] {
  const byId = new Map(db.users.map((u) => [u.id, u]));

  return db.jamInvites
    .filter((i) => i.toId === userId)
    .flatMap((invite) => {
      const jam = db.jams.find((j) => j.id === invite.jamId);
      const from = byId.get(invite.fromId);
      if (!jam || !from) return [];
      return [
        {
          id: invite.id,
          jamId: jam.id,
          code: jam.code,
          jamName: jam.name,
          from: toPublicUser(from),
          createdAt: invite.createdAt,
        },
      ];
    });
}

/* ------------------------------------------------------------------ */
/* Presença — quem está ouvindo agora                                  */
/* ------------------------------------------------------------------ */

/**
 * Quanto tempo sem notícias antes de considerarmos a pessoa fora.
 *
 * Precisa ser confortavelmente maior que o intervalo do batimento do
 * cliente — senão um pacote atrasado apagaria a bolinha de alguém que
 * está ali, ouvindo. Com um batimento de 20s, um minuto dá margem para
 * duas falhas seguidas antes de a ausência virar verdade.
 */
const ACTIVITY_WINDOW_MS = 60_000;

/**
 * Registra o que alguém está ouvindo.
 *
 * `updated_at` é medido aqui, e não no navegador: relógios de cliente
 * discordam entre si em minutos, e é contra este mesmo relógio que a
 * leitura decide quem ainda está online.
 */
export async function updatePresence(
  userId: string,
  state: { trackId: string | null; playing: boolean },
): Promise<void> {
  await ensureSchema();
  await sql`
    INSERT INTO presence (user_id, track_id, playing, updated_at)
    VALUES (${userId}, ${state.trackId}, ${state.playing}, now())
    ON CONFLICT (user_id) DO UPDATE
      SET track_id = EXCLUDED.track_id,
          playing = EXCLUDED.playing,
          updated_at = now()`;
}

/** Apaga a presença — a pessoa saiu da conta. */
export async function clearPresence(userId: string): Promise<void> {
  await ensureSchema();
  await sql`DELETE FROM presence WHERE user_id = ${userId}`;
}

/**
 * O que os amigos de alguém estão ouvindo.
 *
 * A consulta é restrita aos amigos já dentro do SQL, e não filtrada
 * depois em JS: a presença diz onde cada pessoa está a cada instante, e
 * trazer a tabela inteira para o servidor de aplicação seria entregar
 * isso de todo mundo para responder sobre uma dúzia.
 *
 * Quem nunca tocou nada não tem linha nenhuma aqui, e é por isso que a
 * lista de amigos vem de `friendIds` e a presença é *acrescentada* a
 * ela: um amigo sem presença aparece offline, e não some da tela.
 */
export async function readFriendActivity(
  userId: string,
): Promise<FriendActivity[]> {
  await ensureSchema();

  const db = await readDb();
  const ids = friendIds(db, userId);
  if (ids.length === 0) return [];

  const rows = (await sql`
    SELECT user_id, track_id, playing, updated_at
    FROM presence
    WHERE user_id = ANY(${ids})`) as Array<{
    user_id: string;
    track_id: string | null;
    playing: boolean;
    updated_at: Date | string;
  }>;

  const seen = new Map(rows.map((r) => [r.user_id, r]));
  const byId = new Map(db.users.map((u) => [u.id, u]));
  const cutoff = Date.now() - ACTIVITY_WINDOW_MS;

  const list = ids.flatMap((id): FriendActivity[] => {
    const user = byId.get(id);
    // Conta apagada entre a leitura das amizades e esta: a linha cai por
    // FK, mas uma leitura concorrente ainda pode ver o id.
    if (!user) return [];

    const row = seen.get(id);
    const at = row ? new Date(row.updated_at).getTime() : 0;
    const online = at >= cutoff;

    // A faixa só é mostrada de quem está online. Uma presença velha
    // descreve o passado, e "ouvindo" no presente é o que a tela promete.
    const track =
      online && row?.track_id
        ? (db.tracks.find((t) => t.id === row.track_id) ?? null)
        : null;

    return [
      {
        user: toPublicUser(user),
        online,
        track: track ? hydrate(db, track, userId) : null,
        playing: online ? Boolean(row?.playing) : false,
        lastSeenAt: row ? new Date(row.updated_at).toISOString() : null,
      },
    ];
  });

  /**
   * A ordem é a da tela, e não a do banco: quem está tocando alguma
   * coisa primeiro, depois quem está online sem tocar, e os ausentes no
   * fim. Ordenar por nome dentro de cada grupo mantém a lista estável —
   * sem isso, um amigo pausar a música o faria saltar para outro lugar
   * por causa de um empate desfeito ao acaso.
   */
  const rank = (f: FriendActivity) =>
    f.online && f.track ? 0 : f.online ? 1 : 2;

  return list.sort(
    (a, b) =>
      rank(a) - rank(b) || a.user.name.localeCompare(b.user.name, "pt-BR"),
  );
}
