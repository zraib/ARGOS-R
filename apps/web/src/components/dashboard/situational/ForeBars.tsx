"use client";

import type { SituationalForecasts } from "@/lib/ai/situational/types";
import {
  fmtDur,
  fmtTimeHhMm,
  ToneFill,
  TONE_HEX,
  BarRow,
} from "@/components/dashboard/situational/shared";
import { Icon } from "@/components/dashboard/situational/Icon";
import { Bar } from "@/components/dashboard/situational/Bar";

export function ForeBars({ forecasts, generatedAt, debug }: {
  forecasts: SituationalForecasts;
  generatedAt: number;
  debug?: { _debugLitsTot?: number; _debugLitsOcc?: number };
}) {
  const TTG = forecasts.ttgStable
    ? {
        main: "Réseau stable",
        sub: (() => {
          if (typeof debug?._debugLitsTot === "number" && typeof debug?._debugLitsOcc === "number") {
            const disp = debug._debugLitsTot - debug._debugLitsOcc;
            return `${disp} lits dispo · ${Math.round((disp / debug._debugLitsTot) * 100)}% marge`;
          }
          return `Débit < ${Math.max(0, Math.round(((forecasts.flux6h.total / 6) / 60) * 100) / 100)} pat/min · marge OK`;
        })(),
        pct: 15,
        tone: "green" as ToneFill,
      }
    : forecasts.ttgMinutes <= 30
      ? { main: `Saturation à ${fmtTimeHhMm(generatedAt + forecasts.ttgMinutes * 60 * 1000)}`, sub: `dans ${fmtDur(forecasts.ttgMinutes)} · débit ↑`, pct: Math.max(0, Math.min(100, 100 - (forecasts.ttgMinutes / 180) * 100)), tone: "danger" as ToneFill }
      : forecasts.ttgMinutes <= 90
        ? { main: `Saturation à ${fmtTimeHhMm(generatedAt + forecasts.ttgMinutes * 60 * 1000)}`, sub: `dans ${fmtDur(forecasts.ttgMinutes)}`, pct: Math.max(0, Math.min(100, 100 - (forecasts.ttgMinutes / 180) * 100)), tone: "or" as ToneFill }
        : { main: `Saturation à ${fmtTimeHhMm(generatedAt + forecasts.ttgMinutes * 60 * 1000)}`, sub: `dans ${fmtDur(forecasts.ttgMinutes)}`, pct: 35, tone: "rdia" as ToneFill };

  const NSAT = !forecasts.nextSat
    ? { main: "Réseau contrôlé", sub: "Aucun hôpital à risque", pct: 20, tone: "green" as ToneFill }
    : forecasts.nextSat.alreadySat
      ? { main: `${forecasts.nextSat.nom} · saturé`, sub: `${Math.round(forecasts.nextSat.occPctNow * 100)}% actuel`, pct: 95, tone: "danger" as ToneFill }
      : forecasts.nextSat.minutesUntilSat <= 30
        ? { main: `${forecasts.nextSat.nom} · ${fmtTimeHhMm(generatedAt + forecasts.nextSat.minutesUntilSat * 60 * 1000)}`, sub: `${Math.round(forecasts.nextSat.occPctNow * 100)}% · dans ${fmtDur(forecasts.nextSat.minutesUntilSat)}`, pct: Math.max(0, Math.min(100, forecasts.nextSat.occPctNow * 100)) + 10, tone: "or" as ToneFill }
        : { main: `${forecasts.nextSat.nom} · ${fmtTimeHhMm(generatedAt + forecasts.nextSat.minutesUntilSat * 60 * 1000)}`, sub: `${Math.round(forecasts.nextSat.occPctNow * 100)}%`, pct: Math.max(0, Math.min(100, forecasts.nextSat.occPctNow * 100)), tone: "rdia" as ToneFill };

  const HMC = !forecasts.besoinHMC?.nombre
    ? { main: "Capacités OK", sub: "Aucun renfort HMC", pct: 10, tone: "green" as ToneFill }
    : forecasts.besoinHMC.nombre >= 3
      ? { main: `${forecasts.besoinHMC.nombre} HMC nécessaires`, sub: `${forecasts.besoinHMC.litsTotal} lits · ${forecasts.besoinHMC.litsParHMC}/unité`, pct: 92, tone: "danger" as ToneFill }
      : { main: `${forecasts.besoinHMC.nombre} HMC recommandé${forecasts.besoinHMC.nombre > 1 ? "s" : ""}`, sub: `${forecasts.besoinHMC.litsTotal} lits`, pct: 65, tone: "or" as ToneFill };

  const REDIR = forecasts.redirection.nHopitaux >= 3
    ? { main: `${forecasts.redirection.litsRedirigeables} lits redirigeables`, sub: `${forecasts.redirection.nHopitaux} CHU basculables`, pct: Math.max(0, Math.min(100, (forecasts.redirection.litsRedirigeables / 500) * 100)), tone: "green" as ToneFill }
    : forecasts.redirection.nHopitaux === 0
      ? { main: "Aucune bascule possible", sub: `${forecasts.redirection.litsRedirigeables} lits théoriques`, pct: 88, tone: "danger" as ToneFill }
      : { main: `${forecasts.redirection.litsRedirigeables} lits · ${forecasts.redirection.nHopitaux} CHU`, sub: "Basculable limité", pct: 50, tone: "rdia" as ToneFill };

  const rows: Array<BarRow & { id: string }> = [
    { id: "ttg", icon: "clock", label: "Temps avant saturation", main: TTG.main, sub: TTG.sub, pct: Math.min(100, TTG.pct), tone: TTG.tone },
    { id: "nsat", icon: "alert-triangle", label: "Prochaine saturation", main: NSAT.main, sub: NSAT.sub, pct: Math.min(100, NSAT.pct), tone: NSAT.tone },
    { id: "hmc", icon: "tent", label: "Besoin HMC · 6 h", main: HMC.main, sub: HMC.sub, pct: Math.min(100, HMC.pct), tone: HMC.tone },
    { id: "red", icon: "shuffle", label: "Redirection", main: REDIR.main, sub: REDIR.sub, pct: Math.min(100, REDIR.pct), tone: REDIR.tone },
  ];

  return (
    <div className="flex flex-col gap-2">
      {rows.map((r, i) => {
        const hex = TONE_HEX[r.tone];
        return (
          <div
            key={r.id}
            className="group flex flex-col gap-1.5 rounded-xl border p-2.5 transition-all duration-300 hover:-translate-y-0.5"
            style={{
              borderColor: `${hex}28`,
              backgroundColor: `${hex}09`,
              boxShadow: `0 6px 22px -22px ${hex}aa`,
            }}
          >
            <div className="flex items-center gap-2.5 w-full min-w-0">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${hex}18`, color: hex }}
              >
                <Icon name={r.icon} className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1 flex flex-col gap-0.5 leading-tight">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9.5px] font-bold uppercase tracking-wider" style={{ color: `${hex}cc` }}>
                    0{i + 1} · {r.label}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] font-black tabular-nums text-gray-800 dark:text-rdia-100">
                    {Math.round(r.pct)}%
                  </span>
                </div>
                <div className="truncate text-[12px] font-extrabold leading-snug text-gray-900 dark:text-rdia-50">
                  {r.main}
                </div>
                {r.sub && (
                  <div className="truncate text-[10px] leading-snug text-gray-500 dark:text-rdia-300/85">
                    {r.sub}
                  </div>
                )}
              </div>
            </div>
            <Bar value={r.pct} className="h-1.5" fill={hex} />
          </div>
        );
      })}
    </div>
  );
}
