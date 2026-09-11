"use server";

import { currentUser } from "./auth";
import { clearPresence, readFriendActivity, updatePresence } from "./db";
import type { FriendActivity } from "./types";

/**
 * Presença — o que cada um está ouvindo agora.
 *
 * Duas chamadas e nada mais: uma para contar, outra para perguntar. O
 * player avisa a cada troca de faixa e a cada play/pause, e repete de
 * tempos em tempos enquanto a aba estiver visível; a tela de amigos
 * pergunta em polling.
 *
 * Não existe um "fiquei offline" explícito, e não é esquecimento: a aba
 * que fecha não tem como avisar, e uma rede que cai menos ainda. O fim
 * da presença é lido do silêncio — é o mesmo raciocínio do `lastSeenAt`
 * do jam, e o que faz a bolinha apagar sozinha sem mentir enquanto isso.
 */

/**
 * Conta o que estou ouvindo.
 *
 * Devolve `void` de propósito: quem chama é o player, no meio de tocar
 * uma música, e esperar por uma confirmação que ninguém lê só atrasaria
 * o áudio. Erros morrem aqui — perder um batimento custa uma bolinha
 * apagada por alguns segundos, e não vale quebrar a reprodução.
 */
export async function reportListening(input: {
  trackId: string | null;
  playing: boolean;
}): Promise<void> {
  try {
    const me = await currentUser();
    if (!me) return;
    await updatePresence(me.id, {
      trackId: input.trackId,
      playing: input.playing,
    });
  } catch (e) {
    console.error("[sona:presence] batimento não registrado", e);
  }
}

/**
 * Sai do ar agora, sem esperar a janela expirar.
 *
 * Serve ao logout, e à aba que se fecha com aviso prévio. É um atalho
 * para o que o silêncio faria sozinho um minuto depois.
 */
export async function stopListening(): Promise<void> {
  try {
    const me = await currentUser();
    if (!me) return;
    await clearPresence(me.id);
  } catch (e) {
    console.error("[sona:presence] presença não encerrada", e);
  }
}

/** Os amigos e o que cada um está ouvindo — alimenta a tela e a sidebar. */
export async function readFriendsActivity(): Promise<FriendActivity[]> {
  const me = await currentUser();
  if (!me) return [];
  return readFriendActivity(me.id);
}
