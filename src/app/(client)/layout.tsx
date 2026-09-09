import { redirect } from "next/navigation";
import { playlistCovers, readDb } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { PlayerProvider } from "@/components/client/PlayerProvider";
import { MyPlaylistsProvider } from "@/components/client/AddToPlaylist";
import { Shell } from "@/components/client/Shell";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  // O middleware já barra quem não tem cookie; isto cobre o cookie
  // adulterado ou de um usuário que não existe mais.
  if (!user) redirect("/entrar");

  const db = await readDb();
  const byTitle = (a: { title: string }, b: typeof a) =>
    a.title.localeCompare(b.title, "pt-BR");

  // A capa da sidebar é o mesmo mosaico das outras telas, então cada
  // playlist leva junto as capas das suas faixas.
  const withCovers = (p: (typeof db.playlists)[number]) => ({
    ...p,
    trackCovers: playlistCovers(db, p.trackIds),
  });

  // A sidebar mostra as duas famílias: as da casa e as do próprio ouvinte.
  const editorial = db.playlists
    .filter((p) => !p.ownerId)
    .sort(byTitle)
    .map(withCovers);
  const mine = db.playlists
    .filter((p) => p.ownerId === user.id)
    .sort(byTitle)
    .map(withCovers);

  return (
    <PlayerProvider initialLiked={db.liked[user.id] ?? []}>
      <MyPlaylistsProvider
        playlists={mine.map((p) => ({
          id: p.id,
          title: p.title,
          trackIds: p.trackIds,
        }))}
      >
        <Shell playlists={editorial} myPlaylists={mine} user={user}>
          {children}
        </Shell>
      </MyPlaylistsProvider>
    </PlayerProvider>
  );
}
