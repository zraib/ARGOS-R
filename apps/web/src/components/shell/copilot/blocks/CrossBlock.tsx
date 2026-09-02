"use client";

import { Icon } from "@/components/ui/Icon";
import { NAV_ICONS, UI_ICONS } from "@/lib/icons";
import { type AiMessage } from "@/lib/store";
import { BlockTable } from "./BlockTable";

/** Analyse croisée : incident cible, unités recommandées (scores décomposés), hôpitaux, inventaire, séismes proches. */
export function CrossBlock({ cross }: { cross: NonNullable<AiMessage["cross"]> }) {
  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-or-500">
        <Icon path={UI_ICONS.branch} size={12} /> Analyse croisée
      </div>
      {cross.incident && (
        <div className="rounded-lg border border-gray-100 p-2.5 text-xs dark:border-rdia-700">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-rdia-400">1 · Incident cible</div>
          <div className="text-sm font-semibold text-gray-800 dark:text-rdia-100">{cross.incident.id} — {cross.incident.titre}</div>
          <div className="mt-0.5 text-[11px] text-gray-500 dark:text-rdia-300">
            {cross.incident.region}{cross.incident.lieu ? ` · ${cross.incident.lieu}` : ""}
            {cross.incident.coords ? ` · (${cross.incident.coords[0].toFixed(2)}, ${cross.incident.coords[1].toFixed(2)})` : ""}
            {cross.incident.sev ? ` · ${cross.incident.sev}` : ""}
          </div>
        </div>
      )}
      {cross.recommendedUnits && cross.recommendedUnits.length > 0 && (
        <BlockTable title="2 · Unités recommandées (scores décomposés)" icon={NAV_ICONS.units}>
          <thead>
            <tr className="bg-gray-50 text-[10px] uppercase text-gray-400 dark:bg-rdia-700/40 dark:text-rdia-400">
              <th className="px-2.5 py-1.5 text-left font-medium">Unité</th>
              <th className="px-2.5 py-1.5 text-right font-medium">Score</th>
              <th className="px-2.5 py-1.5 text-right font-medium">Temps</th>
              <th className="px-2.5 py-1.5 text-right font-medium">Cap.</th>
              <th className="px-2.5 py-1.5 text-right font-medium">Région</th>
              <th className="px-2.5 py-1.5 text-right font-medium">Dispo</th>
            </tr>
          </thead>
          <tbody>
            {cross.recommendedUnits.map((u, idx) => (
              <tr key={`cr-${idx}-${u.unit.id}`} className="border-b border-gray-100 last:border-0 dark:border-rdia-700/50">
                <td className="px-2.5 py-1.5">
                  <div className="font-medium text-gray-800 dark:text-rdia-100">{u.unit.nom}</div>
                  <div className="text-[10px] text-gray-400 dark:text-rdia-500">{u.unit.ville}{u.unit.type ? ` · ${u.unit.type}` : ""}</div>
                </td>
                <td className="px-2.5 py-1.5 text-end font-mono tabular-nums font-bold text-or-500">{u.score.toFixed(1)}</td>
                <td className={`px-2.5 py-1.5 text-end font-mono tabular-nums ${u.timeScore >= 0.7 ? "text-emerald-500" : u.timeScore >= 0.4 ? "text-amber-500" : "text-red-500"}`}>{u.timeScore.toFixed(2)}</td>
                <td className="px-2.5 py-1.5 text-end font-mono tabular-nums text-blue-500">{u.capScore.toFixed(2)}</td>
                <td className="px-2.5 py-1.5 text-end font-mono tabular-nums text-purple-500">{u.regionScore.toFixed(2)}</td>
                <td className="px-2.5 py-1.5 text-end font-mono tabular-nums text-green-600">{u.dispoScore.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </BlockTable>
      )}
      {cross.hospitals && cross.hospitals.length > 0 && (
        <BlockTable title="3 · Hôpitaux proches & capacité" icon={NAV_ICONS.hospitals}>
          <thead>
            <tr className="bg-gray-50 text-[10px] uppercase text-gray-400 dark:bg-rdia-700/40 dark:text-rdia-400">
              <th className="px-2.5 py-1.5 text-left font-medium">Hôpital</th>
              <th className="px-2.5 py-1.5 text-right font-medium">Dist.</th>
              <th className="px-2.5 py-1.5 text-right font-medium">Occup.</th>
              <th className="px-2.5 py-1.5 text-right font-medium">Lits libres</th>
              <th className="px-2.5 py-1.5 text-right font-medium">REA libre</th>
            </tr>
          </thead>
          <tbody>
            {cross.hospitals.map((h) => {
              const litsLibres = Math.max(0, h.lits - Math.round(h.lits * h.occPct / 100));
              const reaLibre = Math.max(0, h.rea - Math.round(h.rea * h.icuPct / 100));
              return (
                <tr key={`ch-${h.id}`} className="border-b border-gray-100 last:border-0 dark:border-rdia-700/50">
                  <td className="px-2.5 py-1.5 font-medium text-gray-800 dark:text-rdia-100">{h.nom}</td>
                  <td className="px-2.5 py-1.5 text-end font-mono tabular-nums text-gray-600 dark:text-rdia-300">{h.distanceKm?.toFixed(1)} km</td>
                  <td className={`px-2.5 py-1.5 text-end font-mono tabular-nums ${h.occPct >= 90 ? "text-red-500" : "text-emerald-500"}`}>{h.occPct}%</td>
                  <td className="px-2.5 py-1.5 text-end font-mono tabular-nums text-gray-700 dark:text-rdia-200">{litsLibres}</td>
                  <td className="px-2.5 py-1.5 text-end font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{reaLibre}</td>
                </tr>
              );
            })}
          </tbody>
        </BlockTable>
      )}
      {cross.unitEquipment && cross.unitEquipment.length > 0 && (
        <BlockTable title="4 · Inventaire rattaché aux unités TOP" icon={UI_ICONS.archive}>
          <tbody>
            {cross.unitEquipment.map((x, idx) => (
              <tr key={`cue-${idx}`} className="border-b border-gray-100 last:border-0 dark:border-rdia-700/50">
                <td className="w-32 px-2.5 py-1.5 font-medium text-gray-800 dark:text-rdia-100">{x.unitName}</td>
                <td className="px-2.5 py-1.5 text-sm text-gray-700 dark:text-rdia-200">
                  {x.equipment.length
                    ? x.equipment.map((e) => `${e.stock}× ${e.desig}${e.cond !== "OK" ? ` (${e.cond})` : ""}`).join(" · ")
                    : <span className="text-gray-400 dark:text-rdia-500 italic text-xs">Aucun équipement rattaché</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </BlockTable>
      )}
      {cross.quakes && cross.quakes.length > 0 && (
        <div className="rounded-lg border border-gray-100 p-2.5 text-xs dark:border-rdia-700">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-rdia-400">5 · Séismes &lt; 100 km</div>
          <ul className="space-y-0.5">
            {cross.quakes.map((q) => (
              <li key={q.id} className="flex justify-between gap-2">
                <span className="font-mono text-[11px] text-gray-500 dark:text-rdia-400 shrink-0">
                  {new Date(q.time).toLocaleString("fr-FR", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="flex-1 truncate text-gray-700 dark:text-rdia-200">{q.region}</span>
                <span className={`shrink-0 font-mono tabular-nums ${(q as unknown as { mag?: number }).mag != null && (q as unknown as { mag: number }).mag >= 5 ? "text-red-500" : "text-or-500"}`}>
                  M{(q as unknown as { mag?: number }).mag?.toFixed(1) ?? "?"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
