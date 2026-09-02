"use client";

import { tpl } from "@/lib/i18n/format";
import { useModules } from "@/lib/store";
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
  const m = useModules();
  const TTG = forecasts.ttgStable
    ? {
        main: m.situational.fb_network_stable,
        sub: (() => {
          if (typeof debug?._debugLitsTot === "number" && typeof debug?._debugLitsOcc === "number") {
            const disp = debug._debugLitsTot - debug._debugLitsOcc;
            return tpl(m.situational.fb_beds_margin, { n: disp, p: Math.round((disp / debug._debugLitsTot) * 100) });
          }
          return tpl(m.situational.fb_flow_ok, { r: Math.max(0, Math.round(((forecasts.flux6h.total / 6) / 60) * 100) / 100) });
        })(),
        pct: 15,
        tone: "green" as ToneFill,
      }
    : forecasts.ttgMinutes <= 30
      ? { main: tpl(m.situational.fb_saturation_at, { t: fmtTimeHhMm(generatedAt + forecasts.ttgMinutes * 60 * 1000) }), sub: tpl(m.situational.fb_in_flow_up, { d: fmtDur(forecasts.ttgMinutes) }), pct: Math.max(0, Math.min(100, 100 - (forecasts.ttgMinutes / 180) * 100)), tone: "danger" as ToneFill }
      : forecasts.ttgMinutes <= 90
        ? { main: tpl(m.situational.fb_saturation_at, { t: fmtTimeHhMm(generatedAt + forecasts.ttgMinutes * 60 * 1000) }), sub: tpl(m.situational.fb_in, { d: fmtDur(forecasts.ttgMinutes) }), pct: Math.max(0, Math.min(100, 100 - (forecasts.ttgMinutes / 180) * 100)), tone: "or" as ToneFill }
        : { main: tpl(m.situational.fb_saturation_at, { t: fmtTimeHhMm(generatedAt + forecasts.ttgMinutes * 60 * 1000) }), sub: tpl(m.situational.fb_in, { d: fmtDur(forecasts.ttgMinutes) }), pct: 35, tone: "rdia" as ToneFill };

  const NSAT = !forecasts.nextSat
    ? { main: m.situational.fb_network_controlled, sub: m.situational.fb_no_hospital_at_risk, pct: 20, tone: "green" as ToneFill }
    : forecasts.nextSat.alreadySat
      ? { main: tpl(m.situational.fb_saturated, { h: forecasts.nextSat.nom }), sub: tpl(m.situational.fb_pct_now, { p: Math.round(forecasts.nextSat.occPctNow * 100) }), pct: 95, tone: "danger" as ToneFill }
      : forecasts.nextSat.minutesUntilSat <= 30
        ? { main: `${forecasts.nextSat.nom} · ${fmtTimeHhMm(generatedAt + forecasts.nextSat.minutesUntilSat * 60 * 1000)}`, sub: tpl(m.situational.fb_pct_in, { p: Math.round(forecasts.nextSat.occPctNow * 100), d: fmtDur(forecasts.nextSat.minutesUntilSat) }), pct: Math.max(0, Math.min(100, forecasts.nextSat.occPctNow * 100)) + 10, tone: "or" as ToneFill }
        : { main: `${forecasts.nextSat.nom} · ${fmtTimeHhMm(generatedAt + forecasts.nextSat.minutesUntilSat * 60 * 1000)}`, sub: tpl(m.situational.fb_pct, { p: Math.round(forecasts.nextSat.occPctNow * 100) }), pct: Math.max(0, Math.min(100, forecasts.nextSat.occPctNow * 100)), tone: "rdia" as ToneFill };

  const HMC = !forecasts.besoinHMC?.nombre
    ? { main: m.situational.fb_capacity_ok, sub: m.situational.fb_no_hmc, pct: 10, tone: "green" as ToneFill }
    : forecasts.besoinHMC.nombre >= 3
      ? { main: tpl(m.situational.fb_hmc_needed, { n: forecasts.besoinHMC.nombre }), sub: tpl(m.situational.fb_hmc_beds, { n: forecasts.besoinHMC.litsTotal, u: forecasts.besoinHMC.litsParHMC }), pct: 92, tone: "danger" as ToneFill }
      : { main: tpl(m.situational.fb_hmc_recommended, { n: forecasts.besoinHMC.nombre }), sub: tpl(m.situational.fb_beds, { n: forecasts.besoinHMC.litsTotal }), pct: 65, tone: "or" as ToneFill };

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
