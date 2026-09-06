import { readDb, recentTracks } from "@/lib/db";
import { StudioHeader } from "@/components/studio/Form";
import { PlaylistManager } from "@/components/studio/PlaylistManager";

export default async function StudioPlaylistsPage() {
  const db = await readDb();
  const tracks = recentTracks(db);
  const playlists = [...db.playlists].sort((a, b) =>
    a.title.localeCompare(b.title, "pt-BR"),
  );

  return (
    <>
      <StudioHeader
        title="Playlists"
        description="Monte seleções editoriais. As marcadas como editorial aparecem na home e na sidebar dos ouvintes."
      />
      <PlaylistManager playlists={playlists} tracks={tracks} />
    </>
  );
}
