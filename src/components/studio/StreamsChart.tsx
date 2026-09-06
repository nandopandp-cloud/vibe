import { formatNumber } from "@/lib/utils";

/**
 * Área de streams por dia nos últimos 30 dias.
 * SVG inline com viewBox e preserveAspectRatio="none" para escalar
 * na largura do card sem biblioteca de gráficos.
 */
export function StreamsChart({ data }: { data: { day: string; plays: number }[] }) {
  const W = 600;
  const H = 160;
  const PAD = 4;

  const max = Math.max(1, ...data.map((d) => d.plays));
  const step = data.length > 1 ? (W - PAD * 2) / (data.length - 1) : 0;
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  const x = (i: number) => PAD + i * step;

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.plays)}`).join(" ");
  const area = `${line} L${x(data.length - 1)},${H} L${x(0)},${H} Z`;

  const total = data.reduce((s, d) => s + d.plays, 0);

  if (total === 0) {
    return (
      <div className="flex h-[160px] items-center justify-center rounded-lg border border-dashed border-hairline text-sm text-ink-3">
        Sem reproduções nos últimos 30 dias.
      </div>
    );
  }

  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-[160px] w-full"
        role="img"
        aria-label={`Streams por dia nos últimos 30 dias, total de ${formatNumber(total)}`}
      >
        <defs>
          <linearGradient id="streamFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1dd760" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#1dd760" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* linhas de grade */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={0}
            x2={W}
            y1={H * f}
            y2={H * f}
            stroke="#2a2a30"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <path d={area} fill="url(#streamFill)" />
        <path
          d={line}
          fill="none"
          stroke="#1dd760"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <figcaption className="mt-2 flex justify-between text-xs text-ink-3">
        <span>{data[0]?.day}</span>
        <span>{data.at(-1)?.day}</span>
      </figcaption>
    </figure>
  );
}
