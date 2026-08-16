"use client";

import { useArgos, useModules } from "@/lib/store";
import { type SupplyStatus } from "@/lib/data/modules";
import { StatTile } from "@/components/ui/StatTile";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Pill, type Tone } from "@/components/ui/Pill";
import { occBarClass } from "@/lib/helpers";
import { NAV_ICONS, KPI_ICONS } from "@/lib/icons";

const SUPPLY: Record<SupplyStatus, { tone: Tone; key: "sup_ok" | "sup_low" | "sup_critical" }> = {
  ok: { tone: "green", key: "sup_ok" },
  low: { tone: "amber", key: "sup_low" },
  critical: { tone: "red", key: "sup_critical" },
};

export default function AbrisPage() {
  const catalog = useArgos((s) => s.catalog);
  const SHELTERS = catalog.shelters;
  const m = useModules();
  const active = SHELTERS.length;
  const capacity = SHELTERS.reduce((s, x) => s + x.capacity, 0);
  const displaced = SHELTERS.reduce((s, x) => s + x.occupants, 0);

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label={m.shelters.kpi_active} value={active} icon={NAV_ICONS.shelters} tint="or" />
        <StatTile label={m.shelters.kpi_capacity} value={capacity.toLocaleString("fr-FR")} icon={KPI_ICONS.beds} tint="blue" />
        <StatTile label={m.shelters.kpi_displaced} value={displaced.toLocaleString("fr-FR")} icon={KPI_ICONS.personnel} tint="green" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SHELTERS.map((s) => {
          const pct = Math.round((s.occupants / s.capacity) * 100);
          const sup = SUPPLY[s.supplies];
          return (
            <div key={s.id} className="carte flex flex-col gap-3 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-bold leading-snug text-rdia-600 dark:text-rdia-50">{s.nom}</h3>
                  <div className="mt-0.5 text-xs text-gray-500 dark:text-rdia-300">{s.ville}</div>
                </div>
                <span className="shrink-0"><Pill tone={sup.tone} label={m.shelters[sup.key]} /></span>
              </div>
              <div>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 text-xs text-gray-400 dark:text-rdia-400 md:text-[10px]">
                  <span>{m.shelters.col_occupancy}</span>
                  <span className="font-mono tabular-nums">{s.occupants} / {s.capacity} · {pct}%</span>
                </div>
                <ProgressBar value={pct} fill={occBarClass(pct)} />
              </div>
              <div className="grid grid-cols-3 gap-2 border-y border-gray-100 py-2 dark:border-rdia-700/50">
                {[
                  { label: m.shelters.adults, value: s.adults },
                  { label: m.shelters.children, value: s.children },
                  { label: m.shelters.elderly, value: s.elderly },
                ].map((d) => (
                  <div key={d.label} className="text-center">
                    <div className="text-sm font-bold tabular-nums text-gray-800 dark:text-rdia-50">{d.value}</div>
                    <div className="text-xs uppercase tracking-wide text-gray-400 dark:text-rdia-400 md:text-[9px]">{d.label}</div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-[13px] sm:text-xs">
                <span className="shrink-0 text-gray-500 dark:text-rdia-300">{m.shelters.col_needs}</span>
                <span className={`min-w-0 break-words text-end font-medium ${s.needs === "—" ? "text-gray-400 dark:text-rdia-400" : "text-or-500"}`}>{s.needs}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
