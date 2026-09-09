import Link from "next/link";
import { readDb } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { CardGrid, Section } from "@/components/client/Section";
import { CreatePlaylistButton } from "@/components/client/CreatePlaylist";
import { MosaicCover } from "@/components/Cover";
import type { Playlist } from "@/lib/types";

function PlaylistCard({
  playlist,
  covers,
}: {
  playlist: Playlist;
  covers: Array<string | null>;
}) {
  return (
    <Link href={`/playlist/${playlist.id}`} className="group">
      <MosaicCover
        covers={playlist.cover ? [playlist.cover] : covers}
        seed={playlist.id}
        name={playlist.title}
        className="aspect-square w-full transition-transform duration-300 group-hover:scale-[1.02]"
      />
      <h3 className="mt-3 truncate text-sm font-medium text-ink">
        {playlist.title}
      </h3>
      <p className="mt-0.5 truncate text-xs text-ink-2">
        {playlist.trackIds.length} faixa(s)
        {playlist.visibility === "private" && " • Privada"}
      </p>
    </Link>
  );
}

export default async function PlaylistsPage() {
  const user = await currentUser();
  const db = await readDb();

  const byTitle = (a: Playlist, b: Playlist) =>
    a.title.localeCompare(b.title, "pt-BR");
  const mine = db.playlists
    .filter((p) => user && p.ownerId === user.id)
    .sort(byTitle);
  const editorial = db.playlists.filter((p) => !p.ownerId).sort(byTitle);

  // As capas do mosaico vêm das faixas da playlist, na ordem em que estão.
  const coversOf = (p: Playlist) =>
    p.trackIds
      .map((tid) => db.tracks.find((t) => t.id === tid)?.cover ?? null)
      .filter((c): c is string => Boolean(c));

  return (
    <div className="animate-rise px-6 pb-12 pt-2 md:px-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-ink">
          Playlists
        </h1>
        <CreatePlaylistButton />
      </header>

      {mine.length === 0 ? (
        <div className="rounded-xl border border-dashed border-hairline px-6 py-10 text-center">
          <p className="text-sm text-ink-2">
            Você ainda não tem playlists.
          </p>
          <p className="mt-1 text-xs text-ink-3">
            Crie uma acima, ou use o “+” em qualquer faixa para montar uma na
            hora.
          </p>
        </div>
      ) : (
        <CardGrid>
          {mine.map((pl) => (
            <PlaylistCard key={pl.id} playlist={pl} covers={coversOf(pl)} />
          ))}
        </CardGrid>
      )}

      {editorial.length > 0 && (
        <Section title="Playlists do Sona">
          <CardGrid>
            {editorial.map((pl) => (
              <PlaylistCard key={pl.id} playlist={pl} covers={coversOf(pl)} />
            ))}
          </CardGrid>
        </Section>
      )}
    </div>
  );
}
