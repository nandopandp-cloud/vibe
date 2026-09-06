"use client";

import { useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { cx } from "@/lib/utils";
import * as I from "../Icons";
import type { ActionState } from "@/lib/actions";

/** Campo com ícone à esquerda, como na referência. */
export function AuthField({
  label,
  icon: Icon,
  type = "text",
  name,
  placeholder,
  autoComplete,
  required,
  defaultValue,
  minLength,
}: {
  label: string;
  icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement;
  type?: string;
  name: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  defaultValue?: string;
  minLength?: number;
}) {
  const id = useId();
  const isPassword = type === "password";
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-sm font-medium text-ink"
      >
        {label}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-2" />
        <input
          id={id}
          name={name}
          type={isPassword && visible ? "text" : type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          defaultValue={defaultValue}
          minLength={minLength}
          className={cx(
            "h-14 w-full rounded-xl border border-hairline bg-surface/70 pl-12 text-sm text-ink",
            "placeholder:text-ink-3 transition-colors",
            "focus:border-ink-3 focus:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
            isPassword ? "pr-12" : "pr-4",
          )}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-2 transition-colors hover:text-ink"
          >
            {visible ? (
              <I.Eye className="h-[18px] w-[18px]" />
            ) : (
              <I.EyeOff className="h-[18px] w-[18px]" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

/** Botão principal, com estado pendente da server action. */
export function AuthSubmit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cx(
        "group flex h-14 w-full items-center justify-center gap-2 rounded-full",
        "bg-accent text-sm font-semibold text-accent-ink transition-all",
        "hover:enabled:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60",
      )}
    >
      {pending ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent-ink/30 border-t-accent-ink" />
          Entrando…
        </>
      ) : (
        <>
          {children}
          <I.ArrowRight className="h-[18px] w-[18px] transition-transform group-hover:translate-x-0.5" />
        </>
      )}
    </button>
  );
}

export function AuthError({ state }: { state: ActionState | null }) {
  if (!state || state.ok) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-xl border border-rose/30 bg-rose/10 px-4 py-3 text-sm text-rose"
    >
      <I.X className="mt-px h-4 w-4 shrink-0" />
      {state.message}
    </div>
  );
}

/**
 * Provedores sociais da referência. Não há OAuth configurado neste
 * projeto, então ficam desabilitados em vez de simular um login.
 */
export function SocialButtons() {
  const providers = [
    { name: "Google", color: "#ea4335" },
    { name: "Apple", color: "#ffffff" },
    { name: "Spotify", color: "#1dd760" },
  ];

  return (
    <div>
      <div className="my-7 flex items-center gap-4">
        <span className="h-px flex-1 bg-hairline" />
        <span className="text-xs text-ink-2">ou continue com</span>
        <span className="h-px flex-1 bg-hairline" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {providers.map((p) => (
          <button
            key={p.name}
            type="button"
            disabled
            title="Login social ainda não configurado neste ambiente"
            className="flex cursor-not-allowed flex-col items-center gap-2 rounded-xl border border-hairline bg-surface/40 px-2 py-4 opacity-50"
          >
            <span
              className="h-5 w-5 rounded-full"
              style={{ background: p.color }}
              aria-hidden
            />
            <span className="text-xs text-ink-2">{p.name}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-ink-3">
        Login social ainda não configurado — use e-mail e senha.
      </p>
    </div>
  );
}
