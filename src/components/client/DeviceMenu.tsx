"use client";

import { useEffect, useRef, useState } from "react";
import { usePlayer } from "./PlayerProvider";
import { cx } from "@/lib/utils";
import * as I from "../Icons";

/**
 * Escolha de onde o som sai.
 *
 * O navegador alcança duas coisas: as saídas do próprio computador
 * (caixa, fones, HDMI, Bluetooth pareado) via `setSinkId`, e aparelhos de
 * Chromecast/AirPlay pelo seletor nativo. Alexa e celular não têm API de
 * navegador — o rodapé do menu explica o caminho que funciona para eles,
 * que é parear por Bluetooth e escolher aqui como saída.
 */
export function DeviceMenu() {
  const p = usePlayer();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openMenu = async () => {
    setOpen(true);
    // As saídas só são listáveis sob permissão, então pedimos ao abrir —
    // não no carregamento da página, que assustaria sem motivo.
    if (p.outputs.length === 0 && p.canRouteAudio) {
      setBusy(true);
      await p.loadOutputs();
      setBusy(false);
    }
  };

  const connected = p.remoteState === "connected";
  const routed = p.outputId !== "default";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : void openMenu())}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Conectar dispositivo"
        className={cx(
          "grid h-8 w-8 place-items-center rounded-full transition-colors",
          connected || routed
            ? "text-accent"
            : open
              ? "text-ink"
              : "text-ink-2 hover:text-ink",
        )}
      >
        <I.Devices className="h-[18px] w-[18px]" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-[calc(100%+10px)] right-0 z-50 w-72 overflow-hidden rounded-xl border border-hairline bg-surface shadow-2xl shadow-black/60"
        >
          <div className="border-b border-hairline px-4 py-3">
            <p className="text-sm font-semibold text-ink">
              Ouvir em outro aparelho
            </p>
            <p className="mt-0.5 text-xs text-ink-2">
              {connected
                ? "Transmitindo agora"
                : routed
                  ? "Som em outra saída"
                  : "Escolha onde o som sai"}
            </p>
          </div>

          {/* --- saídas do computador --- */}
          {p.canRouteAudio ? (
            <div className="p-1.5">
              {busy && (
                <p className="px-3 py-2.5 text-xs text-ink-3">
                  Procurando aparelhos…
                </p>
              )}

              {!busy && p.outputs.length === 0 && (
                <p className="px-3 py-2.5 text-xs leading-relaxed text-ink-3">
                  Nenhuma saída encontrada. Permita o acesso aos
                  dispositivos de áudio para vê-las aqui.
                </p>
              )}

              {p.outputs.map((o) => {
                const active = o.deviceId === p.outputId;
                return (
                  <button
                    key={o.deviceId}
                    type="button"
                    role="menuitem"
                    onClick={() => void p.selectOutput(o.deviceId)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <I.Volume className="h-4 w-4 shrink-0" />
                      <span className="truncate">{o.label}</span>
                    </span>
                    {active && (
                      <I.Check className="h-4 w-4 shrink-0 text-accent" />
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="px-4 py-3 text-xs leading-relaxed text-ink-3">
              Este navegador não permite escolher a saída de áudio. No
              Chrome ou no Edge a lista aparece aqui.
            </p>
          )}

          {/* --- Chromecast / AirPlay --- */}
          {p.remoteState !== "unavailable" && (
            <div className="border-t border-hairline p-1.5">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  p.openRemotePicker();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <I.Devices className="h-4 w-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate">
                    {connected ? "Trocar aparelho" : "Chromecast ou AirPlay"}
                  </span>
                  <span className="block truncate text-[11px] text-ink-3">
                    TV e caixas compatíveis
                  </span>
                </span>
              </button>
            </div>
          )}

          <p className="border-t border-hairline px-4 py-3 text-[11px] leading-relaxed text-ink-3">
            Alexa ou celular? Pareie o aparelho por Bluetooth no
            computador — ele passa a aparecer na lista acima.
          </p>
        </div>
      )}
    </div>
  );
}
