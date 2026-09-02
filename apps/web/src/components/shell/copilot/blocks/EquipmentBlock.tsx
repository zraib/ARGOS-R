"use client";

import { UI_ICONS } from "@/lib/icons";
import { Pill } from "@/components/ui/Pill";
import { useDict, type AiMessage } from "@/lib/store";
import { BlockTable } from "./BlockTable";

/** Inventaire : stock, seuil et état (HS / sous seuil / OK). */
export function EquipmentBlock({ rows }: { rows: NonNullable<AiMessage["equipment"]> }) {
  const t = useDict();
  return (
    <BlockTable title={t.cp_tbl_inventory} icon={UI_ICONS.archive}>
      <thead>
        <tr className="bg-gray-50 text-[10px] uppercase text-gray-400 dark:bg-rdia-700/40 dark:text-rdia-400">
          <th className="px-2.5 py-1.5 text-left font-medium">Équipement</th>
          <th className="px-2.5 py-1.5 text-left font-medium">Catégorie</th>
          <th className="px-2.5 py-1.5 text-left font-medium">Unité</th>
          <th className="px-2.5 py-1.5 text-right font-medium">Stock</th>
          <th className="px-2.5 py-1.5 text-right font-medium">Seuil</th>
          <th className="px-2.5 py-1.5 text-left font-medium">État</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((e, idx) => {
          const sousSeuil = e.seuil != null && e.stock <= e.seuil;
          const isHS = /hs|hors|servis|oos|répar/i.test(e.cond);
          const alert = isHS ? "red" : sousSeuil ? "amber" : "green";
          const label = isHS ? "HS" : sousSeuil ? "Sous seuil" : "OK";
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
