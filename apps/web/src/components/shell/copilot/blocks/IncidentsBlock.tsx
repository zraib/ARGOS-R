"use client";

import { NAV_ICONS } from "@/lib/icons";
import { type AiMessage, useModules } from "@/lib/store";
import { BlockTable } from "./BlockTable";
import { sevBadge } from "../format";

/** Tableau des incidents cités par la réponse. */
export function IncidentsBlock({ rows }: { rows: NonNullable<AiMessage["incidents"]> }) {
  const m = useModules();
  return (
    <BlockTable title={m.copilot.col_incidents} icon={NAV_ICONS.incidents}>
      <thead>
        <tr className="bg-gray-50 text-[10px] uppercase text-gray-400 dark:bg-rdia-700/40 dark:text-rdia-400">
          <th className="px-2.5 py-1.5 text-left font-medium">ID</th>
          <th className="px-2.5 py-1.5 text-left font-medium">{m.copilot.col_title}</th>
          <th className="px-2.5 py-1.5 text-left font-medium">{m.copilot.col_region}</th>
          <th className="px-2.5 py-1.5 text-left font-medium">{m.copilot.col_sev}</th>
          <th className="px-2.5 py-1.5 text-left font-medium">{m.copilot.col_status}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((i) => (
          <tr key={i.id} className="border-b border-gray-100 last:border-0 dark:border-rdia-700/50">
            <td className="whitespace-nowrap px-2.5 py-1.5 font-mono text-[11px] text-gray-500 dark:text-rdia-400">{i.id}</td>
            <td className="px-2.5 py-1.5 text-sm font-medium text-gray-800 dark:text-rdia-100">{i.titre}</td>
            <td className="px-2.5 py-1.5 text-xs text-gray-500 dark:text-rdia-400">{i.region || "—"}</td>
            <td className={`px-2.5 py-1.5 text-xs font-semibold ${sevBadge(i.sev)}`}>{i.sev || "—"}</td>
            <td className="px-2.5 py-1.5 text-xs text-gray-500 dark:text-rdia-400">{i.st || "—"}</td>
          </tr>
        ))}
      </tbody>
    </BlockTable>
  );
}
