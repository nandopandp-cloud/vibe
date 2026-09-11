import type { SVGProps } from "react";

/**
 * Ícones de traço, 24x24, espessura 1.8 — o peso usado nas referências.
 * `filled` marca os que são sólidos por natureza (play, pause).
 */
type P = SVGProps<SVGSVGElement>;

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function Svg({ children, ...p }: P & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden {...p}>
      {children}
    </svg>
  );
}

export const Home = (p: P) => (
  <Svg {...p}>
    <path {...stroke} d="M3.5 10.5 12 3.5l8.5 7v9a1 1 0 0 1-1 1h-4v-6h-7v6h-4a1 1 0 0 1-1-1z" />
  </Svg>
);

export const HomeFilled = (p: P) => (
  <Svg {...p}>
    <path fill="currentColor" d="M3.5 10.5 12 3.5l8.5 7v9a1 1 0 0 1-1 1h-5v-6h-5v6h-5a1 1 0 0 1-1-1z" />
  </Svg>
);

export const Search = (p: P) => (
  <Svg {...p}>
    <circle {...stroke} cx="11" cy="11" r="6.5" />
    <path {...stroke} d="m16 16 4 4" />
  </Svg>
);

/** Barras verticais da "Biblioteca" — como no ícone das referências. */
export const Library = (p: P) => (
  <Svg {...p}>
    <path {...stroke} d="M5 4.5v15M9.5 4.5v15M14 4.5v15" />
    <path {...stroke} d="m18 5.5 3 13.5" />
  </Svg>
);

export const Heart = (p: P) => (
  <Svg {...p}>
    <path {...stroke} d="M12 20s-7.5-4.7-7.5-9.4A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7.5 2.6C19.5 15.3 12 20 12 20Z" />
  </Svg>
);

export const HeartFilled = (p: P) => (
  <Svg {...p}>
    <path fill="currentColor" d="M12 20s-7.5-4.7-7.5-9.4A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7.5 2.6C19.5 15.3 12 20 12 20Z" />
  </Svg>
);

export const Playlist = (p: P) => (
  <Svg {...p}>
    <path {...stroke} d="M4 7h10M4 12h10M4 17h6" />
    <path {...stroke} d="M17 16.5V9l3.5-1v7" />
    <circle {...stroke} cx="15.8" cy="17" r="1.8" />
  </Svg>
);

export const User = (p: P) => (
  <Svg {...p}>
    <circle {...stroke} cx="12" cy="8.5" r="3.8" />
    <path {...stroke} d="M4.8 20a7.4 7.4 0 0 1 14.4 0" />
  </Svg>
);

export const Album = (p: P) => (
  <Svg {...p}>
    <circle {...stroke} cx="12" cy="12" r="8.5" />
    <circle {...stroke} cx="12" cy="12" r="2" />
  </Svg>
);

export const Play = (p: P) => (
  <Svg {...p}>
    <path fill="currentColor" d="M7.5 4.8 19 12 7.5 19.2z" />
  </Svg>
);

export const Pause = (p: P) => (
  <Svg {...p}>
    <path fill="currentColor" d="M7 4.5h3.4v15H7zm6.6 0H17v15h-3.4z" />
  </Svg>
);

export const Next = (p: P) => (
  <Svg {...p}>
    <path fill="currentColor" d="M6 5.2 15 12 6 18.8z" />
    <path fill="currentColor" d="M16.4 5h2.2v14h-2.2z" />
  </Svg>
);

export const Prev = (p: P) => (
  <Svg {...p}>
    <path fill="currentColor" d="M18 5.2 9 12l9 6.8z" />
    <path fill="currentColor" d="M5.4 5h2.2v14H5.4z" />
  </Svg>
);

export const Shuffle = (p: P) => (
  <Svg {...p}>
    <path {...stroke} d="M3.5 6.5h3.2c1.4 0 2.4.7 3.3 1.9l4 5.4c.9 1.2 1.9 1.7 3.3 1.7h3.2M3.5 17.5h3.2c1.4 0 2.4-.6 3.3-1.8M16.6 8.2c.9-1.1 1.9-1.7 3.2-1.7h.7" />
    <path {...stroke} d="m18.4 4.3 2.2 2.2-2.2 2.2M18.4 13.3l2.2 2.2-2.2 2.2" />
  </Svg>
);

export const Repeat = (p: P) => (
  <Svg {...p}>
    <path {...stroke} d="M7 7h10a3.5 3.5 0 0 1 3.5 3.5v1M17 17H7a3.5 3.5 0 0 1-3.5-3.5v-1" />
    <path {...stroke} d="m5.6 9.4-2-2 2-2M18.4 14.6l2 2-2 2" />
  </Svg>
);

export const Volume = (p: P) => (
  <Svg {...p}>
    <path {...stroke} d="M4 9.5h3L11 6v12l-4-3.5H4z" />
    <path {...stroke} d="M14.5 9.5a3.6 3.6 0 0 1 0 5M17 7a7 7 0 0 1 0 10" />
  </Svg>
);

export const VolumeMute = (p: P) => (
  <Svg {...p}>
    <path {...stroke} d="M4 9.5h3L11 6v12l-4-3.5H4z" />
    <path {...stroke} d="m15 9.5 5 5M20 9.5l-5 5" />
  </Svg>
);

export const Queue = (p: P) => (
  <Svg {...p}>
    <path {...stroke} d="M4 7h10M4 12h10M4 17h16" />
    <path {...stroke} d="M17 6.5V13l3-1V5.5z" />
  </Svg>
);

export const Devices = (p: P) => (
  <Svg {...p}>
    <rect {...stroke} x="3" y="5" width="12" height="9" rx="1.5" />
    <rect {...stroke} x="16" y="9.5" width="5" height="9.5" rx="1.5" />
    <path {...stroke} d="M7 18h5" />
  </Svg>
);

export const Expand = (p: P) => (
  <Svg {...p}>
    <path {...stroke} d="M9.5 4.5h-5v5M14.5 19.5h5v-5M4.5 14.5v5h5M19.5 9.5v-5h-5" />
  </Svg>
);

export const Bell = (p: P) => (
  <Svg {...p}>
    <path {...stroke} d="M18 16V11a6 6 0 0 0-12 0v5l-1.5 2.5h15z" />
    <path {...stroke} d="M10 19.5a2 2 0 0 0 4 0" />
  </Svg>
);

export const Dots = (p: P) => (
  <Svg {...p}>
    <circle fill="currentColor" cx="5.5" cy="12" r="1.6" />
    <circle fill="currentColor" cx="12" cy="12" r="1.6" />
    <circle fill="currentColor" cx="18.5" cy="12" r="1.6" />
  </Svg>
);

export const ChevronLeft = (p: P) => (
  <Svg {...p}>
    <path {...stroke} d="m14.5 5.5-7 6.5 7 6.5" />
  </Svg>
);

export const ChevronRight = (p: P) => (
  <Svg {...p}>
    <path {...stroke} d="m9.5 5.5 7 6.5-7 6.5" />
  </Svg>
);

export const ChevronDown = (p: P) => (
  <Svg {...p}>
    <path {...stroke} d="m5.5 9.5 6.5 7 6.5-7" />
  </Svg>
);

export const Plus = (p: P) => (
  <Svg {...p}>
    <path {...stroke} d="M12 5v14M5 12h14" />
  </Svg>
);

export const Grip = (p: P) => (
  <Svg {...p}>
    <path {...stroke} d="M4 8h16M4 12h16M4 16h16" />
  </Svg>
);

export const Upload = (p: P) => (
  <Svg {...p}>
    <path {...stroke} d="M12 16V4.5M8 8l4-3.5L16 8" />
    <path {...stroke} d="M4.5 15v3.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V15" />
  </Svg>
);

export const Chart = (p: P) => (
  <Svg {...p}>
    <path {...stroke} d="M4 19.5V13M9.3 19.5V7M14.7 19.5v-8M20 19.5V4.5" />
  </Svg>
);

export const Mic = (p: P) => (
  <Svg {...p}>
    <rect {...stroke} x="9" y="3" width="6" height="11" rx="3" />
    <path {...stroke} d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
  </Svg>
);

export const Trash = (p: P) => (
  <Svg {...p}>
    <path {...stroke} d="M4.5 6.5h15M9 6.5V4.8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.7" />
    <path {...stroke} d="M6.5 6.5 7.4 19a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9l.9-12.5" />
  </Svg>
);

export const Edit = (p: P) => (
  <Svg {...p}>
    <path {...stroke} d="M4.5 19.5h3l10-10a2.1 2.1 0 0 0-3-3l-10 10z" />
    <path {...stroke} d="m13.5 6.5 3 3" />
  </Svg>
);

export const Check = (p: P) => (
  <Svg {...p}>
    <path {...stroke} d="m5 12.5 4.5 4.5L19 7" />
  </Svg>
);

export const X = (p: P) => (
  <Svg {...p}>
    <path {...stroke} d="m6 6 12 12M18 6 6 18" />
  </Svg>
);

export const Settings = (p: P) => (
  <Svg {...p}>
    <circle {...stroke} cx="12" cy="12" r="3" />
    <path {...stroke} d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" />
  </Svg>
);

export const Sparkle = (p: P) => (
  <Svg {...p}>
    <path {...stroke} d="M12 3.5 13.9 9l5.6 1.9-5.6 2L12 18.5l-1.9-5.6L4.5 11 10.1 9z" />
  </Svg>
);

export const Clock = (p: P) => (
  <Svg {...p}>
    <circle {...stroke} cx="12" cy="12" r="8.5" />
    <path {...stroke} d="M12 7v5.2l3.3 2" />
  </Svg>
);

export const Music = (p: P) => (
  <Svg {...p}>
    <path {...stroke} d="M9 18V6.5l10-2V16" />
    <circle {...stroke} cx="6.6" cy="18" r="2.6" />
    <circle {...stroke} cx="16.6" cy="16" r="2.6" />
  </Svg>
);

export const ArrowLeft = (p: P) => (
  <Svg {...p}>
    <path {...stroke} d="M19 12H5M10.5 6.5 5 12l5.5 5.5" />
  </Svg>
);


export const Users = (p: P) => (
  <Svg {...p}>
    <circle {...stroke} cx="9.5" cy="8.5" r="3.4" />
    <path {...stroke} d="M3.5 19.5a6.2 6.2 0 0 1 12 0" />
    <path {...stroke} d="M16 5.6a3.4 3.4 0 0 1 0 6.6M17.5 14.4a6.2 6.2 0 0 1 3 5.1" />
  </Svg>
);

export const Globe = (p: P) => (
  <Svg {...p}>
    <circle {...stroke} cx="12" cy="12" r="8.5" />
    <path {...stroke} d="M3.5 12h17M12 3.5c4.5 5 4.5 12 0 17-4.5-5-4.5-12 0-17Z" />
  </Svg>
);

export const Mail = (p: P) => (
  <Svg {...p}>
    <rect {...stroke} x="3" y="5.5" width="18" height="13" rx="2" />
    <path {...stroke} d="m3.8 7 8.2 6 8.2-6" />
  </Svg>
);

export const Lock = (p: P) => (
  <Svg {...p}>
    <rect {...stroke} x="4.5" y="10.5" width="15" height="9.5" rx="2" />
    <path {...stroke} d="M8 10.5v-2a4 4 0 0 1 8 0v2" />
  </Svg>
);

export const Eye = (p: P) => (
  <Svg {...p}>
    <path {...stroke} d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z" />
    <circle {...stroke} cx="12" cy="12" r="2.8" />
  </Svg>
);

export const EyeOff = (p: P) => (
  <Svg {...p}>
    <path {...stroke} d="M9.9 5.1A9.6 9.6 0 0 1 12 4.9c6 0 9.5 5.5 9.5 5.5a17 17 0 0 1-2.7 3.2M6.4 6.7A16.6 16.6 0 0 0 2.5 10.4S6 15.9 12 15.9c1 0 1.9-.15 2.7-.4" />
    <path {...stroke} d="m4 4 16 16" />
  </Svg>
);

export const ArrowRight = (p: P) => (
  <Svg {...p}>
    <path {...stroke} d="M5 12h14M13.5 6.5 19 12l-5.5 5.5" />
  </Svg>
);

export const Shield = (p: P) => (
  <Svg {...p}>
    <path {...stroke} d="M12 3.5 5 6v6c0 4.2 3 7.4 7 8.5 4-1.1 7-4.3 7-8.5V6z" />
  </Svg>
);

export const Logout = (p: P) => (
  <Svg {...p}>
    <path {...stroke} d="M15 4.5h3.5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H15" />
    <path {...stroke} d="M11 8.5 14.5 12 11 15.5M14.5 12H4.5" />
  </Svg>
);

/** Barrinhas animadas do estado "tocando agora". */
export function EqualizerBars({ className }: { className?: string }) {
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "flex-end", gap: 2, height: 14 }}
      aria-label="Tocando agora"
    >
      {[0, 0.25, 0.5, 0.15].map((delay, i) => (
        <span
          key={i}
          style={{
            width: 3,
            height: "100%",
            borderRadius: 2,
            background: "currentColor",
            transformOrigin: "bottom",
            animation: `sona-bar 0.9s ${delay}s ease-in-out infinite`,
          }}
        />
      ))}
    </span>
  );
}

/** Convidar alguém — a silhueta com um "+" ao lado. */
export const UserPlus = (p: P) => (
  <Svg {...p}>
    <circle {...stroke} cx="10" cy="8.5" r="3.6" />
    <path {...stroke} d="M3.8 19.5a6.4 6.4 0 0 1 12.4 0" />
    <path {...stroke} d="M18.5 7.5v5M21 10h-5" />
  </Svg>
);

/** Amizade desfeita ou pedido recusado. */
export const UserMinus = (p: P) => (
  <Svg {...p}>
    <circle {...stroke} cx="10" cy="8.5" r="3.6" />
    <path {...stroke} d="M3.8 19.5a6.4 6.4 0 0 1 12.4 0" />
    <path {...stroke} d="M21 10h-5" />
  </Svg>
);

/**
 * Jam: ondas saindo de um ponto, como um som que se espalha entre
 * pessoas. É o ícone da escuta em conjunto em toda a interface.
 */
export const Jam = (p: P) => (
  <Svg {...p}>
    <circle {...stroke} cx="12" cy="12" r="2.2" />
    <path {...stroke} d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 15.8a5.4 5.4 0 0 0 0-7.6" />
    <path {...stroke} d="M5.5 5.5a9.2 9.2 0 0 0 0 13M18.5 18.5a9.2 9.2 0 0 0 0-13" />
  </Svg>
);

/** Copiar o link do jam. */
export const Link = (p: P) => (
  <Svg {...p}>
    <path {...stroke} d="M10.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.4 1.4" />
    <path {...stroke} d="M13.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1.4-1.4" />
  </Svg>
);
