"use client";

import { useModules } from "@/lib/store";
import { useMemo, useState } from "react";
import { ARGOS_WARD_REFERENCE, type HospitalStoredService, type HospitalServiceKey } from "@/lib/types";

export interface WardsEditorValue extends HospitalStoredService {}

const num = (v: string, min = 0) => Math.max(min, Number(v) || 0);

/**
 * Éditeur dynamique de services / wards hospitaliers.
 *  - Dropdown du référentiel ARGOS (~20 services)
 *  - Possibilité d'ajouter / supprimer des lignes
 *  - Validation occ ≤ total + autosomme des totaux
 */
export function WardsEditor({
  value,
  onChange,
}: {
  value: WardsEditorValue[];
  onChange: (v: WardsEditorValue[]) => void;
}) {
  const m = useModules();
  // Clé libre (custom) · 1 seul champ texte à la fois
  const [pendingCustom, setPendingCustom] = useState<string>("");

  const usedKeys = useMemo(() => new Set(value.map((s) => s.key)), [value]);

  const totals = useMemo(() => {
    const total = value.reduce((a, s) => a + s.total, 0);
    const occ = value.reduce((a, s) => a + s.occ, 0);
    const reaRow = value.find((s) => s.key === "rea");
    return { total, occ, rea: reaRow?.total ?? 0, reaOcc: reaRow?.occ ?? 0 };
  }, [value]);

  const addWard = (key: HospitalServiceKey, forcedName?: string) => {
    const ref = ARGOS_WARD_REFERENCE.find((r) => r.key === key);
    const name = forcedName ?? ref?.label ?? String(key);
    onChange([...value, { key, name, total: 0, occ: 0 }]);
  };

  const removeWard = (key: HospitalServiceKey) => {
    onChange(value.filter((s) => s.key !== key));
  };

  const updateField = (key: HospitalServiceKey, field: "total" | "occ", v: number) => {
    onChange(
      value.map((s) =>
        s.key === key
          ? {
              ...s,
              [field]: field === "occ" ? Math.min(s.total, Math.max(0, v)) : Math.max(0, v),
            }
          : s,
      ),
    );
  };

  const submitCustom = () => {
    const n = pendingCustom.trim();
    if (!n) return;
    const key: HospitalServiceKey = `custom_${Date.now().toString(36)}`;
    addWard(key, n);
    setPendingCustom("");
  };

  const availableOptions = ARGOS_WARD_REFERENCE.filter((r) => !usedKeys.has(r.key));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-rdia-300">
          {m.hospinet.wards_capacities}
        </div>
        <div className="text-[11px] font-semibold text-gray-500 dark:text-rdia-300">
          {m.hospinet.total_colon} <span className="tabular-nums font-bold text-gray-900 dark:text-white">{totals.total}</span> lits ·{" "}
          <span className="tabular-nums font-bold text-or-600 dark:text-or-400">{totals.occ}</span> {m.hospinet.occ_abbr}
        </div>
      </div>

      {/* Liste des services */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-50/70 dark:border-rdia-600 dark:bg-rdia-800/40">
        <div className="grid grid-cols-6 gap-3 border-b border-gray-200 bg-white px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:border-rdia-600 dark:bg-rdia-700 dark:text-rdia-300">
          <div className="col-span-2">{m.hospinet.col_service}</div>
          <div className="text-right">{m.hospinet.col_beds}</div>
          <div className="text-right">{m.hospinet.col_occupied}</div>
          <div className="text-right">{m.hospinet.col_occ_rate}</div>
          <div />
        </div>
        <div className="divide-y divide-gray-200 dark:divide-rdia-600">
          {value.length === 0 && (
            <div className="px-4 py-6 text-center text-[12px] text-gray-400 dark:text-rdia-400">
              {m.hospinet.no_ward_hint}
            </div>
          )}
          {value.map((s) => {
            const pct = s.total > 0 ? Math.round((s.occ / s.total) * 100) : 0;
            const cls =
              s.total === 0
                ? "text-gray-400"
                : pct >= 92
                  ? "text-danger-600 dark:text-danger-300"
                  : pct >= 75
                    ? "text-or-600 dark:text-or-400"
                    : "text-green-700 dark:text-green-400";
            return (
              <div key={s.key} className="grid grid-cols-6 items-center gap-3 px-4 py-2.5">
                <div className="col-span-2 min-w-0">
                  <div className={`truncate text-[12px] font-bold ${s.key === "rea" ? "text-danger-700 dark:text-danger-300" : "text-gray-900 dark:text-white"}`}>
                    {s.name}
                  </div>
                </div>
                <div>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm tabular-nums outline-none transition-colors focus:border-or-500 dark:border-rdia-600 dark:bg-rdia-700"
                    value={s.total}
                    onChange={(e) => updateField(s.key, "total", num(e.target.value))}
                  />
                </div>
                <div>
                  <input
                    type="number"
                    min={0}
                    max={s.total}
                    className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm tabular-nums outline-none transition-colors focus:border-or-500 dark:border-rdia-600 dark:bg-rdia-700"
                    value={s.occ}
                    onChange={(e) => updateField(s.key, "occ", num(e.target.value))}
                  />
                </div>
                <div className={`text-right text-[13px] font-extrabold tabular-nums ${cls}`}>
                  {s.total > 0 ? `${pct} %` : "—"}
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    aria-label={m.hospinet.remove_ward}
                    title={m.hospinet.remove_ward}
                    onClick={() => removeWard(s.key)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-danger-500/10 hover:text-danger-600 dark:hover:text-danger-300"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M3 6h18" />
                      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Ajout d'un service */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
        <select
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-or-500 disabled:opacity-50 dark:border-rdia-600 dark:bg-rdia-700"
          disabled={availableOptions.length === 0}
          value=""
          onChange={(e) => {
            if (!e.target.value) return;
            addWard(e.target.value as HospitalServiceKey);
            e.currentTarget.value = "";
          }}
        >
          <option value="">{m.hospinet.add_from_ref}</option>
          {availableOptions.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            type="text"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition-colors placeholder:text-gray-400 focus:border-or-500 dark:border-rdia-600 dark:bg-rdia-700 sm:w-56"
            placeholder={m.hospinet.custom_ward}
            value={pendingCustom}
            onChange={(e) => setPendingCustom(e.target.value)}
          />
          <button
            type="button"
            onClick={submitCustom}
            disabled={!pendingCustom.trim()}
            className="btn-secondaire text-sm disabled:opacity-50"
          >
            {m.hospinet.add}
          </button>
        </div>
      </div>
    </div>
  );
}

export function autosumServices(value: WardsEditorValue[]) {
  const total = value.reduce((a, s) => a + s.total, 0);
  const occ = value.reduce((a, s) => a + s.occ, 0);
  const reaRow = value.find((s) => s.key === "rea");
  return {
    lits: total,
    occ,
    rea: reaRow?.total ?? 0,
    reaOcc: reaRow?.occ ?? 0,
  };
}
