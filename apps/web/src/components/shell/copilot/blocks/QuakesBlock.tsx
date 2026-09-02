"use client";

import { NAV_ICONS } from "@/lib/icons";
import { useDict, type AiMessage, useModules } from "@/lib/store";
import { BlockTable } from "./BlockTable";

/** Séismes récents cités par la réponse. */
export function QuakesBlock({ rows }: { rows: NonNullable<AiMessage["quakes"]> }) {
  const t = useDict();
  const m = useModules();
  return (
    <BlockTable title={t.cp_tbl_seismic} icon={NAV_ICONS.seismic}>
      <thead>
        <tr className="bg-gray-50 text-[10px] uppercase text-gray-400 dark:bg-rdia-700/40 dark:text-rdia-400">
          <th className="px-2.5 py-1.5 text-left font-medium">{m.copilot.col_date}</th>
          <th className="px-2.5 py-1.5 text-left font-medium">{m.copilot.col_region}</th>
          <th className="px-2.5 py-1.5 text-right font-medium">{m.copilot.col_mag}</th>
          <th className="px-2.5 py-1.5 text-right font-medium">{m.copilot.col_depth}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((q) => (
          <tr key={q.id} className="border-b border-gray-100 last:border-0 dark:border-rdia-700/50">
            <td className="whitespace-nowrap px-2.5 py-1.5 font-mono text-[11px] text-gray-500 dark:text-rdia-400">
              {new Date(q.time).toLocaleString("fr-FR", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </td>
            <td className="px-2.5 py-1.5 text-sm text-gray-800 dark:text-rdia-100">{q.region}</td>
            <td className={`px-2.5 py-1.5 text-end font-mono tabular-nums font-semibold ${q.mag >= 5.5 ? "text-red-500" : q.mag >= 4 ? "text-or-500" : "text-amber-500"}`}>{q.mag.toFixed(1)}</td>
            <td className="px-2.5 py-1.5 text-end font-mono tabular-nums text-gray-600 dark:text-rdia-300">{q.depth} km</td>
          </tr>
        ))}
      </tbody>
    </BlockTable>
  );
}
