import { readDb } from "@/lib/db";
import { PlayerProvider } from "@/components/client/PlayerProvider";
import { Shell } from "@/components/client/Shell";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const db = await readDb();
  const playlists = [...db.playlists].sort((a, b) =>
    a.title.localeCompare(b.title, "pt-BR"),
  );

  return (
    <PlayerProvider initialLiked={db.liked}>
      <Shell playlists={playlists}>{children}</Shell>
    </PlayerProvider>
  );
}
