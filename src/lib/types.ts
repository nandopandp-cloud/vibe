/** Modelo de domínio do Sona. */

export type Artist = {
  id: string;
  name: string;
  /** Caminho público da foto, ex. /uploads/covers/abc.jpg */
  image: string | null;
  bio: string;
  monthlyListeners: number;
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
  createdAt: string;
};

export type Spotlight = {
  /** Faixa em destaque no banner da home. */
  trackId: string | null;
  eyebrow: string;
  blurb: string;
  quote: string;
};

export type Database = {
  artists: Artist[];
  albums: Album[];
  tracks: Track[];
  playlists: Playlist[];
  spotlight: Spotlight;
  /** Faixas curtidas pelo ouvinte (demo de usuário único). */
  liked: string[];
};

export const EMPTY_DB: Database = {
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
  liked: [],
};

/** Faixa com artista e álbum resolvidos — o que a UI consome. */
export type HydratedTrack = Track & {
  artist: Artist | null;
  album: Album | null;
  liked: boolean;
};
