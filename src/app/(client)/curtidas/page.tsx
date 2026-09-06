import { hydrateAll, readDb } from "@/lib/db";
import { TrackList } from "@/components/client/TrackList";
import { PlayAllButton } from "@/components/client/TrackCard";
import { EmptyState, PageHeader } from "@/components/client/Section";
import { formatTime } from "@/lib/utils";
import * as I from "@/components/Icons";

export default async function LikedPage() {
  const db = await readDb();
  // Mantém a ordem em que foram curtidas.
  const tracks = hydrateAll(
    db,
    db.liked
      .map((id) => db.tracks.find((t) => t.id === id))
      .filter((t): t is NonNullable<typeof t> => Boolean(t)),
  );

  const total = tracks.reduce((s, t) => s + t.duration, 0);

  return (
    <div className="animate-rise px-6 pb-12 pt-2 md:px-8">
      <PageHeader
        eyebrow="Playlist"
        title="Músicas Curtidas"
        meta={
          tracks.length > 0 && (
            <>
              {tracks.length} faixa(s) • {formatTime(total)}
            </>
          )
        }
        cover={
          <div className="grid aspect-square w-full max-w-[220px] place-items-center rounded-xl bg-gradient-to-br from-rose to-dusk shadow-2xl shadow-black/40">
            <I.HeartFilled className="h-1/3 w-1/3 text-white" />
          </div>
        }
      >
        <PlayAllButton tracks={tracks} />
      </PageHeader>

      <div className="mt-8">
        {tracks.length === 0 ? (
          <EmptyState
            icon={<I.Heart className="h-6 w-6" />}
            title="Você ainda não curtiu nenhuma música"
            description="Toque no coração ao lado de qualquer faixa para guardá-la aqui."
            action={{ href: "/biblioteca", label: "Explorar o catálogo" }}
          />
        ) : (
          <TrackList tracks={tracks} />
        )}
      </div>
    </div>
  );
}
