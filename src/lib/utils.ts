/** Helpers compartilhados entre cliente e studio. */

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** 214 -> "3:34". Usado no player e nas listas. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 125000 -> "125 mil". Formato das referências. */
export function formatListeners(n: number): string {
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v.toFixed(v < 10 ? 1 : 0).replace(".", ",")} mi`;
  }
  if (n >= 1000) return `${Math.round(n / 1000)} mil`;
  return String(n);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("pt-BR").format(n);
}

/**
 * Cor determinística a partir de um id — capas sem imagem ficam
 * coloridas de forma estável entre renders e reloads.
 */
const PALETTE = [
  ["#f0682f", "#7a1f3d"],
  ["#7b5cf0", "#241a5c"],
  ["#2f8ff0", "#0f3a63"],
  ["#f0407f", "#4a1233"],
  ["#1dd760", "#0d4527"],
  ["#f0b429", "#5c3a0d"],
  ["#20c9c9", "#0c3f43"],
] as const;

export function gradientFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const [from, to] = PALETTE[Math.abs(h) % PALETTE.length];
  return `linear-gradient(145deg, ${from}, ${to})`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Ordena e higieniza as linhas de letra vindas do editor. */
export function normalizeLyrics<T extends { time: number; text: string }>(
  lines: T[],
): T[] {
  return [...lines]
    .filter((l) => l.text.trim().length > 0)
    .sort((a, b) => a.time - b.time);
}

/** Índice da linha ativa para um dado tempo de reprodução. */
export function activeLyricIndex(
  lines: Array<{ time: number }>,
  time: number,
): number {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= time) idx = i;
    else break;
  }
  return idx;
}

/** "2:07.5" | "2:07" | "127" -> segundos. Aceita o que o curador digitar. */
export function parseTimecode(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  const mmss = /^(\d+):([0-5]?\d(?:[.,]\d+)?)$/.exec(s);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2].replace(",", "."));
  const plain = Number(s.replace(",", "."));
  return Number.isFinite(plain) && plain >= 0 ? plain : null;
}

/** Segundos -> "2:07.4", a forma que o editor de letras exibe. */
export function toTimecode(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

/**
 * Normaliza para busca: minúsculas e sem acentos, de modo que
 * "axe" encontre "Axé" e "sertanejo" encontre "Sertanejo".
 */
export function foldText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Converte letra colada em linhas com tempo.
 *
 * Linhas marcadas (`[0:12] verso`) mantêm o tempo escrito. As demais são
 * distribuídas pela duração real da faixa — antes o import chutava três
 * segundos por verso, um valor fixo que ignorava a música e fazia a letra
 * desandar já no primeiro refrão.
 *
 * A distribuição pondera o tamanho de cada verso: linha longa leva mais
 * tempo que linha curta, o que aproxima bem mais do canto do que dividir
 * o disco em fatias iguais. Continua sendo estimativa — o ajuste fino é
 * a marcação ao vivo, no editor.
 */
export function parseLyrics(
  raw: string,
  duration = 0,
): Array<{ time: number; text: string }> {
  type Entry = { time: number | null; text: string };

  const entries: Entry[] = [];
  for (const line of raw.split("\n")) {
    const text = line.trim();
    if (!text) continue;
    const tagged = /^\[?(\d+:[0-5]?\d(?:[.,]\d+)?)\]?\s*(.*)$/.exec(text);
    if (tagged && tagged[2]) {
      entries.push({ time: parseTimecode(tagged[1]), text: tagged[2] });
    } else {
      entries.push({ time: null, text });
    }
  }
  if (entries.length === 0) return [];

  // Sem duração conhecida, mantemos o passo fixo: é o melhor palpite
  // possível quando não se sabe onde a música termina.
  const untimed = entries.filter((e) => e.time === null).length;
  if (duration <= 0 || untimed === 0) {
    let fallback = 0;
    return entries.map((e) => {
      const time = e.time ?? fallback;
      fallback = time + 3;
      return { time, text: e.text };
    });
  }

  // Uma introdução instrumental é a regra, não a exceção: começar no
  // segundo zero atrasaria a letra inteira.
  const intro = Math.min(duration * 0.06, 8);
  const usable = Math.max(duration - intro, 1);
  const weight = (t: string) => Math.max(t.length, 8);
  const total = entries.reduce((sum, e) => sum + weight(e.text), 0);

  let elapsed = 0;
  return entries.map((e) => {
    const start = intro + (elapsed / total) * usable;
    elapsed += weight(e.text);
    return {
      time: e.time ?? Math.round(start * 10) / 10,
      text: e.text,
    };
  });
}
