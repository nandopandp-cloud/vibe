import { redirect } from "next/navigation";
import { playlistCovers, readDb } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { PlayerProvider } from "@/components/client/PlayerProvider";
import { MyPlaylistsProvider } from "@/components/client/AddToPlaylist";
import { JamProvider } from "@/components/client/JamProvider";
import { PresenceProvider } from "@/components/client/PresenceProvider";
import { Shell } from "@/components/client/Shell";
import { readFriends } from "@/lib/friends-actions";
import { readMyJam, readMyJamInvites } from "@/lib/jam-actions";
import { readFriendsActivity } from "@/lib/presence-actions";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  // O middleware já barra quem não tem cookie; isto cobre o cookie
  // adulterado ou de um usuário que não existe mais.
  if (!user) redirect("/entrar");

  // As leituras são independentes entre si e todas já passam pelo
  // `readDb` memoizado — em paralelo elas custam o mesmo que a mais lenta.
  const [{ friends, incoming }, jamInvites, jam, activity] = await Promise.all([
    readFriends(),
    readMyJamInvites(),
    readMyJam(),
    readFriendsActivity(),
  ]);

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
        <PresenceProvider initial={activity}>
          <JamProvider initialJam={jam}>
            <Shell
              playlists={editorial}
              myPlaylists={mine}
              user={user}
              friends={friends}
              jamInvites={jamInvites}
              friendRequests={incoming}
            >
              {children}
            </Shell>
          </JamProvider>
        </PresenceProvider>
      </MyPlaylistsProvider>
    </PlayerProvider>
  );
}
