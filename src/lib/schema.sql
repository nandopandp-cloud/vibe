-- Esquema do Sona.
--
-- O catálogo é pequeno e sempre lido por inteiro para montar as telas,
-- então guardamos cada coleção como um documento JSONB numa única linha.
-- Isso preserva a forma dos dados que o app já usa e mantém a leitura
-- em uma só consulta, sem N+1 nem joins a cada render.
--
-- A tabela de usuários é separada e normalizada: ela precisa de índice
-- único por e-mail e nunca é enviada inteira para o cliente.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admins', 'user')),
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice funcional: e-mails são comparados sempre em minúsculas.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email));

-- Documento único com artistas, álbuns, faixas, playlists e destaque.
CREATE TABLE IF NOT EXISTS catalog (
  id         INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Curtidas: uma linha por par usuário/faixa, com a ordem preservada.
CREATE TABLE IF NOT EXISTS likes (
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL,
  liked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, track_id)
);

CREATE INDEX IF NOT EXISTS likes_user_idx ON likes (user_id, liked_at);
