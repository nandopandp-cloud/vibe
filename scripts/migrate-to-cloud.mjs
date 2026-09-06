/**
 * Migra o catálogo de `data/sona.json` (versão em arquivo) para o
 * Postgres + Vercel Blob. Idempotente: pode rodar mais de uma vez.
 *
 *   node --env-file=.env.local scripts/migrate-to-cloud.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { put } from "@vercel/blob";

const ROOT = process.cwd();
const JSON_PATH = path.join(ROOT, "data", "sona.json");

const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  process.env.POSTGRES_URL_NON_POOLING;

if (!DATABASE_URL) throw new Error("DATABASE_URL ausente.");
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  throw new Error("BLOB_READ_WRITE_TOKEN ausente.");
}

const sql = neon(DATABASE_URL);

const MIME = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

/** Sobe um arquivo de `public/uploads/...` e devolve a URL do Blob. */
async function upload(publicPath) {
  if (!publicPath || publicPath.startsWith("http")) return publicPath;
  const local = path.join(ROOT, "public", publicPath);
  if (!existsSync(local)) {
    console.warn("  ! arquivo não encontrado, mantendo referência:", publicPath);
    return publicPath;
  }
  const ext = path.extname(local).toLowerCase();
  const buf = readFileSync(local);
  const { url } = await put(publicPath.replace(/^\/uploads\//, ""), buf, {
    access: "public",
    contentType: MIME[ext] ?? "application/octet-stream",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  console.log("  ↑", publicPath, "→", url.slice(0, 72) + "…");
  return url;
}

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admins','user')),
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email))`;
  await sql`
    CREATE TABLE IF NOT EXISTS catalog (
      id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await sql`
    CREATE TABLE IF NOT EXISTS likes (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      track_id TEXT NOT NULL,
      liked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, track_id))`;
  await sql`CREATE INDEX IF NOT EXISTS likes_user_idx ON likes (user_id, liked_at)`;
  console.log("Schema pronto.");

  if (!existsSync(JSON_PATH)) {
    await sql`
      INSERT INTO catalog (id, data)
      VALUES (1, ${JSON.stringify({
        artists: [], albums: [], tracks: [], playlists: [],
        spotlight: {
          trackId: null, eyebrow: "Lançamento", blurb: "",
          quote: "Às vezes, as melhores músicas voltam pra gente.",
        },
      })}::jsonb)
      ON CONFLICT (id) DO NOTHING`;
    console.log("Sem data/sona.json — catálogo criado vazio.");
    return;
  }

  const db = JSON.parse(readFileSync(JSON_PATH, "utf8"));

  console.log(`\nEnviando mídia (${db.tracks.length} faixas)…`);
  for (const t of db.tracks) {
    t.audio = await upload(t.audio);
    t.cover = await upload(t.cover);
  }
  for (const a of db.artists) a.image = await upload(a.image);
  for (const p of db.playlists) p.cover = await upload(p.cover);
  for (const al of db.albums) al.cover = await upload(al.cover);

  const catalog = {
    artists: db.artists,
    albums: db.albums,
    tracks: db.tracks,
    playlists: db.playlists,
    spotlight: db.spotlight,
  };
  await sql`
    INSERT INTO catalog (id, data) VALUES (1, ${JSON.stringify(catalog)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
  console.log("\nCatálogo gravado.");

  for (const u of db.users ?? []) {
    await sql`
      INSERT INTO users (id, email, name, role, password_hash, created_at)
      VALUES (${u.id}, ${u.email}, ${u.name}, ${u.role}, ${u.passwordHash},
              ${u.createdAt})
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email, name = EXCLUDED.name,
        role = EXCLUDED.role, password_hash = EXCLUDED.password_hash`;
    console.log("  usuário:", u.email, `(${u.role})`);
  }

  for (const [userId, trackIds] of Object.entries(db.liked ?? {})) {
    for (const trackId of trackIds) {
      await sql`
        INSERT INTO likes (user_id, track_id) VALUES (${userId}, ${trackId})
        ON CONFLICT DO NOTHING`;
    }
  }

  const [{ count: nUsers }] = await sql`SELECT count(*)::int FROM users`;
  const [{ count: nLikes }] = await sql`SELECT count(*)::int FROM likes`;
  console.log(
    `\nPronto: ${db.tracks.length} faixa(s), ${db.artists.length} artista(s), ` +
      `${nUsers} usuário(s), ${nLikes} curtida(s).`,
  );
}

main().catch((e) => {
  console.error("Falhou:", e);
  process.exit(1);
});
