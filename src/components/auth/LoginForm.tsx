"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login } from "@/lib/auth-actions";
import {
  AuthError,
  AuthField,
  AuthSubmit,
  SocialButtons,
} from "./AuthForm";
import * as I from "../Icons";

/** Mensagens dos redirecionamentos de erro do fluxo OAuth. */
const OAUTH_ERRORS: Record<string, string> = {
  "google-indisponivel": "O login com Google não está configurado.",
  "google-cancelado": "Login com Google cancelado.",
  "google-invalido": "A sessão do login expirou. Tente de novo.",
  "google-falhou": "Não foi possível entrar com o Google. Tente de novo.",
};

export function LoginForm({
  next,
  googleEnabled,
  oauthError,
}: {
  next: string;
  googleEnabled: boolean;
  oauthError?: string;
}) {
  const [state, action] = useActionState(login, null);
  // Um erro vindo do OAuth chega pela URL, não pela action.
  const shown =
    state ??
    (oauthError
      ? {
          ok: false,
          message: OAUTH_ERRORS[oauthError] ?? "Não foi possível entrar.",
        }
      : null);

  return (
    <>
      <header className="mb-8 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-4xl font-bold leading-[1.15] tracking-tight text-ink">
            Bem-vindo(a)
            <br />
            de volta!
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-ink-2">
            Faça login para continuar no Sona
            <br />e seguir ouvindo o que te inspira.
          </p>
        </div>
        <p className="hidden shrink-0 pt-1 text-right text-xs text-ink-2 sm:block">
          Ainda não tem uma conta?
          <br />
          <Link
            href="/criar-conta"
            className="font-medium text-accent hover:underline"
          >
            Criar conta
          </Link>
        </p>
      </header>

      <form action={action} className="space-y-5">
        <input type="hidden" name="next" value={next} />
        <AuthError state={shown} />

        <AuthField
          label="E-mail"
          name="email"
          type="email"
          icon={I.Mail}
          placeholder="seu@email.com"
          autoComplete="email"
          required
        />

        <div>
          <AuthField
            label="Senha"
            name="password"
            type="password"
            icon={I.Lock}
            placeholder="Digite sua senha"
            autoComplete="current-password"
            required
          />
          <p className="mt-2.5 text-right">
            <Link
              href="/entrar"
              className="text-xs text-ink-2 transition-colors hover:text-ink"
            >
              Esqueceu sua senha?
            </Link>
          </p>
        </div>

        <AuthSubmit>Entrar</AuthSubmit>
      </form>

      <SocialButtons enabled={googleEnabled} next={next} />

      <p className="mt-7 text-center text-xs leading-relaxed text-ink-2 sm:hidden">
        Ainda não tem uma conta?{" "}
        <Link href="/criar-conta" className="font-medium text-accent">
          Criar conta
        </Link>
      </p>

      <p className="mt-6 text-center text-xs leading-relaxed text-ink-3">
        Ao continuar, você concorda com nossos{" "}
        <span className="text-ink-2">Termos de Uso</span> e{" "}
        <span className="text-ink-2">Política de Privacidade</span>.
      </p>
    </>
  );
}
