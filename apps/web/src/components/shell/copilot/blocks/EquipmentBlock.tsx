"use client";

import { UI_ICONS } from "@/lib/icons";
import { Pill } from "@/components/ui/Pill";
import { useDict, type AiMessage, useModules } from "@/lib/store";
import { BlockTable } from "./BlockTable";

/** Inventaire : stock, seuil et état (HS / sous seuil / OK). */
export function EquipmentBlock({ rows }: { rows: NonNullable<AiMessage["equipment"]> }) {
  const t = useDict();
  const m = useModules();
  return (
    <BlockTable title={t.cp_tbl_inventory} icon={UI_ICONS.archive}>
      <thead>
        <tr className="bg-gray-50 text-[10px] uppercase text-gray-400 dark:bg-rdia-700/40 dark:text-rdia-400">
          <th className="px-2.5 py-1.5 text-left font-medium">{m.copilot.col_equipment}</th>
          <th className="px-2.5 py-1.5 text-left font-medium">{m.copilot.col_category}</th>
          <th className="px-2.5 py-1.5 text-left font-medium">{m.copilot.col_unit}</th>
          <th className="px-2.5 py-1.5 text-right font-medium">{m.copilot.col_stock}</th>
          <th className="px-2.5 py-1.5 text-right font-medium">{m.copilot.col_threshold}</th>
          <th className="px-2.5 py-1.5 text-left font-medium">{m.copilot.col_state}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((e, idx) => {
          const sousSeuil = e.seuil != null && e.stock <= e.seuil;
          const isHS = /hs|hors|servis|oos|répar/i.test(e.cond);
          const alert = isHS ? "red" : sousSeuil ? "amber" : "green";
          const label = isHS ? m.copilot.state_hs : sousSeuil ? m.copilot.state_below : m.copilot.state_ok;
          return (
            <tr key={`${e.id}-${idx}`} className="border-b border-gray-100 last:border-0 dark:border-rdia-700/50">
              <td className="px-2.5 py-1.5 font-medium text-gray-800 dark:text-rdia-100">{e.desig}</td>
              <td className="px-2.5 py-1.5 text-xs text-gray-500 dark:text-rdia-400">{e.cat}</td>
              <td className="px-2.5 py-1.5 text-xs text-gray-500 dark:text-rdia-400">{e.unit || "—"}</td>
              <td className="px-2.5 py-1.5 text-end font-mono tabular-nums text-gray-700 dark:text-rdia-200">{e.stock}</td>
              <td className="px-2.5 py-1.5 text-end font-mono tabular-nums text-gray-400 dark:text-rdia-500">{e.seuil ?? "—"}</td>
              <td className="px-2.5 py-1.5"><Pill tone={alert as "green" | "amber" | "red"} label={label} size="sm" /></td>
            </tr>
          );
        })}
      </tbody>
    </BlockTable>
  );
}
