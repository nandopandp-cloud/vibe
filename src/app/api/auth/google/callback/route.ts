import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { findOrCreateSocialUser, startSession } from "@/lib/auth";
import {
  exchangeCodeForProfile,
  googleEnabled,
  readState,
  STATE_COOKIE,
} from "@/lib/oauth-google";

const fail = (url: string, reason: string) =>
  NextResponse.redirect(new URL(`/entrar?erro=${reason}`, url));

/** Volta do Google: valida o `state`, lê o perfil e abre a sessão. */
export async function GET(request: Request): Promise<NextResponse> {
  if (!googleEnabled) return fail(request.url, "google-indisponivel");

  const { searchParams, origin } = new URL(request.url);
  const jar = await cookies();
  const cookieState = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);

  // A pessoa pode ter cancelado na tela do Google.
  if (searchParams.get("error")) return fail(request.url, "google-cancelado");

  const state = searchParams.get("state") ?? undefined;
  const code = searchParams.get("code");
  // Dupla checagem: a assinatura prova que o `state` é nosso, e o cookie
  // prova que ele pertence a este navegador.
  if (!code || !state || state !== cookieState) {
    return fail(request.url, "google-invalido");
  }
  const parsed = readState(state);
  if (!parsed) return fail(request.url, "google-invalido");

  try {
    const profile = await exchangeCodeForProfile(code, origin);
    if (!profile) return fail(request.url, "google-falhou");

    const user = await findOrCreateSocialUser(profile);
    await startSession(user.id);

    return NextResponse.redirect(new URL(parsed.next, request.url));
  } catch (e) {
    console.error("[sona] callback do Google falhou", e);
    return fail(request.url, "google-falhou");
  }
}
