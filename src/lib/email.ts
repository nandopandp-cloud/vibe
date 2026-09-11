import "server-only";

/**
 * Envio de e-mail.
 *
 * O Sona manda pouquíssimo e-mail, e sempre por causa de algo que uma
 * pessoa fez por outra — hoje, um convite de amizade. Por isso não há
 * SDK aqui: a API do Resend é um POST com JSON, e uma dependência a
 * mais para montar esse POST custaria mais do que resolve.
 *
 * Duas regras que valem para tudo que passar por aqui:
 *
 * - **Nunca derrubar a ação que originou o envio.** Um convite de
 *   amizade que funcionou no app não pode virar erro porque o provedor
 *   de e-mail estava fora do ar. Toda falha é registrada e engolida.
 * - **Sem chave, não é erro.** Em desenvolvimento ninguém tem
 *   `RESEND_API_KEY`, e o app precisa continuar inteiro: o envio vira
 *   um log com o assunto e o destinatário, que é o que se quer ver ao
 *   testar o fluxo mesmo.
 */

const ENDPOINT = "https://api.resend.com/emails";

/**
 * De onde o Sona fala. Um domínio verificado no provedor, em produção.
 *
 * É uma função, e não uma constante de módulo, porque uma constante é
 * avaliada quando o arquivo é importado pela primeira vez — antes, em
 * alguns caminhos, de o ambiente estar carregado. O sintoma é traiçoeiro:
 * tudo parece certo (a variável existe, o log mostra o valor) e mesmo
 * assim sai o remetente padrão, porque quem foi lido no import não foi
 * quem está lá agora. Ler na hora do envio elimina a ordem do problema.
 */
function from(): string {
  return process.env.SONA_MAIL_FROM ?? "Sona <onboarding@resend.dev>";
}

export type MailResult =
  | { ok: true; id: string | null }
  /** `skipped` quando não há chave — esperado fora de produção. */
  | { ok: false; skipped: boolean; error: string };

/**
 * A origem pública do app, para os links do e-mail.
 *
 * Um e-mail não tem `window.location`: o link precisa ser absoluto e
 * apontar para onde a pessoa realmente usa o Sona. `SONA_PUBLIC_URL`
 * manda, porque `VERCEL_URL` muda a cada deploy de preview e não é o
 * endereço que a pessoa conhece.
 */
export function publicUrl(path = "/"): string {
  const base =
    process.env.SONA_PUBLIC_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    "http://localhost:3000";

  return new URL(path, base.replace(/\/+$/, "")).toString();
}

export async function sendMail(input: {
  to: string;
  subject: string;
  html: string;
  /** Alternativa em texto puro, para clientes que não mostram HTML. */
  text: string;
}): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY;

  if (!key) {
    console.info(
      `[sona:email] sem RESEND_API_KEY — não enviado: "${input.subject}" → ${input.to}`,
    );
    return { ok: false, skipped: true, error: "RESEND_API_KEY ausente" };
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: from(),
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[sona:email] ${res.status} ao enviar: ${detail}`);
      return { ok: false, skipped: false, error: `HTTP ${res.status}` };
    }

    const body = (await res.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, id: body?.id ?? null };
  } catch (e) {
    console.error("[sona:email] falha de rede ao enviar", e);
    return { ok: false, skipped: false, error: "rede" };
  }
}
