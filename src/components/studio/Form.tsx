"use client";

import { useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { cx } from "@/lib/utils";
import * as I from "../Icons";
import type { ActionState } from "@/lib/actions";

/* ---------------- cabeçalho e superfícies ---------------- */

export function StudioHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-2">
            {description}
          </p>
        )}
      </div>
      {action}
    </header>
  );
}

export function Card({
  children,
  className,
  title,
  description,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  description?: string;
}) {
  return (
    <section
      className={cx(
        "rounded-xl border border-hairline bg-surface/60 p-5",
        className,
      )}
    >
      {title && (
        <div className="mb-4">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {description && (
            <p className="mt-1 text-sm text-ink-2">{description}</p>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

/* ---------------- campos ---------------- */

const fieldBase =
  "w-full rounded-lg border border-hairline bg-surface-2 px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-3 transition-colors focus:border-ink-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

export function Field({
  label,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 flex items-baseline gap-1 text-sm font-medium text-ink">
        {label}
        {required && <span className="text-accent">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(fieldBase, props.className)} />;
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return (
    <textarea
      {...props}
      className={cx(fieldBase, "min-h-[96px] resize-y", props.className)}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx(fieldBase, "appearance-none pr-9", props.className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23a8a8b3' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m6 9 6 7 6-7'/%3E%3C/svg%3E\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 10px center",
        backgroundSize: "16px",
      }}
    />
  );
}

export function Checkbox({
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-hairline bg-surface-2 p-3.5 transition-colors hover:border-ink-3">
      <input
        type="checkbox"
        {...props}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[#1dd760]"
      />
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-ink-2">{hint}</span>}
      </span>
    </label>
  );
}

/* ---------------- upload de arquivo ---------------- */

/** Dropzone com preview — aceita clique e arrastar-e-soltar. */
export function FileDrop({
  name,
  accept,
  label,
  hint,
  required,
  preview = "none",
}: {
  name: string;
  accept: string;
  label: string;
  hint?: string;
  required?: boolean;
  preview?: "none" | "image" | "audio";
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const take = (f: File | null) => {
    setFile(f);
    if (url) URL.revokeObjectURL(url);
    setUrl(f && preview !== "none" ? URL.createObjectURL(f) : null);
  };

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
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const dropped = e.dataTransfer.files?.[0];
          if (!dropped || !inputRef.current) return;
          // Transfere o arquivo solto para o input real do formulário.
          const dt = new DataTransfer();
          dt.items.add(dropped);
          inputRef.current.files = dt.files;
          take(dropped);
        }}
        onClick={() => inputRef.current?.click()}
        className={cx(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-7 text-center transition-colors",
          over
            ? "border-accent bg-accent/5"
            : file
              ? "border-hairline bg-surface-2"
              : "border-hairline bg-surface-2/50 hover:border-ink-3",
        )}
      >
        {url && preview === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt="Pré-visualização"
            className="h-28 w-28 rounded-lg object-cover"
          />
        ) : (
          <span className="grid h-11 w-11 place-items-center rounded-full bg-surface-3 text-ink-2">
            <I.Upload className="h-5 w-5" />
          </span>
        )}

        {file ? (
          <>
            <span className="max-w-full truncate text-sm font-medium text-ink">
              {file.name}
            </span>
            <span className="text-xs text-ink-3">
              {(file.size / 1024 / 1024).toFixed(1)} MB — clique para trocar
            </span>
            {url && preview === "audio" && (
              <audio
                controls
                src={url}
                className="mt-2 w-full max-w-sm"
                onClick={(e) => e.stopPropagation()}
              />
            )}
          </>
        ) : (
          <>
            <span className="text-sm text-ink-2">
              Arraste o arquivo aqui ou{" "}
              <span className="font-medium text-ink underline underline-offset-2">
                escolha do computador
              </span>
            </span>
            {hint && <span className="text-xs text-ink-3">{hint}</span>}
          </>
        )}
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        name={name}
        accept={accept}
        required={required}
        className="sr-only"
        onChange={(e) => take(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

/* ---------------- botões e feedback ---------------- */

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
}) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" &&
          "bg-accent text-accent-ink hover:enabled:scale-[1.02] hover:enabled:bg-accent-hover",
        variant === "ghost" &&
          "border border-hairline text-ink hover:enabled:border-ink-3 hover:enabled:bg-surface",
        variant === "danger" &&
          "border border-hairline text-ink-2 hover:enabled:border-rose/60 hover:enabled:text-rose",
        className,
      )}
    />
  );
}

/** Botão de submit que mostra o estado pendente da server action. */
export function SubmitButton({
  children,
  pendingLabel = "Enviando…",
  className,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className={className}>
      {pending && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent-ink/30 border-t-accent-ink" />
      )}
      {pending ? pendingLabel : children}
    </Button>
  );
}

/** Faixa de resultado da última ação. */
export function FormMessage({ state }: { state: ActionState | null }) {
  if (!state?.message) return null;
  return (
    <div
      role="status"
      className={cx(
        "flex items-center gap-2.5 rounded-lg border px-4 py-3 text-sm",
        state.ok
          ? "border-accent/30 bg-accent/10 text-accent"
          : "border-rose/30 bg-rose/10 text-rose",
      )}
    >
      {state.ok ? (
        <I.Check className="h-4 w-4 shrink-0" />
      ) : (
        <I.X className="h-4 w-4 shrink-0" />
      )}
      {state.message}
    </div>
  );
}
