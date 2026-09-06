import "server-only";

import { del, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { parseBuffer } from "music-metadata";

const AUDIO_TYPES: Record<string, string> = {
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/ogg": ".ogg",
  "audio/flac": ".flac",
  "audio/x-flac": ".flac",
  "audio/mp4": ".m4a",
  "audio/aac": ".m4a",
};

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/avif": ".avif",
};

const MAX_AUDIO = 40 * 1024 * 1024; // 40 MB
const MAX_IMAGE = 8 * 1024 * 1024; // 8 MB

export class UploadError extends Error {}

/**
 * Confere a assinatura real do arquivo. O `type` que o browser envia
 * vem da extensão, então um .txt renomeado para .mp3 passaria batido.
 */
function sniff(buf: Buffer): "audio" | "image" | null {
  const startsWith = (...bytes: number[]) =>
    bytes.every((b, i) => buf[i] === b);
  const ascii = (offset: number, s: string) =>
    buf.toString("latin1", offset, offset + s.length) === s;

  // --- áudio ---
  if (ascii(0, "ID3")) return "audio"; // MP3 com tag ID3
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return "audio"; // frame MPEG
  if (ascii(0, "RIFF") && ascii(8, "WAVE")) return "audio";
  if (ascii(0, "OggS")) return "audio";
  if (ascii(0, "fLaC")) return "audio";
  if (ascii(4, "ftyp")) return "audio"; // M4A/MP4

  // --- imagem ---
  if (startsWith(0xff, 0xd8, 0xff)) return "image"; // JPEG
  if (startsWith(0x89, 0x50, 0x4e, 0x47)) return "image"; // PNG
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image";
  if (ascii(4, "ftypavif")) return "image";

  return null;
}

/**
 * Grava no Vercel Blob e devolve a URL pública definitiva.
 * O disco do servidor é efêmero e somente leitura em produção, então
 * os arquivos enviados precisam viver fora dele.
 */
async function save(
  buf: Buffer,
  folder: "audio" | "covers",
  ext: string,
  contentType: string,
): Promise<string> {
  const { url } = await put(`${folder}/${randomUUID()}${ext}`, buf, {
    access: "public",
    contentType,
    // O nome já é único; sem isto o SDK acrescenta outro sufixo.
    addRandomSuffix: false,
  });
  return url;
}

/** Grava o áudio e devolve caminho público + duração real lida das tags. */
export async function saveAudio(
  file: File,
): Promise<{ url: string; duration: number }> {
  const ext = AUDIO_TYPES[file.type];
  if (!ext) {
    throw new UploadError(
      "Formato de áudio não suportado. Use MP3, WAV, OGG, FLAC ou M4A.",
    );
  }
  if (file.size > MAX_AUDIO) {
    throw new UploadError("O arquivo de áudio excede o limite de 40 MB.");
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (sniff(buf) !== "audio") {
    throw new UploadError(
      "Este arquivo não é um áudio válido. Verifique se não foi apenas renomeado.",
    );
  }

  let duration = 0;
  try {
    const meta = await parseBuffer(buf, { mimeType: file.type });
    duration = Math.round(meta.format.duration ?? 0);
  } catch {
    // Sem metadados legíveis o player ainda descobre a duração ao carregar.
    duration = 0;
  }

  const url = await save(buf, "audio", ext, file.type);
  return { url, duration };
}

/** Grava uma capa ou foto de artista. */
export async function saveImage(file: File): Promise<string> {
  const ext = IMAGE_TYPES[file.type];
  if (!ext) {
    throw new UploadError(
      "Formato de imagem não suportado. Use JPG, PNG, WebP ou AVIF.",
    );
  }
  if (file.size > MAX_IMAGE) {
    throw new UploadError("A imagem excede o limite de 8 MB.");
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (sniff(buf) !== "image") {
    throw new UploadError(
      "Este arquivo não é uma imagem válida. Verifique se não foi apenas renomeado.",
    );
  }
  return save(buf, "covers", ext, file.type);
}

/** Remove um arquivo do Blob; ignora se já não existe. */
export async function removeUpload(url: string | null | undefined) {
  if (!url?.startsWith("http")) return;
  try {
    await del(url);
  } catch {
    /* já removido */
  }
}

/** Lê um campo de formulário como File, tratando o input vazio do browser. */
export function fileField(form: FormData, key: string): File | null {
  const v = form.get(key);
  if (v instanceof File && v.size > 0 && v.name) return v;
  return null;
}
