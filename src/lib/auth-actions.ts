"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  authenticate,
  createUser,
  currentUser,
  endSession,
  normalizeEmail,
  startSession,
} from "./auth";
import type { ActionState } from "./actions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Contas de demonstração aceitam a senha curta com que foram criadas. */
const MIN_PASSWORD = 8;

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Impede open redirect: só aceitamos caminhos internos. */
function safeNext(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export async function login(
  _prev: ActionState | null,
  form: FormData,
): Promise<ActionState> {
  const email = str(form, "email");
  const password = String(form.get("password") ?? "");
  const next = safeNext(str(form, "next"));

  if (!email || !password) {
    return { ok: false, message: "Informe e-mail e senha." };
  }

  const user = await authenticate(email, password);
  if (!user) {
    // Mensagem única: não revelamos se o e-mail existe.
    return { ok: false, message: "E-mail ou senha incorretos." };
  }

  await startSession(user.id);
  revalidatePath("/", "layout");
  redirect(next);
}

export async function register(
  _prev: ActionState | null,
  form: FormData,
): Promise<ActionState> {
  const name = str(form, "name");
  const email = str(form, "email");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  if (!name) return { ok: false, message: "Informe seu nome." };
  if (!EMAIL_RE.test(email)) {
    return { ok: false, message: "Informe um e-mail válido." };
  }
  if (password.length < MIN_PASSWORD) {
    return {
      ok: false,
      message: `A senha precisa ter ao menos ${MIN_PASSWORD} caracteres.`,
    };
  }
  if (password !== confirm) {
    return { ok: false, message: "As senhas não coincidem." };
  }

  // Contas criadas pelo formulário público são sempre ouvintes.
  const user = await createUser({ email, name, password, role: "user" });
  if (!user) {
    return { ok: false, message: "Já existe uma conta com este e-mail." };
  }

  await startSession(user.id);
  revalidatePath("/", "layout");
  redirect("/");
}

export async function logout(): Promise<void> {
  await endSession();
  revalidatePath("/", "layout");
  redirect("/entrar");
}

/** Usada pelo Studio para checar permissão dentro das actions. */
export async function requireAdmin(): Promise<ActionState | null> {
  const user = await currentUser();
  if (!user) return { ok: false, message: "Faça login para continuar." };
  if (user.role !== "admins") {
    return { ok: false, message: "Apenas administradores podem fazer isso." };
  }
  return null;
}

export async function emailTaken(email: string): Promise<boolean> {
  const { readDb } = await import("./db");
  const db = await readDb();
  return db.users.some((u) => u.email === normalizeEmail(email));
}
