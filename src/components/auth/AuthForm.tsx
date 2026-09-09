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

/** Logo oficial do Google, nas quatro cores da marca. */
function GoogleMark(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 18 18" aria-hidden {...props}>
      <path
        fill="#4285f4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62Z"
      />
      <path
        fill="#34a853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#fbbc05"
        d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#ea4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/**
 * Entrada pelo Google. O botão só aparece quando as credenciais OAuth
 * estão configuradas no ambiente — sem elas, o fluxo não sairia do lugar,
 * então é melhor não oferecer a opção.
 */
export function SocialButtons({
  enabled,
  next = "/",
}: {
  enabled: boolean;
  next?: string;
}) {
  if (!enabled) return null;

  return (
    <div>
      <div className="my-7 flex items-center gap-4">
        <span className="h-px flex-1 bg-hairline" />
        <span className="text-xs text-ink-2">ou continue com</span>
        <span className="h-px flex-1 bg-hairline" />
      </div>

      {/* Link, não fetch: o OAuth precisa de uma navegação de verdade. */}
      <a
        href={`/api/auth/google?next=${encodeURIComponent(next)}`}
        className="flex w-full items-center justify-center gap-3 rounded-xl border border-hairline bg-surface px-4 py-3.5 text-sm font-medium text-ink transition-colors hover:border-ink/30 hover:bg-surface-2"
      >
        <GoogleMark className="h-[18px] w-[18px]" />
        Continuar com o Google
      </a>
    </div>
  );
}
