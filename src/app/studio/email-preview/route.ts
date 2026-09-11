import { isAdmin } from "@/lib/auth";
import {
  friendInviteHtml,
  friendInviteSubject,
} from "@/lib/email-templates";

/**
 * Prévia do e-mail no navegador.
 *
 * Um template de e-mail é a única parte do app que não se vê enquanto se
 * escreve: para olhá-lo, seria preciso disparar um envio de verdade e
 * abrir a caixa de entrada a cada ajuste. Esta rota devolve o mesmo HTML
 * que o provedor receberia.
 *
 * Fica atrás de `isAdmin` porque aceita o nome e a foto por query — sem
 * isso, seria uma página que reflete qualquer texto de volta no domínio
 * do Sona, com a marca do Sona em volta.
 *
 * Ver: /studio/email-preview?nome=Lucas%20Ferreira
 */
export async function GET(request: Request) {
  if (!(await isAdmin())) {
    return new Response("Não encontrado.", { status: 404 });
  }

  const params = new URL(request.url).searchParams;
  const fromName = params.get("nome")?.trim() || "Lucas Ferreira";
  const fromEmail = params.get("email")?.trim() || "lucasferreira@sona.app";
  // A foto só entra se for `https`: uma `javascript:` ou `data:` aqui
  // viraria conteúdo ativo dentro da prévia.
  const raw = params.get("foto")?.trim() ?? "";
  const fromImage = raw.startsWith("https://") ? raw : null;

  const html = friendInviteHtml({
    toName: params.get("para")?.trim() || "Ana",
    fromName,
    fromEmail,
    fromImage,
  });

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Uma prévia em cache mostraria o template de antes do último ajuste.
      "Cache-Control": "no-store",
      "X-Email-Subject": encodeURIComponent(friendInviteSubject(fromName)),
    },
  });
}
