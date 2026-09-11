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

/**
 * Invalida só o que a amizade de fato muda.
 *
 * Era `revalidatePath("/", "layout")`, que derrubava a árvore inteira: o
 * layout do cliente relê catálogo, jam, convites e presença, e devolve
 * objetos novos para todos os providers — que adotam por identidade e
 * re-renderizam a aplicação inteira duas vezes por clique. Aceitar um
 * pedido não mexe no catálogo nem no jam; marcar as duas rotas que
 * mostram amizade deixa o resto do cache de pé.
 *
 * As actions ainda devolvem o estado novo junto da resposta, então a tela
 * não espera por esta revalidação para se atualizar — ela existe para as
 * *outras* abas e para a próxima navegação.
 */
function refresh() {
  revalidatePath("/amigos");
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

  return matches.slice(0, 12).map((u) => ({
    user: toPublicUser(u),
    relation: relationTo(db, me.id, u.id),
  }));
}

/* ------------------------------------------------------------------ */
/* Diretório — todo mundo que já entrou                                */
/* ------------------------------------------------------------------ */

/**
 * Quantas pessoas por página.
 *
 * Fica privado porque um arquivo `"use server"` só exporta funções
 * assíncronas — o tamanho viaja dentro de `PeoplePage`, que é onde a
 * tela precisa dele para contar "11–20 de 34".
 */
const DIRECTORY_PAGE_SIZE = 10;

/**
 * Uma pessoa no diretório.
 *
 * O e-mail sai do tipo, e não é apenas apagado do valor: a tela não tem
 * como mostrar por engano um campo que não existe, e quem ler o tipo
 * descobre a regra sem precisar achar o comentário.
 */
export type DirectoryPerson = {
  user: Omit<PublicUser, "email">;
  relation: PersonResult["relation"];
};

/** Uma página do diretório, com o bastante para desenhar os controles. */
export type PeoplePage = {
  people: DirectoryPerson[];
  /** Página pedida, começando em 0 — devolvida já corrigida. */
  page: number;
  /** Quantas páginas existem ao todo. */
  pages: number;
  /** Total de pessoas na plataforma, tirando você. */
  total: number;
  /** Tamanho da página, para a tela contar "11–20 de 34" sem adivinhar. */
  pageSize: number;
};

/**
 * Todo mundo que já entrou na plataforma, de dez em dez.
 *
 * A busca resolve quem você já sabe procurar; isto resolve quem você
 * ainda não sabe que existe — e é por isso que a lista não pode começar
 * vazia esperando um nome digitado.
 *
 * A ordem é a de chegada, mais novos primeiro. Ordenar por nome
 * enterraria quem acabou de criar a conta no meio do alfabeto, que é
 * justamente quem tem mais chance de estar sendo procurado agora.
 *
 * O e-mail não vem junto. Na busca ele aparece porque quem digitou o
 * endereço inteiro já o conhecia; aqui a lista chega sem ninguém ter
 * perguntado nada, e devolver o endereço de todo mundo transformaria a
 * tela de amigos num catálogo de e-mails. A data de entrada basta para
 * distinguir dois homônimos.
 */
export async function readPeopleDirectory(
  page = 0,
): Promise<PeoplePage> {
  const me = await currentUser();
  if (!me) {
    return {
      people: [],
      page: 0,
      pages: 0,
      total: 0,
      pageSize: DIRECTORY_PAGE_SIZE,
    };
  }

  const db = await readDb();

  // Mais recentes primeiro: `db.users` chega ordenado por `created_at`
  // crescente, então basta virar.
  const others = db.users.filter((u) => u.id !== me.id).reverse();

  const total = others.length;
  const pages = Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE));
  // A página é corrigida aqui, e não no cliente: apagar uma conta pode
  // encolher a lista embaixo de quem está na última página, e pedir uma
  // que não existe mais deve trazer a última — nunca uma tela em branco.
  const at = Math.min(Math.max(page, 0), pages - 1);
  const start = at * DIRECTORY_PAGE_SIZE;

  const people = others
    .slice(start, start + DIRECTORY_PAGE_SIZE)
    .map((u): DirectoryPerson => {
      const { email: _email, ...user } = toPublicUser(u);
      void _email;
      return { user, relation: relationTo(db, me.id, u.id) };
    });

  return { people, page: at, pages, total, pageSize: DIRECTORY_PAGE_SIZE };
}

/**
 * Em que pé você está com alguém.
 *
 * Vive à parte porque a busca e o diretório fazem a mesma pergunta, e
 * duas cópias da mesma escada de `if` acabariam discordando no dia em
 * que um estado novo aparecesse.
 */
function relationTo(
  db: Awaited<ReturnType<typeof readDb>>,
  meId: string,
  otherId: string,
): PersonResult["relation"] {
  const link = friendshipBetween(db, meId, otherId);
  if (!link) return "none";
  if (link.status === "accepted") return "friends";
  return link.requesterId === meId ? "sent" : "received";
}

/* ------------------------------------------------------------------ */
/* Pedidos                                                             */
/* ------------------------------------------------------------------ */

/**
 * O que uma escrita de amizade devolve.
 *
 * Junto do resultado vem o estado novo — as três caixas da tela e a
 * página do diretório que quem chamou estava vendo. Antes a tela pedia
 * isso numa segunda viagem (`router.refresh()` + uma releitura), e as
 * duas chegavam depois de o clique já ter parecido travado. Tudo sai da
 * mesma requisição, que já tem o `readDb` memoizado quente.
 */
export type FriendsMutation = ActionState & {
  view: FriendsView;
  /** Só quando quem chamou pediu uma página do diretório. */
  directory?: PeoplePage;
};

/**
 * Fecha uma escrita: revalida e lê de volta o estado que a tela precisa.
 *
 * `page` é a página do diretório que a tela está mostrando; quem não
 * mostra diretório nenhum não paga por ele.
 */
async function settle(
  state: ActionState,
  page?: number,
): Promise<FriendsMutation> {
  refresh();
  const [view, directory] = await Promise.all([
    readFriends(),
    page === undefined ? undefined : readPeopleDirectory(page),
  ]);
  return { ...state, view, directory };
}

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
  page?: number,
): Promise<FriendsMutation> {
  try {
    const me = await currentUser();
    if (!me) return settle({ ok: false, message: "Faça login para continuar." }, page);
    if (targetId === me.id) {
      return settle({ ok: false, message: "Você já é sua melhor companhia." }, page);
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
      return settle({ ok: false, message: "Pessoa não encontrada." }, page);
    }
    if (result === "already") {
      return settle({ ok: false, message: "Vocês já são amigos." }, page);
    }
    if (result === "pending") {
      return settle(
        { ok: true, message: "Pedido já enviado — aguardando resposta." },
        page,
      );
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

    return settle(
      {
        ok: true,
        message:
          result === "accepted" ? "Agora vocês são amigos." : "Pedido enviado.",
      },
      page,
    );
  } catch (e) {
    return settle(fail(e), page);
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
  page?: number,
): Promise<FriendsMutation> {
  try {
    const me = await currentUser();
    if (!me) return settle({ ok: false, message: "Faça login para continuar." }, page);

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

    if (!ok) {
      return settle({ ok: false, message: "Este pedido não está mais aqui." }, page);
    }

    return settle({ ok: true, message: "Agora vocês são amigos." }, page);
  } catch (e) {
    return settle(fail(e), page);
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
  page?: number,
): Promise<FriendsMutation> {
  try {
    const me = await currentUser();
    if (!me) return settle({ ok: false, message: "Faça login para continuar." }, page);

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

    if (!removed) return settle({ ok: false, message: "Nada a desfazer." }, page);

    return settle(
      {
        ok: true,
        message:
          removed.status === "accepted"
            ? "Amizade desfeita."
            : removed.requesterId === me.id
              ? "Pedido cancelado."
              : "Pedido recusado.",
      },
      page,
    );
  } catch (e) {
    return settle(fail(e), page);
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
