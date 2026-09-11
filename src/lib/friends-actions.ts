"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "./auth";
import {
  friendEdges,
  friendshipBetween,
  mutate,
  readDb,
  toPublicUser,
} from "./db";
import { foldText } from "./utils";
import { sendMail } from "./email";
import {
  friendInviteHtml,
  friendInviteSubject,
  friendInviteText,
} from "./email-templates";
import type { ActionState } from "./actions";
import type { FriendEdge, PublicUser } from "./types";

/**
 * Amigos.
 *
 * A relação é guardada uma vez só, no sentido em que o convite partiu
 * (`requesterId` → `addresseeId`). Toda leitura olha os dois lados do par,
 * e toda escrita começa procurando a linha em qualquer sentido — é o que
 * impede duas pessoas de se convidarem ao mesmo tempo e acabarem com duas
 * amizades discordando uma da outra.
 */

function refresh() {
  revalidatePath("/", "layout");
}

function fail(e: unknown): ActionState {
  console.error(e);
  return { ok: false, message: "Algo deu errado. Tente novamente." };
}

/* ------------------------------------------------------------------ */
/* Busca de pessoas                                                    */
/* ------------------------------------------------------------------ */

/** Uma pessoa no resultado da busca, com a relação que já existe. */
export type PersonResult = {
  user: PublicUser;
  /** `none` quando ainda não há nada entre vocês. */
  relation: "none" | "friends" | "sent" | "received";
};

/**
 * Procura gente pelo nome ou pelo e-mail.
 *
 * O e-mail só casa inteiro, nunca por pedaço: buscar "gmail" não pode
 * devolver a plataforma inteira, e um prefixo permitiria adivinhar
 * endereços letra a letra. O nome, esse sim, casa por trecho — é como
 * as pessoas se procuram de fato.
 */
export async function searchPeople(query: string): Promise<PersonResult[]> {
  const me = await currentUser();
  if (!me) return [];

  const q = query.trim();
  if (q.length < 2) return [];

  const db = await readDb();
  const needle = foldText(q);

  const matches = db.users.filter((u) => {
    if (u.id === me.id) return false;
    return foldText(u.name).includes(needle) || foldText(u.email) === needle;
  });

  return matches.slice(0, 12).map((u) => {
    const link = friendshipBetween(db, me.id, u.id);
    const relation: PersonResult["relation"] = !link
      ? "none"
      : link.status === "accepted"
        ? "friends"
        : link.requesterId === me.id
          ? "sent"
          : "received";

    return { user: toPublicUser(u), relation };
  });
}

/* ------------------------------------------------------------------ */
/* Pedidos                                                             */
/* ------------------------------------------------------------------ */

/**
 * Envia um pedido de amizade.
 *
 * Se a outra pessoa já tinha convidado você, o pedido não vira um segundo
 * convite: ele aceita o que já existia. É o que a pessoa quis dizer ao
 * clicar, e evita o par ficar com dois pedidos cruzados esperando um pelo
 * outro para sempre.
 */
export async function sendFriendRequest(
  targetId: string,
): Promise<ActionState> {
  try {
    const me = await currentUser();
    if (!me) return { ok: false, message: "Faça login para continuar." };
    if (targetId === me.id) {
      return { ok: false, message: "Você já é sua melhor companhia." };
    }

    // O destinatário é capturado dentro da transação e usado depois, já
    // fora dela: o e-mail é uma consequência do convite ter sido criado,
    // e não pode rodar enquanto a escrita está aberta.
    let recipient: { email: string; name: string } | null = null;

    const result = await mutate((db) => {
      const target = db.users.find((u) => u.id === targetId);
      if (!target) return "missing" as const;
      recipient = { email: target.email, name: target.name };

      const existing = friendshipBetween(db, me.id, targetId);
      if (existing?.status === "accepted") return "already" as const;

      if (existing) {
        // Convites cruzados: quem clica por último está aceitando.
        if (existing.addresseeId === me.id) {
          existing.status = "accepted";
          existing.acceptedAt = new Date().toISOString();
          return "accepted" as const;
        }
        return "pending" as const;
      }

      db.friendships.push({
        requesterId: me.id,
        addresseeId: targetId,
        status: "pending",
        createdAt: new Date().toISOString(),
        acceptedAt: null,
      });
      return "sent" as const;
    });

    if (result === "missing") {
      return { ok: false, message: "Pessoa não encontrada." };
    }
    if (result === "already") {
      return { ok: false, message: "Vocês já são amigos." };
    }
    if (result === "pending") {
      return { ok: true, message: "Pedido já enviado — aguardando resposta." };
    }

    /**
     * O aviso por e-mail.
     *
     * Só quando um pedido *novo* nasce: aceitar um convite cruzado
     * (`accepted`) não é um convite chegando, e mandar "fulano quer se
     * conectar" para quem acabou de ser aceito seria mentira.
     *
     * O `await` é de propósito, apesar de a resposta não depender dele:
     * numa server action o processo pode ser encerrado assim que ela
     * retorna, e um envio solto morreria pela metade. `sendFriendRequest`
     * engole os próprios erros, então esperar não arrisca o convite —
     * que a esta altura já está gravado.
     */
    if (result === "sent" && recipient) {
      await notifyFriendRequest(recipient, me);
    }

    refresh();
    return {
      ok: true,
      message:
        result === "accepted" ? "Agora vocês são amigos." : "Pedido enviado.",
    };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Manda o e-mail de convite.
 *
 * Isolado numa função à parte, e com o `try` próprio, porque a regra
 * aqui é dura: nada do que acontecer neste caminho pode transformar um
 * convite bem-sucedido em erro na tela de quem convidou. A amizade já
 * está no banco; o e-mail é um extra que pode falhar em silêncio.
 */
async function notifyFriendRequest(
  to: { email: string; name: string },
  from: { name: string; email: string; image: string | null },
): Promise<void> {
  try {
    const payload = {
      toName: to.name,
      fromName: from.name,
      fromEmail: from.email,
      fromImage: from.image,
    };

    await sendMail({
      to: to.email,
      subject: friendInviteSubject(from.name),
      html: friendInviteHtml(payload),
      text: friendInviteText(payload),
    });
  } catch (e) {
    console.error("[sona:email] convite de amizade não enviado", e);
  }
}

/** Aceita um pedido recebido. Só o destinatário pode aceitar. */
export async function acceptFriendRequest(
  requesterId: string,
): Promise<ActionState> {
  try {
    const me = await currentUser();
    if (!me) return { ok: false, message: "Faça login para continuar." };

    const ok = await mutate((db) => {
      const link = db.friendships.find(
        (f) =>
          f.requesterId === requesterId &&
          f.addresseeId === me.id &&
          f.status === "pending",
      );
      if (!link) return false;
      link.status = "accepted";
      link.acceptedAt = new Date().toISOString();
      return true;
    });

    if (!ok) return { ok: false, message: "Este pedido não está mais aqui." };

    refresh();
    return { ok: true, message: "Agora vocês são amigos." };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Recusa um pedido, cancela um que você enviou, ou desfaz uma amizade.
 *
 * As três ações apagam a mesma linha, então dividi-las em três actions
 * daria só três nomes para a mesma escrita. Quem chama decide o texto
 * que a tela mostra.
 */
export async function removeFriendship(
  otherId: string,
): Promise<ActionState> {
  try {
    const me = await currentUser();
    if (!me) return { ok: false, message: "Faça login para continuar." };

    const removed = await mutate((db) => {
      const i = db.friendships.findIndex(
        (f) =>
          (f.requesterId === me.id && f.addresseeId === otherId) ||
          (f.requesterId === otherId && f.addresseeId === me.id),
      );
      if (i < 0) return null;
      const [gone] = db.friendships.splice(i, 1);
      return gone;
    });

    if (!removed) return { ok: false, message: "Nada a desfazer." };

    refresh();
    return {
      ok: true,
      message:
        removed.status === "accepted"
          ? "Amizade desfeita."
          : removed.requesterId === me.id
            ? "Pedido cancelado."
            : "Pedido recusado.",
    };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------------------------------ */
/* Leitura                                                             */
/* ------------------------------------------------------------------ */

/** As três caixas da tela de amigos, prontas para renderizar. */
export type FriendsView = {
  friends: FriendEdge[];
  incoming: FriendEdge[];
  outgoing: FriendEdge[];
};

export async function readFriends(): Promise<FriendsView> {
  const me = await currentUser();
  if (!me) return { friends: [], incoming: [], outgoing: [] };

  const db = await readDb();
  const edges = friendEdges(db, me.id);
  const byName = (a: FriendEdge, b: FriendEdge) =>
    a.user.name.localeCompare(b.user.name, "pt-BR");

  return {
    friends: edges.filter((e) => e.status === "accepted").sort(byName),
    incoming: edges
      .filter((e) => e.status === "pending" && e.direction === "incoming")
      .sort(byName),
    outgoing: edges
      .filter((e) => e.status === "pending" && e.direction === "outgoing")
      .sort(byName),
  };
}
