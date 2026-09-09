"use client";

import { tpl } from "@/lib/i18n/format";
import { useModules } from "@/lib/store";
import type { SituationalForecasts } from "@/lib/ai/situational/types";
import {
  fmtDur,
  fmtTimeHhMm,
  ToneFill,
  TONE_CLS,
  TUILE,
  BarRow,
} from "@/components/dashboard/situational/shared";
import { Icon } from "@/components/dashboard/situational/Icon";
import { ProgressBar } from "@/components/ui/ProgressBar";

export function ForeBars({ forecasts, generatedAt, debug }: {
  forecasts: SituationalForecasts;
  generatedAt: number;
  debug?: { _debugLitsTot?: number; _debugLitsOcc?: number };
}) {
  const m = useModules();
  // Lits disponibles et taux d'occupation RÉELS : la barre « temps avant
  // saturation » montrait une constante (15 %) sans rapport avec la marge
  // annoncée en sous-titre ; elle suit désormais l'occupation globale
  // (100 − marge), et sa couleur la marge : ≥ 25 % vert, 15–25 % or, sinon rouge.
  const TTG = (() => {
    const disp = typeof debug?._debugLitsTot === "number" && typeof debug?._debugLitsOcc === "number"
      ? debug._debugLitsTot - debug._debugLitsOcc
      : null;
    const tot = debug?._debugLitsTot ?? 0;
    const occPct = tot > 0 && disp !== null ? Math.round(((tot - disp) / tot) * 100) : null;
    const margePct = tot > 0 && disp !== null ? Math.round((disp / tot) * 100) : null;
    const saturationAt = tpl(m.situational.fb_saturation_at, { t: fmtTimeHhMm(generatedAt + forecasts.ttgMinutes * 60 * 1000) });
    if (forecasts.ttgStable) {
      const sub = disp !== null && tot > 0
        ? tpl(m.situational.fb_beds_margin, { n: disp, p: margePct ?? 0 })
        : tpl(m.situational.fb_flow_ok, { r: Math.max(0, Math.round(((forecasts.flux6h.total / 6) / 60) * 100) / 100) });
      return {
        main: m.situational.fb_network_stable,
        sub,
        pct: Math.max(5, Math.min(100, occPct ?? 15)),
        tone: (margePct ?? 100) >= 25 ? ("green" as ToneFill) : (margePct ?? 100) >= 15 ? ("or" as ToneFill) : ("rdia" as ToneFill),
      };
    }
    if (forecasts.ttgMinutes <= 30) {
      return { main: saturationAt, sub: tpl(m.situational.fb_in_flow_up, { d: fmtDur(forecasts.ttgMinutes) }), pct: Math.max(0, Math.min(100, 100 - (forecasts.ttgMinutes / 180) * 100)), tone: "danger" as ToneFill };
    }
    if (forecasts.ttgMinutes <= 90) {
      return { main: saturationAt, sub: tpl(m.situational.fb_in, { d: fmtDur(forecasts.ttgMinutes) }), pct: Math.max(0, Math.min(100, 100 - (forecasts.ttgMinutes / 180) * 100)), tone: "or" as ToneFill };
    }
    return { main: saturationAt, sub: tpl(m.situational.fb_in, { d: fmtDur(forecasts.ttgMinutes) }), pct: Math.min(100, Math.max(15, occPct ?? 35)), tone: "rdia" as ToneFill };
  })();

  const NSAT = !forecasts.nextSat
    ? { main: m.situational.fb_network_controlled, sub: m.situational.fb_no_hospital_at_risk, pct: 20, tone: "green" as ToneFill }
    : forecasts.nextSat.alreadySat
      ? { main: tpl(m.situational.fb_saturated, { h: forecasts.nextSat.nom }), sub: tpl(m.situational.fb_pct_now, { p: Math.round(forecasts.nextSat.occPctNow * 100) }), pct: 95, tone: "danger" as ToneFill }
      : forecasts.nextSat.minutesUntilSat <= 30
        ? { main: `${forecasts.nextSat.nom} · ${fmtTimeHhMm(generatedAt + forecasts.nextSat.minutesUntilSat * 60 * 1000)}`, sub: tpl(m.situational.fb_pct_in, { p: Math.round(forecasts.nextSat.occPctNow * 100), d: fmtDur(forecasts.nextSat.minutesUntilSat) }), pct: Math.max(0, Math.min(100, forecasts.nextSat.occPctNow * 100)) + 10, tone: "or" as ToneFill }
        : { main: `${forecasts.nextSat.nom} · ${fmtTimeHhMm(generatedAt + forecasts.nextSat.minutesUntilSat * 60 * 1000)}`, sub: tpl(m.situational.fb_pct, { p: Math.round(forecasts.nextSat.occPctNow * 100) }), pct: Math.max(0, Math.min(100, forecasts.nextSat.occPctNow * 100)), tone: "rdia" as ToneFill };

  // Tension à 6 h RÉELLE : admissions attendues (55 % du flux 6 h) rapportées
  // à la capacité mobilisable sous 6 h (35 % des lits disponibles). L'ancienne
  // formule confondait admissions et capacité, d'où un 100 % borné à 60 %
  // affiché sans raison ; la borne arbitraire disparaît, les seuils de couleur
  // sont < 35 % vert, < 70 % or, sinon rouge.
  const HMC = (() => {
    const disp = typeof debug?._debugLitsTot === "number" && typeof debug?._debugLitsOcc === "number"
      ? debug._debugLitsTot - debug._debugLitsOcc
      : null;
    const besoin = forecasts.besoinHMC;
    const admissions6hLit = Math.round((forecasts.flux6h.total ?? 0) * 0.55);
    const capacite6h = disp != null ? Math.max(1, Math.round(disp * 0.35)) : null;
    const tension6h = capacite6h != null ? Math.round((admissions6hLit / capacite6h) * 100) : null;
    if (!besoin?.nombre) {
      const barre = tension6h != null ? Math.max(5, Math.min(100, tension6h)) : 10;
      return {
        main: m.situational.fb_capacity_ok,
        sub: m.situational.fb_no_hmc,
        pct: barre,
        tone: barre < 35 ? ("green" as ToneFill) : barre < 70 ? ("or" as ToneFill) : ("danger" as ToneFill),
      };
    }
    if (besoin.nombre >= 3) {
      return { main: tpl(m.situational.fb_hmc_needed, { n: besoin.nombre }), sub: tpl(m.situational.fb_hmc_beds, { n: besoin.litsTotal, u: besoin.litsParHMC }), pct: Math.max(80, Math.min(100, tension6h ?? 92)), tone: "danger" as ToneFill };
    }
    return { main: tpl(m.situational.fb_hmc_recommended, { n: besoin.nombre }), sub: tpl(m.situational.fb_beds, { n: besoin.litsTotal }), pct: Math.max(50, Math.min(90, tension6h ?? 65)), tone: "or" as ToneFill };
  })();

  const REDIR = forecasts.redirection.nHopitaux >= 3
    ? { main: tpl(m.situational.fb_redirectable_beds, { n: forecasts.redirection.litsRedirigeables }), sub: tpl(m.situational.fb_chu_switchable, { n: forecasts.redirection.nHopitaux }), pct: Math.max(0, Math.min(100, (forecasts.redirection.litsRedirigeables / 500) * 100)), tone: "green" as ToneFill }
    : forecasts.redirection.nHopitaux === 0
      ? { main: m.situational.fb_no_switch, sub: tpl(m.situational.fb_theoretical_beds, { n: forecasts.redirection.litsRedirigeables }), pct: 88, tone: "danger" as ToneFill }
      : { main: tpl(m.situational.fb_beds_chu, { n: forecasts.redirection.litsRedirigeables, c: forecasts.redirection.nHopitaux }), sub: m.situational.fb_switch_limited, pct: 50, tone: "rdia" as ToneFill };

  const rows: Array<BarRow & { id: string }> = [
    { id: "ttg", icon: "clock", label: m.situational.fb_ttg, main: TTG.main, sub: TTG.sub, pct: Math.min(100, TTG.pct), tone: TTG.tone },
    { id: "nsat", icon: "alert-triangle", label: m.situational.fb_next_sat, main: NSAT.main, sub: NSAT.sub, pct: Math.min(100, NSAT.pct), tone: NSAT.tone },
    { id: "hmc", icon: "tent", label: m.situational.fb_hmc_need, main: HMC.main, sub: HMC.sub, pct: Math.min(100, HMC.pct), tone: HMC.tone },
    { id: "red", icon: "shuffle", label: m.situational.fb_redirection, main: REDIR.main, sub: REDIR.sub, pct: Math.min(100, REDIR.pct), tone: REDIR.tone },
  ];

  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => {
        const c = TONE_CLS[r.tone];
        return (
          // Tuile d'anticipation : pastille d'icône, libellé, pourcentage,
          // énoncé, puis la barre. Plus de bord ni d'ombre teintés — le ton
          // vit dans la pastille, le chiffre et le remplissage.
          <div key={r.id} className={`flex flex-col gap-2 ${TUILE}`}>
            <div className="flex w-full min-w-0 items-center gap-2.5">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${c.chip}`}>
                <Icon name={r.icon} className="h-4 w-4" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">
                    {r.label}
                  </span>
                  <span className={`shrink-0 font-mono text-[12px] font-bold tabular-nums ${c.text}`}>
                    {Math.round(r.pct)}%
                  </span>
                </div>
                <span className="truncate text-[13px] font-semibold text-gray-800 dark:text-rdia-50">{r.main}</span>
                {r.sub && <span className="truncate text-xs text-gray-500 dark:text-rdia-300">{r.sub}</span>}
              </div>
            </div>
            <ProgressBar value={r.pct} fill={c.fill} />
          </div>
        );
      })}
    </div>
  );
}
