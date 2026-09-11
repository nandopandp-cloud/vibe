"use server";

import { currentUser } from "./auth";
import {
  appendToJamQueue,
  deleteJamInvite,
  endJam,
  findJam,
  findJamByCode,
  findJamForUser,
  friendIds,
  insertJam,
  insertJamInvite,
  joinJam,
  leaveJam,
  pendingInvitesFor,
  readDb,
  readJamSnapshot,
  removeFromJamQueue,
  replaceJamQueue,
  touchJamMember,
  updateJamPlayback,
} from "./db";
import type { ActionState } from "./actions";
import type { HydratedJamInvite, JamSnapshot } from "./types";

/**
 * Jam — escutar junto.
 *
 * O modelo é de um relógio só: o host manda a posição da música ao
 * servidor de tempos em tempos, e os convidados leem esse relógio. Nada
 * aqui tenta acertar o instante exato em que cada um ouve — o que se
 * mantém é a *deriva* pequena, e para isso basta que todo pacote diga de
 * quando ele fala (`positionAt`), e não apenas o que ele viu.
 *
 * Quem controla a reprodução é só o host. Enfileirar, isso qualquer um
 * pode: é o que torna a sala uma conversa, e não uma transmissão.
 */

function fail(e: unknown): ActionState {
  console.error(e);
  return { ok: false, message: "Algo deu errado. Tente novamente." };
}

const DENY_ANON: ActionState = {
  ok: false,
  message: "Faça login para continuar.",
};

/* ------------------------------------------------------------------ */
/* Abrir, entrar e sair                                                */
/* ------------------------------------------------------------------ */

export type JamResult =
  | { ok: true; jamId: string; code: string }
  | { ok: false; message: string };

/**
 * Abre um jam.
 *
 * A fila inicial é o que estiver tocando no player de quem abriu — quem
 * cria uma sala quase sempre já está ouvindo alguma coisa, e começar do
 * silêncio obrigaria a escolher tudo de novo.
 */
export async function createJam(input: {
  name?: string;
  trackIds?: string[];
  index?: number;
}): Promise<JamResult> {
  try {
    const me = await currentUser();
    if (!me) return { ok: false, message: DENY_ANON.message };

    // Ninguém participa de dois jams: o player é um só. Abrir um novo
    // encerra o antigo se você era o host, e apenas o deixa se não era.
    const previous = await findJamForUser(me.id);
    if (previous) {
      if (previous.hostId === me.id) await endJam(previous.id);
      else await leaveJam(previous.id, me.id);
    }

    const db = await readDb();
    // Ids de faixas que não existem mais não entram na fila.
    const known = new Set(db.tracks.map((t) => t.id));
    const queue = (input.trackIds ?? []).filter((id) => known.has(id));

    const first = input.index ?? 0;
    const index = queue.length === 0 ? -1 : Math.min(Math.max(first, 0), queue.length - 1);

    const jam = await insertJam({
      hostId: me.id,
      name: input.name?.trim() || `Jam de ${me.name.split(" ")[0]}`,
      queue,
      index,
    });

    return { ok: true, jamId: jam.id, code: jam.code };
  } catch (e) {
    const res = fail(e);
    return { ok: false, message: res.message };
  }
}

/** Entra num jam pelo código do link. */
export async function joinJamByCode(code: string): Promise<JamResult> {
  try {
    const me = await currentUser();
    if (!me) return { ok: false, message: DENY_ANON.message };

    const jam = await findJamByCode(code.trim());
    if (!jam) {
      return { ok: false, message: "Este jam não existe ou já terminou." };
    }

    // Sair do anterior antes de entrar no novo, pelo mesmo motivo de
    // `createJam`: um player, um jam.
    const previous = await findJamForUser(me.id);
    if (previous && previous.id !== jam.id) {
      if (previous.hostId === me.id) await endJam(previous.id);
      else await leaveJam(previous.id, me.id);
    }

    await joinJam(jam.id, me.id);
    return { ok: true, jamId: jam.id, code: jam.code };
  } catch (e) {
    const res = fail(e);
    return { ok: false, message: res.message };
  }
}

/**
 * Sai do jam. Se quem sai é o host, o jam acaba para todos — sem ele não
 * há relógio, e uma sala parada no meio de uma música é pior que uma
 * despedida clara.
 */
export async function leaveCurrentJam(jamId: string): Promise<ActionState> {
  try {
    const me = await currentUser();
    if (!me) return DENY_ANON;

    const jam = await findJam(jamId);
    if (!jam) return { ok: true, message: "Este jam já tinha terminado." };

    if (jam.hostId === me.id) {
      await endJam(jam.id);
      return { ok: true, message: "Jam encerrado." };
    }

    await leaveJam(jam.id, me.id);
    return { ok: true, message: "Você saiu do jam." };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------------------------------ */
/* Convites                                                            */
/* ------------------------------------------------------------------ */

/** Convida um amigo. Só amigos são convidáveis — o link cobre o resto. */
export async function inviteFriendToJam(
  jamId: string,
  friendId: string,
): Promise<ActionState> {
  try {
    const me = await currentUser();
    if (!me) return DENY_ANON;

    const jam = await findJam(jamId);
    if (!jam) return { ok: false, message: "Este jam já terminou." };

    // Qualquer participante convida; a sala é de todos que estão nela.
    const snapshot = await readJamSnapshot(jam.id, me.id);
    if (!snapshot?.participants.some((p) => p.id === me.id)) {
      return { ok: false, message: "Você não está neste jam." };
    }
    if (snapshot.participants.some((p) => p.id === friendId)) {
      return { ok: false, message: "Esta pessoa já está no jam." };
    }

    const db = await readDb();
    if (!friendIds(db, me.id).includes(friendId)) {
      return { ok: false, message: "Vocês ainda não são amigos." };
    }

    await insertJamInvite({ jamId: jam.id, fromId: me.id, toId: friendId });
    return { ok: true, message: "Convite enviado." };
  } catch (e) {
    return fail(e);
  }
}

/** Recusa um convite — ele some do sino de quem recebeu. */
export async function declineJamInvite(jamId: string): Promise<ActionState> {
  try {
    const me = await currentUser();
    if (!me) return DENY_ANON;
    await deleteJamInvite(jamId, me.id);
    return { ok: true, message: "Convite dispensado." };
  } catch (e) {
    return fail(e);
  }
}

/** Convites pendentes de quem está pedindo — alimenta o sino. */
export async function readMyJamInvites(): Promise<HydratedJamInvite[]> {
  const me = await currentUser();
  if (!me) return [];
  const db = await readDb();
  return pendingInvitesFor(db, me.id);
}

/* ------------------------------------------------------------------ */
/* Reprodução                                                          */
/* ------------------------------------------------------------------ */

/**
 * O host reporta onde está.
 *
 * Chamada a cada poucos segundos e a cada play/pause/seek. Não devolve
 * nada: o convidado descobre o novo estado no próximo polling, e esperar
 * uma resposta aqui só atrasaria o player de quem está no comando.
 */
export async function reportJamPlayback(input: {
  jamId: string;
  index: number;
  position: number;
  playing: boolean;
  /** Id da faixa que o host tem em `index` — o servidor confere. */
  trackId?: string;
}): Promise<void> {
  try {
    const me = await currentUser();
    if (!me) return;

    const jam = await findJam(input.jamId);
    // Só o host move o relógio. Um convidado que tentasse reportar
    // arrastaria a sala inteira para o tempo dele.
    if (!jam || jam.hostId !== me.id) return;

    /**
     * O índice sozinho é uma coordenada sem mapa: se a fila do servidor
     * mudou entre o clique do host e este pacote, o mesmo número aponta
     * para outra música e a sala pula para algo que ninguém escolheu.
     * O id acompanha o índice justamente para o servidor poder recusar —
     * ou reencontrar — a posição certa.
     */
    let index = input.index;
    if (input.trackId) {
      if (jam.queue[index] !== input.trackId) {
        const found = jam.queue.indexOf(input.trackId);
        // Faixa que nem está mais na fila do jam: o host acabou de trocar
        // de álbum e `setJamQueue` ainda não chegou. Descartar é melhor
        // que mover a sala com um índice que já não quer dizer nada.
        if (found < 0) return;
        index = found;
      }
    }

    await updateJamPlayback(jam.id, {
      index,
      position: Math.max(0, input.position),
      // O instante é medido aqui, no servidor: relógios de navegador
      // discordam entre si em segundos, e a conta do convidado é feita
      // contra este mesmo relógio.
      positionAt: Date.now(),
      playing: input.playing,
    });
  } catch (e) {
    console.error(e);
  }
}

/**
 * Troca a fila inteira — o host começou um álbum, uma playlist, ou
 * reordenou o que vem depois.
 *
 * É o que faltava para o host poder *escolher outra música* durante o
 * jam: sem esta chamada, clicar numa faixa trocava só o player dele, e o
 * índice reportado depois apontava para outra coisa dentro da fila
 * antiga que o servidor ainda guardava — a sala inteira pulava para uma
 * música que ninguém escolheu.
 */
export async function setJamQueue(input: {
  jamId: string;
  trackIds: string[];
  index: number;
  position?: number;
  playing?: boolean;
}): Promise<ActionState> {
  try {
    const me = await currentUser();
    if (!me) return DENY_ANON;

    const jam = await findJam(input.jamId);
    if (!jam) return { ok: false, message: "Este jam já terminou." };
    if (jam.hostId !== me.id) {
      return { ok: false, message: "Só quem abriu o jam troca a fila." };
    }

    const db = await readDb();
    const known = new Set(db.tracks.map((t) => t.id));
    const queue = input.trackIds.filter((id) => known.has(id));
    if (queue.length === 0) {
      return { ok: false, message: "Nenhuma faixa válida na seleção." };
    }

    await replaceJamQueue(
      jam.id,
      queue,
      Math.min(Math.max(input.index, 0), queue.length - 1),
      { position: input.position, playing: input.playing },
    );
    return { ok: true, message: "Fila atualizada." };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Move uma faixa da fila para logo depois da que toca — "tocar a
 * seguir". Qualquer participante pode: escolher a ordem é a parte da
 * sala que se conversa, e não a que se comanda.
 */
export async function moveJamTrackNext(
  jamId: string,
  trackId: string,
): Promise<ActionState> {
  try {
    const me = await currentUser();
    if (!me) return DENY_ANON;

    const jam = await findJam(jamId);
    if (!jam) return { ok: false, message: "Este jam já terminou." };

    const snapshot = await readJamSnapshot(jam.id, me.id);
    if (!snapshot?.participants.some((p) => p.id === me.id)) {
      return { ok: false, message: "Você não está neste jam." };
    }

    const from = jam.queue.indexOf(trackId);
    if (from < 0) return { ok: false, message: "Faixa não está na fila." };

    const at = Math.max(jam.index, 0);
    const target = at + 1;
    if (from === at) return { ok: true, message: "Essa já está tocando." };
    if (from === target) return { ok: true, message: "Já é a próxima." };

    // Tira e recoloca: a posição de destino é calculada na lista já sem a
    // faixa, senão mover para trás erraria por um.
    const rest = jam.queue.filter((id) => id !== trackId);
    const currentId = jam.queue[at];
    const insertAt = currentId ? rest.indexOf(currentId) + 1 : 0;
    rest.splice(insertAt, 0, trackId);

    await replaceJamQueue(jam.id, rest, rest.indexOf(currentId ?? trackId), {
      // Reordenar não mexe em quem toca: a música atual segue de onde
      // estava, com a deriva que o polling já sabe corrigir.
      position: jam.position + (jam.playing ? (Date.now() - jam.positionAt) / 1000 : 0),
      playing: jam.playing,
    });

    return { ok: true, message: "Toca a seguir." };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Reordena a fila. Qualquer participante pode.
 *
 * Recebe a ordem desejada como lista de ids em vez de "mova X para a
 * posição N": duas pessoas arrastando ao mesmo tempo produziriam
 * índices que já não querem dizer nada quando chegam. Com a lista
 * inteira, a última a chegar simplesmente vence, e ninguém fica com uma
 * fila embaralhada por um meio-termo que nenhum dos dois pediu.
 *
 * A faixa que toca é ancorada aqui, no servidor: ela continua sendo a
 * atual independentemente de para onde o arrasto a tenha empurrado na
 * tela de quem mexeu.
 */
export async function reorderJamQueue(
  jamId: string,
  trackIds: string[],
): Promise<ActionState> {
  try {
    const me = await currentUser();
    if (!me) return DENY_ANON;

    const jam = await findJam(jamId);
    if (!jam) return { ok: false, message: "Este jam já terminou." };

    const snapshot = await readJamSnapshot(jam.id, me.id);
    if (!snapshot?.participants.some((p) => p.id === me.id)) {
      return { ok: false, message: "Você não está neste jam." };
    }

    // A ordem que chega é uma *permutação* da fila, nunca uma fila nova:
    // aceitar ids de fora daqui deixaria um reordenar virar um "troque
    // tudo", que é outra permissão.
    const known = new Set(jam.queue);
    const seen = new Set<string>();
    const next = trackIds.filter(
      (id) => known.has(id) && !seen.has(id) && (seen.add(id), true),
    );
    // O que o cliente não mencionou (porque chegou entre o arrasto e o
    // envio) continua na fila, no fim — perder faixa por atraso de rede
    // seria pior que uma ordem imperfeita.
    for (const id of jam.queue) if (!seen.has(id)) next.push(id);

    const playingId = jam.queue[Math.max(jam.index, 0)];
    const at = playingId ? next.indexOf(playingId) : 0;

    await replaceJamQueue(jam.id, next, Math.max(at, 0), {
      // Reordenar não é trocar de faixa: a atual segue de onde está.
      position:
        jam.position + (jam.playing ? (Date.now() - jam.positionAt) / 1000 : 0),
      playing: jam.playing,
    });

    return { ok: true, message: "Fila reordenada." };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Pula direto para uma faixa da fila. Só o host — é o relógio dele que a
 * sala segue, e dois ponteiros discordando soaria como um corte.
 */
export async function jumpJamToTrack(
  jamId: string,
  trackId: string,
): Promise<ActionState> {
  try {
    const me = await currentUser();
    if (!me) return DENY_ANON;

    const jam = await findJam(jamId);
    if (!jam) return { ok: false, message: "Este jam já terminou." };
    if (jam.hostId !== me.id) {
      return { ok: false, message: "Só quem abriu o jam troca a faixa." };
    }

    const at = jam.queue.indexOf(trackId);
    if (at < 0) return { ok: false, message: "Faixa não está na fila." };

    await replaceJamQueue(jam.id, jam.queue, at, {
      position: 0,
      playing: true,
    });
    return { ok: true, message: "Tocando agora." };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Põe faixas no fim da fila. Qualquer participante pode — é a parte
 * colaborativa do jam.
 */
export async function addToJamQueue(
  jamId: string,
  trackIds: string[],
): Promise<ActionState> {
  try {
    const me = await currentUser();
    if (!me) return DENY_ANON;

    const jam = await findJam(jamId);
    if (!jam) return { ok: false, message: "Este jam já terminou." };

    const snapshot = await readJamSnapshot(jam.id, me.id);
    if (!snapshot?.participants.some((p) => p.id === me.id)) {
      return { ok: false, message: "Você não está neste jam." };
    }

    const db = await readDb();
    const known = new Set(db.tracks.map((t) => t.id));
    const wanted = trackIds.filter((id) => known.has(id));
    if (wanted.length === 0) {
      return { ok: false, message: "Faixa não encontrada." };
    }

    const before = jam.queue.length;
    const after = await appendToJamQueue(jam.id, wanted);
    const added = after - before;

    return {
      ok: true,
      message:
        added <= 0
          ? "Essa faixa já está na fila."
          : added === 1
            ? "Faixa adicionada ao jam."
            : `${added} faixas adicionadas ao jam.`,
    };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Tira uma faixa da fila. Qualquer participante pode.
 *
 * A fila é uma lista que as pessoas da sala montam juntas, e uma lista
 * colaborativa em que só um lado apaga não é colaborativa: quem
 * acrescentou por engano ficaria dependendo do host para desfazer.
 *
 * A que está tocando é a exceção, e não por hierarquia — tirar o chão de
 * quem está no ar cortaria o áudio de todo mundo. Para passar adiante
 * existe "próxima", que é o host quem dá.
 */
export async function removeFromJam(
  jamId: string,
  trackId: string,
): Promise<ActionState> {
  try {
    const me = await currentUser();
    if (!me) return DENY_ANON;

    const jam = await findJam(jamId);
    if (!jam) return { ok: false, message: "Este jam já terminou." };

    const snapshot = await readJamSnapshot(jam.id, me.id);
    if (!snapshot?.participants.some((p) => p.id === me.id)) {
      return { ok: false, message: "Você não está neste jam." };
    }

    if (jam.queue[Math.max(jam.index, 0)] === trackId) {
      return { ok: false, message: "Esta faixa está tocando agora." };
    }

    await removeFromJamQueue(jam.id, trackId);
    return { ok: true, message: "Faixa removida." };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------------------------------ */
/* Leitura                                                             */
/* ------------------------------------------------------------------ */

/**
 * O estado do jam para o cliente, e ao mesmo tempo um sinal de presença.
 *
 * As duas coisas andam juntas de propósito: quem está lendo o jam está
 * ouvindo, então o próprio polling é o que mantém a bolinha verde acesa,
 * sem uma segunda chamada só para dizer "ainda estou aqui".
 */
export async function pollJam(jamId: string): Promise<JamSnapshot | null> {
  const me = await currentUser();
  if (!me) return null;

  const snapshot = await readJamSnapshot(jamId, me.id);
  if (!snapshot) return null;

  // Fora da sala, só o suficiente para a tela saber que acabou.
  if (!snapshot.participants.some((p) => p.id === me.id)) return null;
  if (snapshot.ended) return snapshot;

  await touchJamMember(jamId, me.id);
  return snapshot;
}

/** O jam em que você está agora, se houver — lido no layout do cliente. */
export async function readMyJam(): Promise<JamSnapshot | null> {
  const me = await currentUser();
  if (!me) return null;

  const jam = await findJamForUser(me.id);
  if (!jam) return null;

  return readJamSnapshot(jam.id, me.id);
}
