import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import {
  createHmac,
  randomBytes,
  randomUUID,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { mutate, readDb } from "./db";
import type { PublicUser, Role, User } from "./types";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const COOKIE = "sona_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 dias

/**
 * Segredo de assinatura da sessão. Em produção deve vir do ambiente;
 * localmente caímos num valor fixo para o app rodar sem configuração.
 */
const SECRET =
  process.env.SONA_SESSION_SECRET ??
  "sona-dev-secret-troque-em-producao-com-SONA_SESSION_SECRET";

if (process.env.NODE_ENV === "production" && !process.env.SONA_SESSION_SECRET) {
  console.warn(
    "[sona] SONA_SESSION_SECRET não definido — as sessões usam um segredo público. Defina a variável antes de expor o app.",
  );
}

/* ------------------------------------------------------------------ */
/* Senhas                                                              */
/* ------------------------------------------------------------------ */

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64);
  return `${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string | null,
): Promise<boolean> {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const key = await scrypt(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  // Comprimentos diferentes fariam timingSafeEqual lançar.
  if (expected.length !== key.length) return false;
  return timingSafeEqual(expected, key);
}

/* ------------------------------------------------------------------ */
/* Token de sessão — "<userId>.<expira>.<assinatura>"                   */
/* ------------------------------------------------------------------ */

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

function createToken(userId: string): string {
  const expires = Date.now() + MAX_AGE * 1000;
  const payload = `${userId}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

/** Devolve o id do usuário se o token for íntegro e não tiver expirado. */
function readToken(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expires, signature] = parts;

  const expected = sign(`${userId}.${expires}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  if (Number(expires) < Date.now()) return null;
  return userId;
}

/* ------------------------------------------------------------------ */
/* Sessão                                                              */
/* ------------------------------------------------------------------ */

export async function startSession(userId: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, createToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export function toPublic(user: User): PublicUser {
  const { passwordHash: _hash, googleId: _google, ...rest } = user;
  void _hash;
  void _google;
  return rest;
}

/**
 * Usuário da requisição atual, ou null se não houver sessão válida.
 * Memoizado por requisição: layout, página e actions perguntam quem é o
 * usuário várias vezes, e a resposta não muda no meio do render.
 */
export const currentUser = cache(
  async (): Promise<PublicUser | null> => {
    const jar = await cookies();
    const userId = readToken(jar.get(COOKIE)?.value);
    if (!userId) return null;

    const db = await readDb();
    const user = db.users.find((u) => u.id === userId);
    return user ? toPublic(user) : null;
  },
);

export async function isAdmin(): Promise<boolean> {
  return (await currentUser())?.role === "admins";
}

/* ------------------------------------------------------------------ */
/* Contas                                                              */
/* ------------------------------------------------------------------ */

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
  role: Role;
}): Promise<PublicUser | null> {
  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);

  return mutate((db) => {
    if (db.users.some((u) => u.email === email)) return null;
    const user: User = {
      id: randomUUID().slice(0, 8),
      email,
      name: input.name.trim() || email.split("@")[0],
      role: input.role,
      passwordHash,
      image: null,
      googleId: null,
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    return toPublic(user);
  });
}

export async function authenticate(
  email: string,
  password: string,
): Promise<PublicUser | null> {
  const db = await readDb();
  const user = db.users.find((u) => u.email === normalizeEmail(email));
  // Roda o scrypt mesmo sem usuário, para não vazar quais e-mails existem
  // pela diferença de tempo de resposta.
  const stored =
    user?.passwordHash ??
    "0000000000000000000000000000000000000000000000000000000000000000:00";
  const ok = await verifyPassword(password, stored);
  return ok && user ? toPublic(user) : null;
}

/* ------------------------------------------------------------------ */
/* Contas de demonstração                                              */
/* ------------------------------------------------------------------ */

/**
 * Cria as contas iniciais na primeira execução, para a plataforma não
 * nascer sem ninguém que consiga entrar. As senhas ficam com hash, como
 * as de qualquer outro usuário.
 */
export async function ensureSeedUsers(): Promise<void> {
  const db = await readDb();
  if (db.users.length > 0) return;

  await createUser({
    email: "admins@gmail.com",
    name: "Admin Sona",
    password: "12345",
    role: "admins",
  });
  await createUser({
    email: "nandopandp@gmail.com",
    name: "Fernando",
    password: "12345",
    role: "user",
  });
}

/* ------------------------------------------------------------------ */
/* Login social                                                        */
/* ------------------------------------------------------------------ */

/** Perfil normalizado do provedor — hoje só o Google. */
export type SocialProfile = {
  /** `sub` do Google: identificador estável da conta. */
  providerId: string;
  email: string;
  name: string;
  image: string | null;
};

/**
 * Encontra ou cria o usuário correspondente a um perfil do Google.
 *
 * A busca é primeiro pelo `sub` (estável mesmo se a pessoa trocar o e-mail
 * na conta Google) e depois pelo e-mail — é assim que uma conta antiga de
 * senha passa a aceitar o login social sem perder curtidas nem o papel de
 * admin. Vincular pelo e-mail só é seguro porque o Google nos diz que ele
 * foi verificado; quem chama precisa ter checado isso antes.
 */
export async function findOrCreateSocialUser(
  profile: SocialProfile,
): Promise<PublicUser> {
  const email = normalizeEmail(profile.email);

  return mutate((db) => {
    const existing =
      db.users.find((u) => u.googleId === profile.providerId) ??
      db.users.find((u) => u.email === email);

    if (existing) {
      // Mantém o vínculo e a foto em dia, mas não sobrescreve o nome:
      // quem já se cadastrou aqui pode ter escolhido outro.
      existing.googleId = profile.providerId;
      existing.image = profile.image ?? existing.image;
      return toPublic(existing);
    }

    const user: User = {
      id: randomUUID().slice(0, 8),
      email,
      name: profile.name.trim() || email.split("@")[0],
      // Como no cadastro público, quem chega pelo Google entra como ouvinte.
      role: "user",
      // Sem senha: esta conta só entra pelo provedor.
      passwordHash: null,
      image: profile.image,
      googleId: profile.providerId,
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    return toPublic(user);
  });
}
