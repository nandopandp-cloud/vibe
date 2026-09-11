"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePlayer } from "./PlayerProvider";
import {
  readFriendsActivity,
  reportListening,
} from "@/lib/presence-actions";
import type { FriendActivity } from "@/lib/types";

/**
 * Presença — os dois sentidos da mesma ponte.
 *
 * Para fora: o player conta o que está tocando, na hora em que muda e de
 * tempos em tempos enquanto a aba estiver à vista. Para dentro: um
 * polling traz o que os amigos estão ouvindo.
 *
 * As duas metades moram juntas porque a batida é a mesma conversa com o
 * servidor, e separá-las faria duas rodas girando fora de fase — a tela
 * mostraria um amigo trocando de música antes de a própria pessoa ter
 * contado a dela.
 *
 * Nada disso roda com a aba escondida. Um navegador em segundo plano
 * estrangula os timers de qualquer jeito, e continuar batendo ali só
 * gastaria requisição para uma tela que ninguém está vendo — o preço é
 * a bolinha levar alguns segundos para acender de volta, que é o que
 * acontece quando a pessoa volta e o efeito bate na hora.
 */

/** De quanto em quanto tempo eu conto o que estou ouvindo. */
const HEARTBEAT = 20_000;
/** De quanto em quanto tempo pergunto o que os amigos estão ouvindo. */
const POLL_INTERVAL = 15_000;

type PresenceApi = {
  /** Amigos e o que cada um está ouvindo, na ordem de quem está ativo. */
  friends: FriendActivity[];
  /** Quantos estão online agora — alimenta os contadores da navegação. */
  onlineCount: number;
  /** Lê agora, sem esperar a próxima batida. */
  refresh: () => void;
};

const Ctx = createContext<PresenceApi>({
  friends: [],
  onlineCount: 0,
  refresh: () => {},
});

export function useFriendsActivity() {
  return useContext(Ctx);
}

export function PresenceProvider({
  initial,
  children,
}: {
  initial: FriendActivity[];
  children: React.ReactNode;
}) {
  const player = usePlayer();
  const [friends, setFriends] = useState<FriendActivity[]>(initial);

  /**
   * O servidor manda a atividade a cada navegação, e às vezes ela é a
   * novidade: um amigo recém-aceito aparece por aqui sem esperar a
   * próxima batida do polling.
   *
   * A adoção é feita no render, e não num efeito, porque o efeito só
   * rodaria *depois* de a tela já ter pintado a lista velha — a pessoa
   * veria o estado antigo por um quadro. Trocar durante o render é o que
   * o React chama de derivar de props, e custa apenas o re-render que a
   * novidade exigiria de qualquer jeito.
   *
   * A comparação é por *conteúdo*, e não por identidade. O servidor monta
   * este array do zero a cada render do layout, então a identidade muda
   * mesmo quando ninguém trocou de música — e adotar nessa hora forçava
   * um segundo render de toda a aplicação a cada revalidação, por nada.
   * Pior: descartava o resultado do polling, que costuma ser mais novo
   * que o do render.
   */
  const [adopted, setAdopted] = useState(initial);
  if (initial !== adopted) {
    setAdopted(initial);
    if (!sameActivity(initial, friends)) setFriends(initial);
  }

  /** Evita duas leituras concorrentes quando a rede está lenta. */
  const readingRef = useRef(false);

  /* ---------------- para fora: eu conto o que ouço ---------------- */

  // O batimento lê o player a cada disparo, mas não deve reagendar o
  // intervalo a cada tique de `time`: a ref segura o valor mais novo sem
  // fazer o efeito depender dele.
  const playerRef = useRef(player);
  useEffect(() => {
    playerRef.current = player;
  });

  const trackId = player.current?.id ?? null;
  const playing = player.playing;

  useEffect(() => {
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      const p = playerRef.current;
      void reportListening({
        trackId: p.current?.id ?? null,
        playing: p.playing,
      });
    };

    // Conta a mudança na hora — trocar de música é exatamente a notícia
    // que os amigos estão esperando, e segurá-la até o próximo intervalo
    // mostraria a faixa anterior por até vinte segundos.
    beat();
    const id = setInterval(beat, HEARTBEAT);
    const onVisible = () =>
      document.visibilityState === "visible" && beat();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // Trocar de faixa e dar play/pause reportam na hora por estarem nas
    // deps; a posição dentro da faixa não interessa a ninguém aqui.
  }, [trackId, playing]);

  /* ---------------- para dentro: o que eles ouvem ---------------- */

  const refresh = useCallback(() => {
    if (readingRef.current) return;
    readingRef.current = true;
    void readFriendsActivity()
      .then(setFriends)
      .catch(() => {})
      .finally(() => {
        readingRef.current = false;
      });
  }, []);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      refresh();
    };

    const id = setInterval(tick, POLL_INTERVAL);
    // Voltar para a aba depois de um tempo fora merece uma leitura já: o
    // navegador estrangula os timers em segundo plano, e sem isto a
    // pessoa veria a lista congelada nos primeiros segundos.
    const onVisible = () =>
      document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const onlineCount = friends.filter((f) => f.online).length;

  /**
   * O valor do contexto, memoizado.
   *
   * Este provider re-renderiza a cada batida do polling (de quinze em
   * quinze segundos) e a cada tique do player. Sem o memo, o objeto era
   * novo em todas elas, e cada consumidor de `useFriendsActivity` —
   * incluindo o `Shell` inteiro — re-renderizava junto sem ter o que
   * mostrar de diferente.
   */
  const api = useMemo(
    () => ({ friends, onlineCount, refresh }),
    [friends, onlineCount, refresh],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/**
 * Duas leituras de atividade dizem a mesma coisa?
 *
 * Compara o que a tela de fato mostra — quem está, se está online e o
 * que toca. A ordem é estável (o servidor ordena por quem está ativo),
 * então basta percorrer as duas em paralelo.
 */
function sameActivity(a: FriendActivity[], b: FriendActivity[]): boolean {
  return (
    a.length === b.length &&
    a.every((x, i) => {
      const y = b[i];
      return (
        x.user.id === y.user.id &&
        x.online === y.online &&
        x.playing === y.playing &&
        x.track?.id === y.track?.id
      );
    })
  );
}
