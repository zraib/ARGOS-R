"use client";

import { NAV_ICONS } from "@/lib/icons";
import { useDict, type AiMessage } from "@/lib/store";
import { BlockTable } from "./BlockTable";

/** Établissements de santé : lits, occupation, réanimation libre, distance. */
export function HospitalsBlock({ rows }: { rows: NonNullable<AiMessage["hospitals"]> }) {
  const t = useDict();
  return (
    <BlockTable title={t.cp_tbl_health} icon={NAV_ICONS.hospitals}>
      <thead>
        <tr className="bg-gray-50 text-[10px] uppercase text-gray-400 dark:bg-rdia-700/40 dark:text-rdia-400">
          <th className="px-2.5 py-1.5 text-left font-medium">Établissement</th>
          <th className="px-2.5 py-1.5 text-left font-medium">Ville</th>
          <th className="px-2.5 py-1.5 text-right font-medium">Lits</th>
          <th className="px-2.5 py-1.5 text-right font-medium">Occup.</th>
          <th className="px-2.5 py-1.5 text-right font-medium">REA libre</th>
          <th className="px-2.5 py-1.5 text-right font-medium">Dist.</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((h) => {
          const reaLibre = Math.max(0, h.rea - Math.round(h.rea * h.icuPct / 100));
          return (
            <tr key={h.id} className="border-b border-gray-100 last:border-0 dark:border-rdia-700/50">
              <td className="px-2.5 py-1.5 font-medium text-gray-800 dark:text-rdia-100">{h.nom}</td>
              <td className="px-2.5 py-1.5 text-xs text-gray-500 dark:text-rdia-400">{h.ville || "—"}</td>
              <td className="px-2.5 py-1.5 text-end font-mono tabular-nums text-gray-700 dark:text-rdia-200">{h.lits}</td>
              <td className={`px-2.5 py-1.5 text-end font-mono tabular-nums ${h.occPct >= 90 ? "text-red-500" : h.occPct >= 70 ? "text-amber-500" : "text-emerald-500"}`}>{h.occPct}%</td>
              <td className="px-2.5 py-1.5 text-end font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{reaLibre}</td>
              <td className="px-2.5 py-1.5 text-end font-mono tabular-nums text-gray-500 dark:text-rdia-400">{h.distanceKm != null ? `${h.distanceKm.toFixed(1)} km` : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </BlockTable>
  );
}
