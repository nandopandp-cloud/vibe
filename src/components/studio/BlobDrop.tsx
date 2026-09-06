"use client";

import { useId, useRef, useState } from "react";
import {
  looksLikeValidFile,
  readAudioDuration,
  uploadToBlob,
} from "@/lib/upload-client";
import { cx, formatTime } from "@/lib/utils";
import * as I from "../Icons";

export type UploadedFile = {
  url: string;
  name: string;
  /** Segundos; 0 para imagens. */
  duration: number;
};

type State = "vazio" | "enviando" | "pronto" | "erro";

/**
 * Dropzone que envia o arquivo direto ao Blob assim que ele é escolhido.
 * O formulário recebe só a URL — Server Actions na Vercel aceitam no
 * máximo 4,5 MB de body, o que reprovaria qualquer música.
 */
export function BlobDrop({
  folder,
  label,
  hint,
  accept,
  required,
  preview = "none",
  value,
  onChange,
  compact = false,
}: {
  folder: "audio" | "covers";
  label: string;
  hint?: string;
  accept: string;
  required?: boolean;
  preview?: "none" | "image" | "audio";
  value: UploadedFile | null;
  onChange: (file: UploadedFile | null) => void;
  compact?: boolean;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>(value ? "pronto" : "vazio");
  const [progress, setProgress] = useState(0);
  const [erro, setErro] = useState("");
  const [localUrl, setLocalUrl] = useState<string | null>(null);

  const kind = folder === "audio" ? "audio" : "image";

  async function handle(file: File | null) {
    if (!file) return;
    setErro("");

    if (!(await looksLikeValidFile(file, kind))) {
      setState("erro");
      setErro(
        kind === "audio"
          ? "Este arquivo não é um áudio válido."
          : "Este arquivo não é uma imagem válida.",
      );
      return;
    }

    setState("enviando");
    setProgress(0);
    try {
      const duration = kind === "audio" ? await readAudioDuration(file) : 0;
      const url = await uploadToBlob(file, folder, setProgress);
      if (preview !== "none") setLocalUrl(URL.createObjectURL(file));
      onChange({ url, name: file.name, duration });
      setState("pronto");
    } catch (e) {
      setState("erro");
      setErro(
        e instanceof Error ? e.message : "Falha ao enviar. Tente novamente.",
      );
    }
  }

  return (
    <div>
      <label
        htmlFor={inputId}
        className="mb-1.5 flex items-baseline gap-1 text-sm font-medium text-ink"
      >
        {label}
        {required && <span className="text-accent">*</span>}
      </label>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void handle(e.dataTransfer.files?.[0] ?? null);
        }}
        onClick={() => state !== "enviando" && inputRef.current?.click()}
        className={cx(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-center transition-colors",
          compact ? "px-3 py-4" : "px-4 py-7",
          state === "erro"
            ? "border-rose/50 bg-rose/5"
            : state === "pronto"
              ? "border-accent/40 bg-accent/5"
              : "border-hairline bg-surface-2/50 hover:border-ink-3",
        )}
      >
        {state === "pronto" && localUrl && preview === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={localUrl}
            alt="Pré-visualização"
            className="h-24 w-24 rounded-lg object-cover"
          />
        ) : (
          <span
            className={cx(
              "grid place-items-center rounded-full",
              compact ? "h-8 w-8" : "h-11 w-11",
              state === "pronto"
                ? "bg-accent/15 text-accent"
                : state === "erro"
                  ? "bg-rose/15 text-rose"
                  : "bg-surface-3 text-ink-2",
            )}
          >
            {state === "pronto" ? (
              <I.Check className="h-4 w-4" />
            ) : state === "erro" ? (
              <I.X className="h-4 w-4" />
            ) : (
              <I.Upload className={compact ? "h-4 w-4" : "h-5 w-5"} />
            )}
          </span>
        )}

        {state === "enviando" ? (
          <div className="w-full max-w-xs">
            <p className="text-sm text-ink">Enviando… {progress}%</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : state === "pronto" && value ? (
          <>
            <span className="max-w-full truncate text-sm font-medium text-ink">
              {value.name}
            </span>
            <span className="text-xs text-ink-2">
              {value.duration > 0 && `${formatTime(value.duration)} • `}
              enviado — clique para trocar
            </span>
            {localUrl && preview === "audio" && (
              <audio
                controls
                src={localUrl}
                className="mt-2 w-full max-w-sm"
                onClick={(e) => e.stopPropagation()}
              />
            )}
          </>
        ) : state === "erro" ? (
          <>
            <span className="text-sm text-rose">{erro}</span>
            <span className="text-xs text-ink-2">Clique para escolher outro</span>
          </>
        ) : (
          <>
            <span className={cx("text-ink-2", compact ? "text-xs" : "text-sm")}>
              Arraste aqui ou{" "}
              <span className="font-medium text-ink underline underline-offset-2">
                escolha do computador
              </span>
            </span>
            {hint && !compact && (
              <span className="text-xs text-ink-3">{hint}</span>
            )}
          </>
        )}
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => void handle(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
