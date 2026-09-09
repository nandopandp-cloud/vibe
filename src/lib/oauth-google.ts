import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { SocialProfile } from "./auth";

/**
 * OAuth 2.0 com o Google, no fluxo Authorization Code.
 *
 * O app tem autenticação própria (cookie de sessão assinado), então aqui
 * não entra uma biblioteca inteira: só precisamos levar a pessoa ao Google,
 * trocar o código por um token e ler o perfil.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export const CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";

/** O botão só aparece quando as duas chaves estão configuradas. */
export const googleEnabled = Boolean(CLIENT_ID && CLIENT_SECRET);

/** Cookie que guarda o `state` entre a ida ao Google e a volta. */
export const STATE_COOKIE = "sona_oauth_state";

const SECRET =
  process.env.SONA_SESSION_SECRET ??
  "sona-dev-secret-troque-em-producao-com-SONA_SESSION_SECRET";

/**
 * URL de retorno. Precisa bater exatamente com a cadastrada no Google
 * Cloud Console. Em produção usamos o domínio público — não a URL do
 * deploy, que muda a cada build e não estaria na lista de autorizadas.
 */
export function redirectUri(origin: string): string {
  const base = process.env.GOOGLE_REDIRECT_ORIGIN ?? origin;
  return new URL("/api/auth/google/callback", base).toString();
}

/* ------------------------------------------------------------------ */
/* state — proteção contra CSRF                                        */
/* ------------------------------------------------------------------ */

/**
 * O `state` carrega o destino pós-login e vai assinado, então o callback
 * consegue confiar nele mesmo tendo o cookie como segunda checagem.
 */
export function createState(next: string): string {
  const nonce = randomBytes(16).toString("hex");
  const payload = `${nonce}.${Buffer.from(next).toString("base64url")}`;
  const mac = createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

/** Confere a assinatura e devolve o destino, ou null se algo não bate. */
export function readState(state: string | undefined): { next: string } | null {
  if (!state) return null;
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [nonce, encodedNext, mac] = parts;

  const expected = createHmac("sha256", SECRET)
    .update(`${nonce}.${encodedNext}`)
    .digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    return { next: Buffer.from(encodedNext, "base64url").toString() };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Fluxo                                                               */
/* ------------------------------------------------------------------ */

export function authorizeUrl(origin: string, state: string): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri(origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  // Sempre mostra o seletor: sem isso, quem tem várias contas Google fica
  // preso na primeira que o navegador lembrar.
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

type UserInfo = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

/**
 * Troca o código pelo perfil. Devolve null quando o Google recusa, o
 * e-mail não vem, ou o e-mail não foi verificado — sem verificação não
 * podemos vincular a uma conta existente, que é o ponto do login social.
 */
export async function exchangeCodeForProfile(
  code: string,
  origin: string,
): Promise<SocialProfile | null> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: redirectUri(origin),
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    console.error("[sona] troca de código com o Google falhou", res.status);
    return null;
  }

  const { access_token: accessToken } = (await res.json()) as {
    access_token?: string;
  };
  if (!accessToken) return null;

  const infoRes = await fetch(USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!infoRes.ok) return null;

  const info = (await infoRes.json()) as UserInfo;
  if (!info.sub || !info.email) return null;
  // `email_verified` falso significa que o Google não confirmou o endereço;
  // vincular por e-mail nesse caso permitiria assumir a conta de outrem.
  if (info.email_verified === false) return null;

  return {
    providerId: info.sub,
    email: info.email,
    name: info.name ?? "",
    image: info.picture ?? null,
  };
}
