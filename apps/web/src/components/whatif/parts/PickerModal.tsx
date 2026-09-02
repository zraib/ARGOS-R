"use client";

import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { NAV_ICONS, UI_ICONS } from "@/lib/icons";
import type { Incident } from "@/lib/types";
import { typeLabel } from "@/lib/helpers";
import {
  cn,
  sevLabel,
  } from "@/components/whatif/parts/shared";


// ============================================================================
// Modale picker
// ============================================================================
export function PickerModal({
  onClose,
  onPick,
  incidents,
  incidentTypes,
  presentTypes,
  typeFilter,
  setTypeFilter,
  q,
  setQ,
  lang,
  selectedId,
}: {
  onClose: () => void;
  onPick: (id: string) => void;
  incidents: Incident[];
  incidentTypes: any[];
  presentTypes: string[];
  typeFilter: string;
  setTypeFilter: (v: string) => void;
  q: string;
  setQ: (v: string) => void;
  lang: string;
  selectedId: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mt-16 w-full max-w-2xl rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-rdia-500 dark:bg-rdia-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 p-3 dark:border-rdia-600">
          <h3 className="text-[13px] font-bold text-gray-900 dark:text-rdia-100">
            Choisir un incident pour la simulation
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-gray-100 dark:text-rdia-400 dark:hover:bg-rdia-600"
          >
            <Icon path={UI_ICONS.close} size={16} strokeWidth={2.2} />
          </button>
        </div>
        <div className="space-y-2 border-b border-gray-100 p-3 dark:border-rdia-600">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Icon
                path={NAV_ICONS.seismic || UI_ICONS.sliders}
                size={13}
                strokeWidth={2}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-2 text-sm outline-none transition-all focus:border-or-500 focus:ring-2 focus:ring-or-500/20 dark:border-rdia-500 dark:bg-rdia-800 dark:text-rdia-100"
                placeholder="Rechercher par titre / région / ID"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-2 text-sm outline-none transition-all focus:border-or-500 dark:border-rdia-500 dark:bg-rdia-800 dark:text-rdia-100"
            >
              <option value="">Tous types</option>
              {presentTypes.map((id) => (
                <option key={id} value={id}>
                  {typeLabel(id, incidentTypes, lang as any)}
                </option>
              ))}
            </select>
          </div>
          <div className="text-[11px] font-semibold text-gray-400 dark:text-rdia-400">
            {incidents.length} incident(s) · cliquer pour charger dans la simulation
          </div>
        </div>
        <div className="max-h-[60vh] space-y-1 overflow-y-auto p-2">
          {incidents.length === 0 && (
            <div className="p-6 text-center text-sm text-gray-400 dark:text-rdia-400">
              Aucun incident ne correspond à votre recherche.
            </div>
          )}
          {incidents.map((i) => {
            const selected = i.id === selectedId;
            return (
              <button
                key={i.id}
                type="button"
                onClick={() => onPick(i.id)}
                className={cn(
                  "flex w-full items-start justify-between gap-2 rounded-lg border px-3 py-2 text-start transition-all",
                  selected
                    ? "border-or-500 bg-or-500/[0.07]"
                    : "border-transparent hover:border-gray-200 hover:bg-gray-50 dark:hover:border-rdia-500 dark:hover:bg-rdia-600",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-[13px] font-bold text-gray-900 dark:text-rdia-100">
                      {i.titre}
                    </span>
                    <Badge
                      type={i.sev}
                      label={sevLabel(i.sev, lang as any)}
                    />
                    <span className="truncate text-[11px] text-gray-500 dark:text-rdia-400">
                      {i.region} · {typeLabel(i.type, incidentTypes, lang as any)}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-gray-400 dark:text-rdia-400">
                    {i.id} · {new Date(i.time).toLocaleString("fr-FR")}
                  </div>
                </div>
                {selected && (
                  <Icon
                    path={UI_ICONS.check}
                    size={15}
                    strokeWidth={2.4}
                    className="mt-1 shrink-0 text-or-500"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
