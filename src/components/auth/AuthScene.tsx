/**
 * Cena do painel de acesso: alguém de costas, com fones, diante da cidade
 * ao pôr do sol — a imagem da referência, desenhada em SVG para não
 * depender de uma foto licenciada.
 */
export function AuthScene({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 800 1000"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden
    >
      <defs>
        {/* céu: azul da noite descendo até o laranja do horizonte */}
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0b1a2b" />
          <stop offset="34%" stopColor="#1d2c42" />
          <stop offset="56%" stopColor="#4a3550" />
          <stop offset="72%" stopColor="#9c4f36" />
          <stop offset="84%" stopColor="#e08a3c" />
          <stop offset="100%" stopColor="#f6b45e" />
        </linearGradient>

        <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff4d6" stopOpacity="0.95" />
          <stop offset="35%" stopColor="#ffce7a" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ff9a3c" stopOpacity="0" />
        </radialGradient>

        {/* escurece a base para o texto ter contraste */}
        <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#05070c" stopOpacity="0" />
          <stop offset="45%" stopColor="#05070c" stopOpacity="0.35" />
          <stop offset="75%" stopColor="#05070c" stopOpacity="0.72" />
          <stop offset="100%" stopColor="#05070c" stopOpacity="1" />
        </linearGradient>

        <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffb066" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#ffb066" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="800" height="1000" fill="url(#sky)" />

      {/* sol e seu halo */}
      <circle cx="250" cy="622" r="190" fill="url(#sunGlow)" />
      <circle cx="250" cy="622" r="26" fill="#fff6e2" />

      {/* montanhas distantes */}
      <path
        d="M0 612 L110 556 L196 604 L286 548 L392 610 L470 566 L560 614 L680 560 L800 606 L800 700 L0 700 Z"
        fill="#2b2438"
        opacity="0.55"
      />

      {/* skyline distante */}
      <g fill="#14161f" opacity="0.85">
        <rect x="20" y="596" width="46" height="140" />
        <rect x="78" y="628" width="34" height="108" />
        <rect x="124" y="580" width="52" height="156" />
        <rect x="330" y="606" width="40" height="130" />
        <rect x="382" y="572" width="58" height="164" />
        <rect x="452" y="616" width="36" height="120" />
        <rect x="612" y="588" width="50" height="148" />
        <rect x="674" y="620" width="40" height="116" />
        <rect x="726" y="566" width="56" height="170" />
      </g>

      {/* skyline próximo, mais escuro */}
      <g fill="#080a11">
        <rect x="0" y="666" width="70" height="180" />
        <rect x="84" y="700" width="54" height="146" />
        <rect x="152" y="648" width="76" height="198" />
        <rect x="244" y="694" width="48" height="152" />
        <rect x="306" y="662" width="66" height="184" />
        <rect x="560" y="676" width="60" height="170" />
        <rect x="634" y="640" width="80" height="206" />
        <rect x="728" y="688" width="72" height="158" />
      </g>

      {/* janelas acesas */}
      <g fill="#ffb15e" opacity="0.75">
        {[
          [16, 690], [40, 726], [16, 762], [96, 730], [120, 766],
          [166, 684], [192, 720], [166, 756], [206, 792], [258, 726],
          [282, 762], [320, 700], [346, 736], [320, 772],
          [574, 706], [598, 742], [650, 676], [676, 712], [650, 748],
          [692, 784], [742, 720], [766, 756],
        ].map(([x, y], i) => (
          <rect key={i} x={x} y={y} width="7" height="10" rx="1" />
        ))}
      </g>

      {/* névoa quente sobre a cidade */}
      <rect x="0" y="620" width="800" height="240" fill="url(#haze)" />

      {/*
        Silhueta de quem ouve: ombros largos à direita, cabeça com cabelo
        volumoso e o arco do fone passando por cima.
      */}
      <g transform="translate(628 812) scale(0.62) translate(-596 -812)">
        <g fill="#04060b">
          {/* tronco e ombros */}
          <path d="M470 1000 C470 858 512 806 592 792 C672 806 726 858 726 1000 Z" />
          {/* pescoço */}
          <path d="M566 812 h60 v-52 h-60 z" />
          {/* cabeça */}
          <ellipse cx="596" cy="700" rx="72" ry="84" />
          {/* cabelo volumoso, como na referência */}
          <path d="M524 690 c-6 -74 34 -122 74 -124 c44 -2 82 44 76 118 c-10 -30 -26 -48 -44 -56 c6 18 2 30 -6 38 c-8 -26 -26 -42 -50 -44 c-22 -2 -40 12 -50 68 z" />
        </g>
        {/* fone de ouvido */}
        <path
          d="M528 690 a70 70 0 0 1 140 0"
          fill="none"
          stroke="#04060b"
          strokeWidth="15"
          strokeLinecap="round"
        />
        <rect x="512" y="686" width="28" height="54" rx="13" fill="#04060b" />
        <rect x="656" y="686" width="28" height="54" rx="13" fill="#04060b" />
      </g>

      {/* base escura para o texto */}
      <rect x="0" y="560" width="800" height="440" fill="url(#floor)" />
    </svg>
  );
}
