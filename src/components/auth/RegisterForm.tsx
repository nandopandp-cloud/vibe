"use client";

import { useActionState } from "react";
import Link from "next/link";
import { register } from "@/lib/auth-actions";
import { AuthError, AuthField, AuthSubmit } from "./AuthForm";
import * as I from "../Icons";

export function RegisterForm() {
  const [state, action] = useActionState(register, null);

  return (
    <>
      <header className="mb-8 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-4xl font-bold leading-[1.15] tracking-tight text-ink">
            Criar sua
            <br />
            conta
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-ink-2">
            Entre para o Sona e leve suas músicas
            <br />
            para qualquer lugar.
          </p>
        </div>
        <p className="hidden shrink-0 pt-1 text-right text-xs text-ink-2 sm:block">
          Já tem uma conta?
          <br />
          <Link href="/entrar" className="font-medium text-accent hover:underline">
            Entrar
          </Link>
        </p>
      </header>

      <form action={action} className="space-y-5">
        <AuthError state={state} />

        <AuthField
          label="Nome"
          name="name"
          icon={I.User}
          placeholder="Como devemos te chamar"
          autoComplete="name"
          required
        />

        <AuthField
          label="E-mail"
          name="email"
          type="email"
          icon={I.Mail}
          placeholder="seu@email.com"
          autoComplete="email"
          required
        />

        <AuthField
          label="Senha"
          name="password"
          type="password"
          icon={I.Lock}
          placeholder="Ao menos 8 caracteres"
          autoComplete="new-password"
          minLength={8}
          required
        />

        <AuthField
          label="Confirmar senha"
          name="confirm"
          type="password"
          icon={I.Lock}
          placeholder="Repita a senha"
          autoComplete="new-password"
          minLength={8}
          required
        />

        <AuthSubmit>Criar conta</AuthSubmit>
      </form>

      <p className="mt-6 text-center text-xs leading-relaxed text-ink-3">
        Contas criadas por aqui entram como ouvintes. O acesso ao Studio é
        concedido por um administrador.
      </p>

      <p className="mt-5 text-center text-xs text-ink-2 sm:hidden">
        Já tem uma conta?{" "}
        <Link href="/entrar" className="font-medium text-accent">
          Entrar
        </Link>
      </p>
    </>
  );
}
