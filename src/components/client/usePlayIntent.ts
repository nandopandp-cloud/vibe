"use client";

import { useCallback, useState } from "react";
import { usePlayer } from "./PlayerProvider";
import { useJam } from "./JamProvider";
import type { HydratedTrack } from "@/lib/types";

/**
 * Tocar uma faixa, sabendo em que sala você está.
 *
 * O mesmo clique quer dizer três coisas diferentes:
 *
 * - Fora de um jam, toca. É o caso de sempre.
 * - Sendo o host, toca e **leva a sala junto**: a fila local vira a fila
 *   do jam. Antes disto, clicar numa música durante um jam trocava só o
 *   player do host — o servidor seguia com a fila antiga, e o índice que
 *   o relógio reportava logo depois apontava para outra faixa dentro
 *   dela. A sala pulava para algo que ninguém tinha escolhido.
 * - Sendo convidado, entra na fila para tocar a seguir. O player do
 *   convidado obedece ao host, então tocar localmente seria desfeito
 *   pelo polling seguinte — o clique ficava sem resposta nenhuma, que é
 *   pior do que não existir.
 *
 * O aviso que volta é a diferença entre "não funciona" e "funcionou
 * assim": um convidado precisa ver que o pedido dele entrou na fila.
 */
export function usePlayIntent() {
  const p = usePlayer();
  const { jam, isHost, playNext } = useJam();
  const [note, setNote] = useState<string | null>(null);

  const following = Boolean(jam) && !isHost;

  const play = useCallback(
    (track: HydratedTrack, context?: HydratedTrack[]) => {
      if (p.current?.id === track.id && !following) {
        p.toggle();
        return;
      }

      if (following) {
        // O aviso aparece antes da resposta do servidor: o clique
        // precisa responder na hora, e a confirmação verdadeira chega
        // logo atrás para corrigir o texto se algo falhar.
        setNote("Entrando na fila…");
        void playNext(track).then((message) => {
          setNote(message);
          // A mensagem se apaga sozinha: ela confirma, não interrompe.
          setTimeout(() => setNote(null), 2600);
        });
        return;
      }

      // Host ou sozinho: toca de verdade. Quando há jam, o `JamProvider`
      // percebe a fila nova pelo carimbo do player e a publica.
      p.playTrack(track, context);
    },
    [p, following, playNext],
  );

  return { play, following, note };
}
