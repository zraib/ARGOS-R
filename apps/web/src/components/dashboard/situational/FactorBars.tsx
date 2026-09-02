"use client";

import { useModules } from "@/lib/store";
import { useMemo } from "react";
import type { CriticalFactor } from "@/lib/ai/situational/types";
import {
  cn,
  IMPACT_FILL,
  IMPACT_CLS,
  } from "@/components/dashboard/situational/shared";
import { Bar } from "@/components/dashboard/situational/Bar";

// ---------- Facteurs critiques (barres horizontales) · redesign ----------------
export function FactorBars({ data }: { data: CriticalFactor[] }) {
  const m = useModules();
  const sorted = useMemo(
    () => [...data].sort((a, b) => {
      const w = (x: CriticalFactor) => (x.impact === "haut" ? 3 : x.impact === "moyen" ? 2 : 1);
      return w(b) - w(a);
    }),
    [data],
  );
  if (!sorted.length) {
    return <div className="rounded-xl border border-dashed border-gray-200/80 p-5 text-center text-[11px] text-gray-400 dark:border-white/10">{m.situational.no_factor}</div>;
  }
  return (
    <div className="flex flex-col gap-2 w-full min-w-0">
      {sorted.slice(0, 5).map((f, i) => {
        const pct = f.impact === "haut" ? 92 : f.impact === "moyen" ? 62 : 30;
        const hex = IMPACT_FILL[f.impact];
        return (
          <div
            key={f.id}
            className="flex flex-col gap-1 rounded-xl border p-2.5 transition-all duration-300 hover:-translate-y-0.5"
            style={{
              borderColor: `${hex}28`,
              backgroundColor: `${hex}08`,
              boxShadow: `0 6px 22px -22px ${hex}aa`,
            }}
          >
            <div className="flex items-center gap-1.5 w-full min-w-0">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-[9.5px] font-black tabular-nums"
                style={{ color: hex, backgroundColor: `${hex}18` }}
              >
                0{i + 1}
              </span>
              <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide leading-none", IMPACT_CLS[f.impact])}>
                {f.impact}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] font-extrabold leading-snug text-gray-800 dark:text-rdia-100">
                {f.label}
              </span>
              {f.value !== undefined && (
                <span className="shrink-0 font-mono text-[11px] font-black tabular-nums text-gray-900 dark:text-rdia-50 leading-none">
                  {String(f.value)}
                </span>
              )}
            </div>
            <Bar value={pct} className="h-1.5" fill={hex} />
          </div>
        );
      })}
    </div>
  );
}
