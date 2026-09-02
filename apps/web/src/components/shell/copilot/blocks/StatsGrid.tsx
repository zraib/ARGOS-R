"use client";

import type { AiAnswerStats } from "@/lib/ai/assistant";
import { toneForLevel } from "../format";

/** Indicateurs chiffrés d'une réponse, colorés par niveau. */
export function StatsGrid({ stats }: { stats: AiAnswerStats }) {
  if (!stats.items) return null;
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {stats.items.map((k) => (
        <div key={k.label} className="rounded-lg border border-gray-100 bg-white p-2 text-center dark:border-rdia-700 dark:bg-rdia-700/50">
          <div className={`text-lg font-bold tabular-nums ${toneForLevel(k.level)}`}>{k.value}</div>
          <div className="truncate text-[10px] text-gray-500 dark:text-rdia-300">{k.label}</div>
        </div>
      ))}
    </div>
  );
}
