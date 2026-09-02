"use client";

import { NAV_ICONS } from "@/lib/icons";
import { useDict, type AiMessage } from "@/lib/store";
import { BlockTable } from "./BlockTable";

/** Unités proposées (dix au plus), avec délai et couverture. */
export function UnitsBlock({ rows }: { rows: NonNullable<AiMessage["units"]> }) {
  const t = useDict();
  return (
    <BlockTable title={t.cp_tbl_units} icon={NAV_ICONS.units}>
      <tbody>
        {rows.slice(0, 10).map((u) => (
          <tr key={u.id} className="border-b border-gray-100 last:border-0 dark:border-rdia-700/50">
            <td className="px-2.5 py-1.5 font-medium text-gray-800 dark:text-rdia-100">{u.nom}</td>
            <td className="px-2.5 py-1.5 text-xs text-gray-500 dark:text-rdia-400">{u.ville}</td>
            <td className="px-2.5 py-1.5 text-end font-mono tabular-nums text-gray-600 dark:text-rdia-200">{u.etaMin} min</td>
            <td className="w-6 px-2.5 py-1.5 text-center">
              {u.within ? <span className="text-green-500">✓</span> : <span className="text-gray-300 dark:text-rdia-600">·</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </BlockTable>
  );
}
