import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  authorizeUrl,
  createState,
  googleEnabled,
  STATE_COOKIE,
} from "@/lib/oauth-google";

/** Impede open redirect: só aceitamos caminhos internos. */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

/** Início do fluxo: manda a pessoa ao Google com um `state` assinado. */
export async function GET(request: Request): Promise<NextResponse> {
  if (!googleEnabled) {
    return NextResponse.redirect(
      new URL("/entrar?erro=google-indisponivel", request.url),
    );
  }

  const { searchParams, origin } = new URL(request.url);
  const state = createState(safeNext(searchParams.get("next")));

  // O mesmo `state` vai no cookie: na volta, comparamos os dois.
  const jar = await cookies();
  jar.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });

  return NextResponse.redirect(authorizeUrl(origin, state));
}
