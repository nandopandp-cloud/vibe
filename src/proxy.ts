import { NextResponse, type NextRequest } from "next/server";

/**
 * Porteiro de borda: barra quem não tem cookie de sessão antes de a página
 * renderizar. A validação real da assinatura acontece no servidor
 * (`currentUser`), porque o proxy roda antes do render, sem acesso ao
 * catálogo em disco — aqui só olhamos a presença do cookie.
 */

const PUBLIC = ["/entrar", "/criar-conta", "/api/auth/"];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get("sona_session")?.value);
  const isPublic = PUBLIC.some((p) => pathname.startsWith(p));

  // Já autenticado não precisa ver login/cadastro. As rotas de OAuth ficam
  // de fora: trocar de conta Google exige chegar nelas já com sessão.
  const isAuthApi = pathname.startsWith("/api/auth/");
  if (hasSession && isPublic && !isAuthApi) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (!hasSession && !isPublic) {
    const url = new URL("/entrar", req.url);
    // Preserva o destino para voltar depois do login.
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Tudo, menos assets e as rotas internas do Next.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|images).*)",
  ],
};
