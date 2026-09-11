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

-- Amizades: uma linha por par, gravada no sentido do pedido
-- (`requester_id` convidou `addressee_id`). Guardar o sentido é o que
-- permite a cada lado ver a caixa certa — "recebidos" de um é "enviados"
-- do outro — sem duplicar a relação e arriscar duas linhas discordando.
CREATE TABLE IF NOT EXISTS friendships (
  requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at  TIMESTAMPTZ,
  PRIMARY KEY (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);

-- As duas pontas perguntam "quais são minhas amizades", e cada uma cai
-- num lado diferente do par — daí dois índices.
CREATE INDEX IF NOT EXISTS friendships_addressee_idx
  ON friendships (addressee_id, status);
CREATE INDEX IF NOT EXISTS friendships_requester_idx
  ON friendships (requester_id, status);

-- Jam: a escuta em conjunto.
--
-- Fica em tabela própria, e não no documento do catálogo, porque é
-- escrita a cada poucos segundos pelo host e lida em polling por todos —
-- passar isso pelo JSONB reescreveria o acervo inteiro a cada batida.
--
-- O par (position, position_at) é o coração da sincronia: em vez de
-- dizer "o tempo agora", o host grava em que segundo a música estava num
-- instante conhecido. É isso que faz a conta sobreviver à latência — um
-- pacote que chega atrasado ainda descreve corretamente onde a sala está.
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
  -- Avança só quando a fila ou a faixa muda: é o sinal de "recarregue o
  -- áudio". Uma batida de posição não pode acordar os convidados.
  revision    BIGINT NOT NULL DEFAULT 1,
  ended_at    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Entrar pelo link busca pelo código; só os jams abertos disputam, então
-- um código precisa ser único apenas entre os que ainda vivem.
CREATE UNIQUE INDEX IF NOT EXISTS jams_code_open_key
  ON jams (code) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS jam_members (
  jam_id       TEXT NOT NULL REFERENCES jams(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Último ping, renovado pelo próprio polling: é o que sustenta o
  -- indicador de "ouvindo agora" sem uma segunda chamada só para isso.
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (jam_id, user_id)
);

CREATE INDEX IF NOT EXISTS jam_members_user_idx ON jam_members (user_id);

CREATE TABLE IF NOT EXISTS jam_invites (
  id         TEXT PRIMARY KEY,
  jam_id     TEXT NOT NULL REFERENCES jams(id) ON DELETE CASCADE,
  from_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Um convite por pessoa por jam: reconvidar apenas renova a data.
CREATE UNIQUE INDEX IF NOT EXISTS jam_invites_pair_key
  ON jam_invites (jam_id, to_id);
CREATE INDEX IF NOT EXISTS jam_invites_to_idx ON jam_invites (to_id);
