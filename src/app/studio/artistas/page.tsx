import { readDb } from "@/lib/db";
import { StudioHeader } from "@/components/studio/Form";
import { ArtistManager } from "@/components/studio/ArtistManager";

export default async function StudioArtistsPage() {
  const db = await readDb();
  const artists = [...db.artists].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR"),
  );

  const trackCounts: Record<string, number> = {};
  const playCounts: Record<string, number> = {};
  for (const t of db.tracks) {
    trackCounts[t.artistId] = (trackCounts[t.artistId] ?? 0) + 1;
    playCounts[t.artistId] = (playCounts[t.artistId] ?? 0) + t.plays;
  }

  return (
    <>
      <StudioHeader
        title="Artistas"
        description="Quem assina as faixas do catálogo. A biografia e a foto aparecem na tela de reprodução do ouvinte."
      />
      <ArtistManager
        artists={artists}
        trackCounts={trackCounts}
        playCounts={playCounts}
      />
    </>
  );
}
