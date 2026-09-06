"use client";

import { upload } from "@vercel/blob/client";

/**
 * Envia um arquivo do navegador direto ao Vercel Blob e devolve a URL.
 * O servidor só assina o token (`/api/upload`) — o arquivo não passa por
 * ele, contornando o teto de 4,5 MB do body de Server Actions.
 */
export async function uploadToBlob(
  file: File,
  folder: "audio" | "covers",
  onProgress?: (percentage: number) => void,
): Promise<string> {
  const result = await upload(`${folder}/${file.name}`, file, {
    access: "public",
    handleUploadUrl: "/api/upload",
    // Arquivos grandes vão em partes paralelas, com retentativa por parte.
    multipart: file.size > 8 * 1024 * 1024,
    onUploadProgress: onProgress
      ? ({ percentage }) => onProgress(percentage)
      : undefined,
  });
  return result.url;
}

/** Duração real do áudio, lida no navegador antes do envio. */
export function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (value: number) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.addEventListener("loadedmetadata", () =>
      done(Number.isFinite(audio.duration) ? Math.round(audio.duration) : 0),
    );
    audio.addEventListener("error", () => done(0));
    audio.src = url;
  });
}

const AUDIO_MAGIC = [
  { offset: 0, ascii: "ID3" },
  { offset: 0, ascii: "RIFF" },
  { offset: 0, ascii: "OggS" },
  { offset: 0, ascii: "fLaC" },
  { offset: 4, ascii: "ftyp" },
];

const IMAGE_MAGIC = [
  { offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] },
  { offset: 0, ascii: "RIFF" },
  { offset: 4, ascii: "ftyp" },
];

/**
 * Confere a assinatura real do arquivo antes de enviar. O `type` que o
 * browser reporta vem da extensão, então um .txt renomeado para .mp3
 * passaria batido. Esta checagem existia no servidor e continua valendo
 * agora que o arquivo vai direto ao Blob.
 */
export async function looksLikeValidFile(
  file: File,
  kind: "audio" | "image",
): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const at = (offset: number, len: number) =>
    String.fromCharCode(...head.slice(offset, offset + len));

  const table = kind === "audio" ? AUDIO_MAGIC : IMAGE_MAGIC;
  for (const sig of table) {
    if ("ascii" in sig && sig.ascii && at(sig.offset, sig.ascii.length) === sig.ascii) {
      return true;
    }
    if (
      "bytes" in sig &&
      sig.bytes &&
      sig.bytes.every((b, i) => head[sig.offset + i] === b)
    ) {
      return true;
    }
  }
  // MP3 sem tag ID3: quadro MPEG começa com 0xFF Ex.
  if (kind === "audio" && head[0] === 0xff && (head[1] & 0xe0) === 0xe0) {
    return true;
  }
  return false;
}
