"use client";

import { useModules } from "@/lib/store";
import type { NextRisk } from "@/lib/ai/situational/types";
import { NIV_KEY, NIV_TONE, TONE_CLS, TUILE } from "@/components/dashboard/situational/shared";
import { ProgressBar } from "@/components/ui/ProgressBar";

/**
 * Risques imminents à 2 h, 6 h et 24 h. Une tuile par horizon, y compris quand
 * il n'y a rien à signaler : un horizon absent de la liste est une information,
 * il garde donc sa ligne plutôt que de disparaître.
 */
export function RiskBars({ risks }: { risks: NextRisk[] }) {
  const m = useModules();
  const order: Array<"2h" | "6h" | "24h"> = ["2h", "6h", "24h"];
  const byHorizon = new Map(risks.map((r) => [r.horizon, r]));
  return (
    <div className="flex flex-col gap-2">
      {order.map((h) => {
        const r = byHorizon.get(h);
        const horizon = (
          <span className="flex h-7 w-10 shrink-0 items-center justify-center rounded-md bg-gray-100 font-mono text-[11px] font-bold uppercase text-gray-500 dark:bg-rdia-600 dark:text-rdia-200">
            H{h}
          </span>
        );
        if (!r) {
          return (
            <div key={h} className={`flex items-center gap-2.5 ${TUILE}`}>
              {horizon}
              <ProgressBar value={0} />
              <span className="shrink-0 text-xs text-gray-400 dark:text-rdia-400">{m.situational.no_risk}</span>
            </div>
          );
        }
        const c = TONE_CLS[NIV_TONE[r.niveau]];
        return (
          <div key={h} className={`flex flex-col gap-2 ${TUILE}`}>
            <div className="flex w-full min-w-0 items-center gap-2.5">
              {horizon}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[13px] font-semibold text-gray-800 dark:text-rdia-50">{r.type}</span>
                <span className="truncate text-xs text-gray-500 dark:text-rdia-300">{r.zone}</span>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${c.badge}`}>
                  {m.situational[NIV_KEY[r.niveau]]}
                </span>
                <span className={`font-mono text-[12px] font-bold tabular-nums ${c.text}`}>{r.probabilitePct}%</span>
              </div>
            </div>
            <ProgressBar value={r.probabilitePct} fill={c.fill} />
          </div>
        );
      })}
    </div>
  );
}
