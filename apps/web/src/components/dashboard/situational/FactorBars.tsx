"use client";

import { useModules } from "@/lib/store";
import { useMemo } from "react";
import type { CriticalFactor } from "@/lib/ai/situational/types";
import { IMPACT_TONE, TONE_CLS, TUILE } from "@/components/dashboard/situational/shared";
import { ProgressBar } from "@/components/ui/ProgressBar";

/**
 * Facteurs critiques. Une tuile par facteur, dans la grammaire du produit :
 * rang, badge d'impact, libellé, valeur, barre. Le fond et l'ombre teintés ont
 * disparu — l'impact se lit au badge et à la barre, qui suffisent.
 */
export function FactorBars({ data }: { data: CriticalFactor[] }) {
  const m = useModules();
  const sorted = useMemo(
    () =>
      [...data].sort((a, b) => {
        const w = (x: CriticalFactor) => (x.impact === "haut" ? 3 : x.impact === "moyen" ? 2 : 1);
        return w(b) - w(a);
      }),
    [data],
  );
  if (!sorted.length) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 p-5 text-center text-xs text-gray-400 dark:border-rdia-600 dark:text-rdia-400">
        {m.situational.no_factor}
      </div>
    );
  }
  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      {sorted.slice(0, 5).map((f, i) => {
        const c = TONE_CLS[IMPACT_TONE[f.impact]];
        const pct = f.impact === "haut" ? 92 : f.impact === "moyen" ? 62 : 30;
        return (
          <div key={f.id} className={`flex flex-col gap-2 ${TUILE}`}>
            <div className="flex w-full min-w-0 items-center gap-2">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-[10px] font-bold tabular-nums ${c.chip}`}>
                {i + 1}
              </span>
              <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${c.badge}`}>{f.impact}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-gray-800 dark:text-rdia-50">
                {f.label}
              </span>
              {f.value !== undefined && (
                <span className="shrink-0 font-mono text-[12px] font-bold tabular-nums text-gray-700 dark:text-rdia-100">
                  {String(f.value)}
                </span>
              )}
            </div>
            <ProgressBar value={pct} fill={c.fill} />
          </div>
        );
      })}
    </div>
  );
}
