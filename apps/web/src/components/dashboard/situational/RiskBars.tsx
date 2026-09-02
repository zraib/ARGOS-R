"use client";

import { useModules } from "@/lib/store";
import type { NextRisk } from "@/lib/ai/situational/types";
import {
  cn,
  NIV_COLORS,
  NIV_KEY,
  NIV_TXT_CLS,
  } from "@/components/dashboard/situational/shared";
import { Bar } from "@/components/dashboard/situational/Bar";

// ---------- Risques imminents 2h/6h/24h (cards redesign) ----------------
export function RiskBars({ risks }: { risks: NextRisk[] }) {
  const m = useModules();
  const order: Array<"2h" | "6h" | "24h"> = ["2h", "6h", "24h"];
  const byHorizon = new Map(risks.map((r) => [r.horizon, r]));
  return (
    <div className="flex flex-col gap-2">
      {order.map((h, i) => {
        const r = byHorizon.get(h);
        if (!r) {
          return (
            <div key={h} className="flex items-center gap-2.5 rounded-xl border border-dashed border-gray-200/70 bg-white/50 px-2.5 py-2 dark:border-white/10 dark:bg-white/0">
              <span className="flex h-7 w-10 shrink-0 items-center justify-center rounded-md border border-gray-200/80 bg-white/90 font-mono text-[9.5px] font-black uppercase tracking-wide text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-rdia-400">
                H{h}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-white/8" />
              <span className="text-[10px] font-semibold text-gray-400 dark:text-rdia-400">{m.situational.no_risk}</span>
            </div>
          );
        }
        const hex = NIV_COLORS[r.niveau];
        return (
          <div
            key={h}
            className="flex flex-col gap-1.5 rounded-xl border p-2.5 transition-all duration-300 hover:-translate-y-0.5"
            style={{
              borderColor: `${hex}30`,
              backgroundColor: `${hex}09`,
              boxShadow: `0 6px 22px -22px ${hex}aa`,
            }}
          >
            <div className="flex items-center gap-1.5 w-full min-w-0">
              <span
                className="flex h-7 w-10 shrink-0 items-center justify-center rounded-md border font-mono text-[9.5px] font-black uppercase tracking-wide"
                style={{
                  color: hex,
                  borderColor: `${hex}30`,
                  backgroundColor: `${hex}15`,
                }}
              >
                H{h}
              </span>
              <span className="font-mono text-[9px] font-black tabular-nums text-gray-400 dark:text-rdia-400">
                0{i + 1}
              </span>
              <div className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: hex }} />
              <div className="min-w-0 flex-1 flex flex-col gap-0.5 leading-tight">
                <div className="truncate text-[12px] font-extrabold leading-snug text-gray-900 dark:text-rdia-50">{r.type}</div>
                <div className="truncate text-[10px] leading-snug text-gray-500 dark:text-rdia-300/85">{r.zone}</div>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-0.5 leading-none">
                <span
                  className={cn("rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase", NIV_TXT_CLS[r.niveau])}
                >
                  {m.situational[NIV_KEY[r.niveau]]}
                </span>
                <span className="font-mono text-[11px] font-black tabular-nums" style={{ color: hex }}>
                  {r.probabilitePct}%
                </span>
              </div>
            </div>
            <Bar value={r.probabilitePct} className="h-1.5" fill={hex} />
          </div>
        );
      })}
    </div>
  );
}
