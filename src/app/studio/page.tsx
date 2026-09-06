import Link from "next/link";
import { readDb, recentTracks } from "@/lib/db";
import { Card, StudioHeader } from "@/components/studio/Form";
import { StreamsChart } from "@/components/studio/StreamsChart";
import { Cover } from "@/components/Cover";
import { formatNumber, formatTime } from "@/lib/utils";
import * as I from "@/components/Icons";

/** Agrupa as reproduções por dia nos últimos 30 dias. */
function streamsByDay(playLogs: string[][]) {
  const days: { day: string; plays: number }[] = [];
  const counts = new Map<string, number>();

  for (const log of playLogs) {
    for (const iso of log) {
      const key = iso.slice(0, 10);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({
      day: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      plays: counts.get(key) ?? 0,
    });
  }
  return days;
}

function Stat({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-surface/60 p-5">
      <div className="mb-3 grid h-9 w-9 place-items-center rounded-lg bg-surface-2 text-ink-2">
        {icon}
      </div>
      <p className="text-2xl font-bold tabular-nums text-ink">{value}</p>
      <p className="mt-0.5 text-sm text-ink-2">{label}</p>
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

export default async function StudioOverview() {
  const db = await readDb();
  const tracks = recentTracks(db);

  const totalPlays = db.tracks.reduce((s, t) => s + t.plays, 0);
  const totalDuration = db.tracks.reduce((s, t) => s + t.duration, 0);
  const chart = streamsByDay(db.tracks.map((t) => t.playLog));

  const topTracks = [...tracks].sort((a, b) => b.plays - a.plays).slice(0, 5);

  const topArtists = [...db.artists]
    .map((a) => ({
      artist: a,
      plays: db.tracks
        .filter((t) => t.artistId === a.id)
        .reduce((s, t) => s + t.plays, 0),
    }))
    .sort((x, y) => y.plays - x.plays)
    .slice(0, 5);

  return (
    <>
      <StudioHeader
        title="Visão geral"
        description="Como o catálogo do Sona está performando."
        action={
          <Link
            href="/studio/upload"
            className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink transition-all hover:scale-[1.02] hover:bg-accent-hover"
          >
            <I.Upload className="h-4 w-4" />
            Publicar faixa
          </Link>
        }
      />

      {db.tracks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-hairline bg-surface/30 px-6 py-16 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-surface-2 text-ink-2">
            <I.Upload className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold text-ink">
            Comece publicando uma faixa
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-2">
            Assim que a primeira música entrar no catálogo, as métricas de
            reprodução aparecem aqui.
          </p>
          <Link
            href="/studio/upload"
            className="mt-6 inline-flex items-center rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-accent-ink transition-all hover:scale-[1.03] hover:bg-accent-hover"
          >
            Publicar primeira faixa
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Reproduções totais"
              value={formatNumber(totalPlays)}
              icon={<I.Play className="h-[18px] w-[18px]" />}
            />
            <Stat
              label="Faixas publicadas"
              value={formatNumber(db.tracks.length)}
              icon={<I.Music className="h-[18px] w-[18px]" />}
            />
            <Stat
              label="Artistas no catálogo"
              value={formatNumber(db.artists.length)}
              icon={<I.User className="h-[18px] w-[18px]" />}
            />
            <Stat
              label="Duração do acervo"
              value={formatTime(totalDuration)}
              icon={<I.Clock className="h-[18px] w-[18px]" />}
              hint={`${db.playlists.length} playlist(s)`}
            />
          </div>

          <Card
            title="Streams nos últimos 30 dias"
            description="Cada reprodução conta após 5 segundos de escuta."
          >
            <StreamsChart data={chart} />
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Faixas mais tocadas">
              {topTracks.every((t) => t.plays === 0) ? (
                <p className="text-sm text-ink-3">
                  Nenhuma reprodução registrada ainda.
                </p>
              ) : (
                <ol className="space-y-1">
                  {topTracks.map((t, i) => (
                    <li
                      key={t.id}
                      className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2"
                    >
                      <span className="w-4 text-sm tabular-nums text-ink-3">
                        {i + 1}
                      </span>
                      <Cover
                        src={t.cover}
                        seed={t.id}
                        name={t.title}
                        className="h-10 w-10"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink">
                          {t.title}
                        </span>
                        <span className="block truncate text-xs text-ink-2">
                          {t.artist?.name}
                        </span>
                      </span>
                      <span className="text-sm tabular-nums text-ink-2">
                        {formatNumber(t.plays)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>

            <Card title="Artistas mais ouvidos">
              <ol className="space-y-1">
                {topArtists.map(({ artist, plays }, i) => (
                  <li
                    key={artist.id}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2"
                  >
                    <span className="w-4 text-sm tabular-nums text-ink-3">
                      {i + 1}
                    </span>
                    <Cover
                      src={artist.image}
                      seed={artist.id}
                      name={artist.name}
                      rounded="rounded-full"
                      className="h-10 w-10"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">
                      {artist.name}
                    </span>
                    <span className="text-sm tabular-nums text-ink-2">
                      {formatNumber(plays)}
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
