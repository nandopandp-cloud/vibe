/** Modelo de domínio do Sona. */

/** `admins` alimenta o catálogo; `user` apenas consome. */
export type Role = "admins" | "user";

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  /**
   * scrypt: "<salt hex>:<hash hex>" — nunca a senha em texto.
   * `null` em contas que só entram pelo Google e nunca definiram senha.
   */
  passwordHash: string | null;
  /** Foto de perfil: vem do Google no login social. */
  image: string | null;
  /** `sub` do Google, estável mesmo se a pessoa trocar de e-mail. */
  googleId: string | null;
  createdAt: string;
};

/** O que a UI pode ver — sem o hash nem o id do provedor social. */
export type PublicUser = Omit<User, "passwordHash" | "googleId">;

export type Artist = {
  id: string;
  name: string;
  /** URL pública da foto no Vercel Blob. */
  image: string | null;
  bio: string;
  featured: boolean;
  createdAt: string;
};

export type LyricLine = {
  /** Segundos a partir do início da faixa. */
  time: number;
  text: string;
};

export type Track = {
  id: string;
  title: string;
  artistId: string;
  albumId: string | null;
  genre: string;
  year: number;
  /** Duração em segundos, lida do arquivo no upload. */
  duration: number;
  audio: string;
  cover: string | null;
  lyrics: LyricLine[];
  plays: number;
  /** Timestamps ISO de cada reprodução, para o gráfico de streams. */
  playLog: string[];
  createdAt: string;
};

export type Album = {
  id: string;
  title: string;
  artistId: string;
  cover: string | null;
  year: number;
  createdAt: string;
};

export type Playlist = {
  id: string;
  title: string;
  description: string;
  cover: string | null;
  trackIds: string[];
  /** Playlists editoriais aparecem na home do cliente. */
  editorial: boolean;
  /**
   * Dono da playlist. `null` nas editoriais, feitas no Studio e visíveis
   * para todo mundo; preenchido nas que o próprio ouvinte cria, que só
   * ele enxerga e edita.
   */
  ownerId: string | null;
  /**
   * Playlist de ouvinte pública aparece para quem tem o link; privada só
   * abre para o dono. As editoriais do Studio são sempre públicas.
   */
  visibility: "public" | "private";
  createdAt: string;
};

export type Spotlight = {
  /** Faixa em destaque no banner da home. */
  trackId: string | null;
  eyebrow: string;
  blurb: string;
  quote: string;
};

/* ------------------------------------------------------------------ */
/* Amigos                                                             */
/* ------------------------------------------------------------------ */

/**
 * Uma amizade entre duas pessoas.
 *
 * A linha é gravada uma só vez, no sentido em que o pedido foi feito:
 * `requesterId` convidou `addresseeId`. Guardar o sentido é o que
 * permite a cada lado ver a caixa certa — "pedidos recebidos" de um é
 * "pedidos enviados" do outro — sem duplicar a relação no banco.
 */
export type Friendship = {
  requesterId: string;
  addresseeId: string;
  /** `pending` enquanto o convidado não respondeu; some se ele recusar. */
  status: "pending" | "accepted";
  createdAt: string;
  /** Quando virou amizade de fato. `null` enquanto está pendente. */
  acceptedAt: string | null;
};

/** Uma amizade do ponto de vista de quem está olhando. */
export type FriendEdge = {
  user: PublicUser;
  status: "pending" | "accepted";
  /** Em quem partiu o convite: `incoming` espera a sua resposta. */
  direction: "incoming" | "outgoing";
  createdAt: string;
};

/* ------------------------------------------------------------------ */
/* Jam — escuta em conjunto                                            */
/* ------------------------------------------------------------------ */

/**
 * Uma sessão de escuta compartilhada.
 *
 * O host é o relógio: ele guarda no servidor em que faixa está e em que
 * segundo ela estava num instante conhecido (`positionAt`). Os convidados
 * não recebem "o tempo agora" — recebem esse par, e calculam o resto
 * localmente. É o que faz a sincronia sobreviver à latência do polling:
 * um pacote que chega 400ms atrasado ainda descreve corretamente onde a
 * música está, porque diz de quando ele fala.
 */
export type Jam = {
  id: string;
  /** Código curto e legível para entrar pelo link. */
  code: string;
  hostId: string;
  name: string;
  /** Faixas na ordem em que serão tocadas. */
  queue: string[];
  /** Posição atual dentro de `queue`; -1 quando nada foi tocado ainda. */
  index: number;
  /** Segundo da faixa no instante `positionAt`. */
  position: number;
  /** Instante (ms epoch) em que `position` foi medida no host. */
  positionAt: number;
  playing: boolean;
  /** Encerrado pelo host: ninguém mais entra, e quem está dentro sai. */
  endedAt: string | null;
  createdAt: string;
};

/** Quem está dentro de um jam, e desde quando foi visto. */
export type JamMember = {
  jamId: string;
  userId: string;
  joinedAt: string;
  /** Último ping — sustenta o indicador de "ouvindo agora". */
  lastSeenAt: string;
};

/** Um participante já com o perfil resolvido, como a UI mostra. */
export type JamParticipant = PublicUser & {
  isHost: boolean;
  /** `true` enquanto o ping é recente; `false` para quem sumiu. */
  online: boolean;
  joinedAt: string;
};

/**
 * O estado completo de um jam para o cliente: o relógio do host, quem
 * está na sala e a fila já hidratada.
 */
export type JamSnapshot = {
  id: string;
  code: string;
  name: string;
  hostId: string;
  /** Quem está pedindo o snapshot é o host? Decide o que a UI libera. */
  isHost: boolean;
  index: number;
  position: number;
  positionAt: number;
  playing: boolean;
  ended: boolean;
  queue: HydratedTrack[];
  participants: JamParticipant[];
  /** Muda a cada alteração de fila/faixa — o cliente só reage ao novo. */
  revision: string;
};

/** Convite de jam enviado a um amigo. */
export type JamInvite = {
  id: string;
  jamId: string;
  fromId: string;
  toId: string;
  createdAt: string;
};

/** Convite pendente com jam e remetente resolvidos, para o sino. */
export type HydratedJamInvite = {
  id: string;
  jamId: string;
  code: string;
  jamName: string;
  from: PublicUser;
  createdAt: string;
};

export type Database = {
  users: User[];
  artists: Artist[];
  albums: Album[];
  tracks: Track[];
  playlists: Playlist[];
  spotlight: Spotlight;
  /** Faixas curtidas, por id de usuário. */
  liked: Record<string, string[]>;
  /** Artistas seguidos, por id de usuário. */
  following: Record<string, string[]>;
  /** Amizades e pedidos, uma entrada por par de pessoas. */
  friendships: Friendship[];
  /** Jams abertos e encerrados recentemente. */
  jams: Jam[];
  /** Quem está em cada jam. */
  jamMembers: JamMember[];
  /** Convites de jam ainda não respondidos. */
  jamInvites: JamInvite[];
};

export const EMPTY_DB: Database = {
  users: [],
  artists: [],
  albums: [],
  tracks: [],
  playlists: [],
  spotlight: {
    trackId: null,
    eyebrow: "Lançamento",
    blurb: "",
    quote: "Às vezes, as melhores músicas voltam pra gente.",
  },
  liked: {},
  following: {},
  friendships: [],
  jams: [],
  jamMembers: [],
  jamInvites: [],
};

/** Faixa com artista e álbum resolvidos — o que a UI consome. */
export type HydratedTrack = Track & {
  artist: Artist | null;
  album: Album | null;
  liked: boolean;
};
