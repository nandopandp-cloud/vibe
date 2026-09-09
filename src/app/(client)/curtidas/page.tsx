import { likedTracks, readDb } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { TrackList } from "@/components/client/TrackList";
import { PlayAllButton, ShuffleButton } from "@/components/client/TrackCard";
import { EmptyState, PageHeader } from "@/components/client/Section";
import { formatTime } from "@/lib/utils";
import * as I from "@/components/Icons";

export default async function LikedPage() {
  const user = await currentUser();
  const db = await readDb();
  const tracks = likedTracks(db, user?.id);

  const total = tracks.reduce((s, t) => s + t.duration, 0);

  return (
    <div className="animate-rise px-6 pb-12 pt-2 md:px-8">
      <PageHeader
        eyebrow="Playlist"
        title="Músicas Curtidas"
        meta={
          tracks.length > 0 && (
            <>
              {user?.name} • {tracks.length} faixa(s) • {formatTime(total)}
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
        <ShuffleButton tracks={tracks} />
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
