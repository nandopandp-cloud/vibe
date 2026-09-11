import "server-only";

import { publicUrl } from "./email";

/**
 * O template do convite de amizade.
 *
 * E-mail não é a web. O que se pode usar aqui é o HTML de 2002: tabelas
 * para o layout, estilo em atributo `style`, larguras em pixel. Outlook
 * ignora `flex` e `grid`, o Gmail remove `<style>` em parte dos casos, e
 * várias caixas descartam `background-image`. Então tudo o que importa
 * — cor, espaçamento, alinhamento — vai inline, e nada depende de uma
 * imagem carregar.
 *
 * O tema é escuro por decisão de marca, e escuro em e-mail tem uma
 * armadilha: clientes que "ajudam" invertendo cores. A defesa é declarar
 * `color-scheme`, pintar o fundo em cada célula (não só no `<body>`) e
 * nunca deixar texto claro sem um pai escuro explícito.
 */

/** Paleta do e-mail. O azul é o da peça, não o verde do app. */
const C = {
  page: "#050608",
  card: "#0b0d12",
  panel: "#11141b",
  hairline: "#1e222c",
  ink: "#ffffff",
  ink2: "#c3c8d4",
  ink3: "#8b91a1",
  blue: "#1a7fff",
  blueInk: "#ffffff",
} as const;

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Escapa texto que vem de gente — nome, e-mail — antes de virar HTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Uma letra grande no lugar da foto, quando não há foto. */
function initial(name: string): string {
  return esc((name.trim()[0] ?? "?").toUpperCase());
}

/**
 * As quatro promessas do rodapé, como na peça.
 *
 * São células de tabela e não ícones: um SVG inline não sobrevive ao
 * Gmail, e uma imagem remota não carrega até a pessoa autorizar. O
 * caractere vem antes do rótulo e o conjunto continua legível mesmo se o
 * cliente ignorar a fonte.
 */
const PROMISES: Array<[string, string, string]> = [
  ["♪", "DESCUBRA", "NOVOS SONS"],
  ["◎", "CONECTE", "COM PESSOAS"],
  ["♡", "COMPARTILHE", "O QUE AMA"],
  ["⊕", "EXPLORE", "SEM FRONTEIRAS"],
];

function promisesRow(): string {
  const cells = PROMISES.map(
    ([glyph, top, bottom]) => `
      <td align="center" valign="top" width="25%" style="padding:0 6px;">
        <div style="font-size:20px;line-height:24px;color:${C.ink2};">${glyph}</div>
        <div style="margin-top:8px;font-family:${FONT};font-size:9px;line-height:14px;letter-spacing:1.2px;color:${C.ink3};">
          ${top}<br />${bottom}
        </div>
      </td>`,
  ).join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>`;
}

/** O wordmark em texto: a logo em imagem não carrega até ser autorizada. */
function wordmark(size = 26): string {
  return `<div style="font-family:${FONT};font-size:${size}px;line-height:${size + 4}px;font-weight:700;letter-spacing:7px;color:${C.ink};">SONA</div>
    <div style="margin-top:5px;font-family:${FONT};font-size:8px;line-height:12px;letter-spacing:3px;color:${C.ink3};">M&Uacute;SICA SEM FRONTEIRAS</div>`;
}

export type FriendInviteMail = {
  /** Quem vai receber — só o primeiro nome aparece na saudação. */
  toName: string;
  /** Quem convidou. */
  fromName: string;
  fromEmail: string;
  /** Foto do perfil, se houver; senão, a inicial. */
  fromImage: string | null;
};

/**
 * O assunto.
 *
 * Traz o nome de quem convidou porque é isso que decide se o e-mail é
 * aberto — "Você recebeu um convite" poderia ser de qualquer serviço.
 */
export function friendInviteSubject(fromName: string): string {
  return `${fromName} quer se conectar com você no Sona`;
}

/** A versão em texto puro, para quem não recebe HTML. */
export function friendInviteText(data: FriendInviteMail): string {
  const link = publicUrl("/amigos");
  return [
    `${data.fromName} quer adicionar você como amigo no Sona.`,
    "",
    `Alguém que também vive a música no Sona quer se conectar com você.`,
    "",
    `Ver convite: ${link}`,
    "",
    `Você recebeu este e-mail porque alguém enviou um convite de amizade para você no Sona.`,
  ].join("\n");
}

export function friendInviteHtml(data: FriendInviteMail): string {
  const link = publicUrl("/amigos");
  const name = esc(data.fromName);
  const handle = esc(data.fromEmail.split("@")[0]);

  // A foto entra como <img>; sem ela, um círculo com a inicial. Os dois
  // casos têm o mesmo tamanho para o cartão não mudar de altura.
  const avatar = data.fromImage
    ? `<img src="${esc(data.fromImage)}" width="96" height="96" alt="" style="display:block;width:96px;height:96px;border-radius:48px;object-fit:cover;" />`
    : // O padding é que faz o círculo, não um `height`: altura e padding
      // juntos somam em vários clientes e o círculo saía oval. Assim a
      // inicial fica centrada sem depender de `valign`, que tabela
      // aninhada costuma ignorar.
      `<table role="presentation" width="96" cellpadding="0" cellspacing="0" border="0" style="width:96px;border-radius:48px;background-color:${C.panel};">
         <tr><td align="center" style="width:96px;font-family:${FONT};font-size:34px;line-height:36px;font-weight:600;color:${C.ink2};padding:30px 0;">${initial(data.fromName)}</td></tr>
       </table>`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="dark" />
<meta name="supported-color-schemes" content="dark" />
<title>${friendInviteSubject(data.fromName)}</title>
</head>
<body style="margin:0;padding:0;background-color:${C.page};">
<!-- O preheader é o trecho que a caixa de entrada mostra ao lado do
     assunto. Escondido no corpo, ele evita que o cliente escolha
     sozinho a primeira frase solta do HTML. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  ${name} quer adicionar voc&ecirc; como amigo no Sona.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.page};">
<tr>
<td align="center" style="padding:32px 12px;">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background-color:${C.card};border:1px solid ${C.hairline};border-radius:14px;overflow:hidden;">

  <!-- topo: marca + selo -->
  <tr>
    <td style="padding:30px 34px 26px 34px;background-color:${C.card};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="left" valign="top">${wordmark()}</td>
          <td align="right" valign="top" style="font-family:${FONT};font-size:9px;line-height:17px;letter-spacing:2.4px;color:${C.ink3};">
            M&Uacute;SICA<br />CONECTA<br />PESSOAS
            <div style="margin-top:9px;height:2px;width:34px;background-color:${C.blue};font-size:0;line-height:0;">&nbsp;</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- manchete -->
  <tr>
    <td style="padding:0 34px 30px 34px;background-color:${C.card};">
      <div style="font-family:${FONT};font-size:29px;line-height:38px;font-weight:700;color:${C.ink};">
        Novas conex&otilde;es<br />tornam a m&uacute;sica<br />
        <span style="color:${C.blue};">ainda mais especial.</span>
      </div>
      <div style="margin-top:16px;font-family:${FONT};font-size:14px;line-height:23px;color:${C.ink2};">
        No Sona, voc&ecirc; se conecta com pessoas<br />que compartilham os mesmos sons,<br />hist&oacute;rias e sentimentos.
      </div>
      <div style="margin-top:20px;height:2px;width:58px;background-color:${C.blue};font-size:0;line-height:0;">&nbsp;</div>
    </td>
  </tr>

  <tr><td style="padding:0 34px;background-color:${C.card};"><div style="height:1px;background-color:${C.hairline};font-size:0;line-height:0;">&nbsp;</div></td></tr>

  <!-- o convite -->
  <tr>
    <td align="center" style="padding:38px 34px 0 34px;background-color:${C.card};">
      <table role="presentation" width="58" cellpadding="0" cellspacing="0" border="0" style="width:58px;border:1px solid ${C.blue};border-radius:15px;">
        <!-- A silhueta de duas pessoas, pedida em apresentação de texto
             (VS15) para vir monocromática em vez de emoji colorido. O
             padding centra sem depender de valign, que tabela aninhada
             costuma ignorar. -->
        <tr><td align="center" style="width:58px;font-family:${FONT};font-size:23px;line-height:24px;color:${C.blue};padding:17px 0;">&#128101;&#65038;</td></tr>
      </table>

      <div style="margin-top:24px;font-family:${FONT};font-size:27px;line-height:35px;font-weight:700;color:${C.ink};">
        Voc&ecirc; recebeu um<br />convite de amizade!
      </div>
      <div style="margin-top:14px;font-family:${FONT};font-size:14px;line-height:23px;color:${C.ink2};">
        Algu&eacute;m que tamb&eacute;m vive a m&uacute;sica no Sona<br />quer se conectar com voc&ecirc;.
      </div>
    </td>
  </tr>

  <!-- cartão de quem convidou -->
  <tr>
    <td style="padding:28px 34px 0 34px;background-color:${C.card};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.panel};border:1px solid ${C.hairline};border-radius:12px;">
        <tr>
          <td valign="middle" style="padding:20px;width:96px;">${avatar}</td>
          <td valign="middle" style="padding:20px 20px 20px 0;">
            <div style="font-family:${FONT};font-size:17px;line-height:23px;font-weight:600;color:${C.ink};">${name}</div>
            <div style="margin-top:3px;font-family:${FONT};font-size:14px;line-height:20px;color:${C.ink3};">@${handle}</div>
            <div style="margin-top:9px;font-family:${FONT};font-size:14px;line-height:21px;color:${C.ink2};">
              Quer adicionar voc&ecirc; como amigo no Sona.
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ações -->
  <tr>
    <td align="center" style="padding:26px 34px 0 34px;background-color:${C.card};">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
        <tr>
          <td align="center" bgcolor="${C.blue}" style="border-radius:26px;">
            <a href="${link}" style="display:block;padding:15px 24px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:600;color:${C.blueInk};text-decoration:none;border-radius:26px;">
              Ver convite &nbsp;&rarr;
            </a>
          </td>
        </tr>
      </table>
      <div style="margin-top:16px;font-family:${FONT};font-size:13px;line-height:20px;">
        <a href="${link}" style="color:${C.blue};text-decoration:none;">Agora n&atilde;o</a>
      </div>
    </td>
  </tr>

  <!-- promessas -->
  <tr>
    <td style="padding:30px 30px 0 30px;background-color:${C.card};">
      <div style="height:1px;background-color:${C.hairline};font-size:0;line-height:0;">&nbsp;</div>
      <div style="padding:24px 0 4px 0;">${promisesRow()}</div>
    </td>
  </tr>

  <!-- rodapé -->
  <tr>
    <td style="padding:8px 34px 30px 34px;background-color:${C.card};">
      <div style="height:1px;background-color:${C.hairline};font-size:0;line-height:0;">&nbsp;</div>
      <div style="padding-top:24px;">${wordmark(19)}</div>
      <div style="margin-top:20px;font-family:${FONT};font-size:11px;line-height:18px;color:${C.ink3};">
        Voc&ecirc; recebeu este e-mail porque algu&eacute;m enviou um convite de
        amizade para voc&ecirc; no Sona.
      </div>
      <div style="margin-top:10px;font-family:${FONT};font-size:11px;line-height:18px;color:${C.ink3};">
        <a href="${publicUrl("/amigos")}" style="color:${C.blue};text-decoration:none;">Central de Ajuda</a>
        &nbsp;&middot;&nbsp;
        <a href="${publicUrl("/")}" style="color:${C.blue};text-decoration:none;">Pol&iacute;tica de Privacidade</a>
        &nbsp;&middot;&nbsp;
        <a href="${publicUrl("/")}" style="color:${C.blue};text-decoration:none;">Termos de Uso</a>
      </div>
      <div style="margin-top:10px;font-family:${FONT};font-size:11px;line-height:18px;color:${C.ink3};">
        &copy; ${new Date().getFullYear()} Sona. Todos os direitos reservados.
      </div>
    </td>
  </tr>

</table>

</td>
</tr>
</table>
</body>
</html>`;
}
