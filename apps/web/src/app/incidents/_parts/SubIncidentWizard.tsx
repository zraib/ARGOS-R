"use client";

import { useMemo, useState } from "react";
import { useArgos, useDict } from "@/lib/store";
import { api } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { UI_ICONS } from "@/lib/icons";
import { sevBadge, subTypeLabel} from "@/lib/helpers";
import type { Incident, Severity } from "@/lib/types";
import {
  SEVS,
  } from "@/app/incidents/_parts/shared";


/**
 * Modale SÉPARÉE d'ajout d'un sous-incident : assistant en 3 étapes (mêmes
 * rubriques qu'un incident principal). Rendue au niveau de la page, en frère de
 * la modale de détails — jamais imbriquée dedans.
 */
export function SubIncidentWizard({ incident, onClose }: { incident: Incident; onClose: () => void }) {
  const t = useDict();
  const lang = useArgos((s) => s.lang);
  const subCatalog = useArgos((s) => s.subCatalog);
  const units = useArgos((s) => s.units);
  const hospitals = useArgos((s) => s.hospitals);
  const loadDomain = useArgos((s) => s.loadDomain);
  const showToast = useArgos((s) => s.showToast);

  // Sous-types suggérés pour le type d'incident parent, « Autre » toujours en fin.
  const suggested = subCatalog.byParent[incident.type] ?? [];
  const options = useMemo(() => {
    const ids = [...suggested, ...(suggested.includes("other") ? [] : ["other"])];
    return ids
      .map((id) => ({ value: id, label: subTypeLabel(id, subCatalog.types, lang) }))
      .filter((o) => o.label);
  }, [suggested, subCatalog.types, lang]);

  const [type, setType] = useState("");
  const [sev, setSev] = useState<Severity>("medium");
  const [note, setNote] = useState("");
  // Coordonnées pré-remplies avec celles de l'incident parent (modifiables).
  const [lat, setLat] = useState(incident.ll[1].toFixed(4));
  const [lng, setLng] = useState(incident.ll[0].toFixed(4));
  const [dead, setDead] = useState("");
  const [injured, setInjured] = useState("");
  const [missing, setMissing] = useState("");
  const [selUnits, setSelUnits] = useState<string[]>([]);
  const [selHosps, setSelHosps] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(1); // 1 type/gravité · 2 localisation · 3 victimes & moyens

  const toggle = (setter: (fn: (a: string[]) => string[]) => void, id: string) =>
    setter((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  const submit = async () => {
    if (!type || busy) return;
    setBusy(true);
    try {
      const latN = parseFloat(lat), lngN = parseFloat(lng);
      const d = parseInt(dead, 10) || 0, inj = parseInt(injured, 10) || 0, mis = parseInt(missing, 10) || 0;
      const hasCasualties = d > 0 || inj > 0 || mis > 0;
      const hasResp = selUnits.length > 0 || selHosps.length > 0;
      await api.addSubIncident(incident.id, {
        type,
        sev,
        note: note.trim() || undefined,
        ll: Number.isFinite(latN) && Number.isFinite(lngN) ? [lngN, latN] : undefined,
        casualties: hasCasualties ? { dead: d, injured: inj, missing: mis } : undefined,
        responders: hasResp ? { units: selUnits, hospitals: selHosps } : undefined,
      });
      await loadDomain();
      showToast(t.si_added);
      onClose();
    } catch (err: unknown) {
      // Un refus de l'API (validation, droits) se lisait seulement en console.
      showToast(`${t.toast_fail} — ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  // 16 px sur mobile : en dessous, iOS zoome au focus et décale toute la modale.
  const numCls = "input-champ text-base md:text-sm";
  const lblCls = "mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400";
  const chip = (on: boolean) =>
    `rounded-md px-2 py-2 text-xs font-medium transition-colors lg:py-1 lg:text-[11px] ${
      on ? "bg-or-500/15 text-or-600 dark:text-or-400" : "bg-gray-100 text-gray-500 hover:text-or-500 dark:bg-rdia-700/50 dark:text-rdia-300"
    }`;

  return (
    <Modal open title={`${t.si_add} — ${incident.id}`} onClose={onClose} size="lg">
      <div className="flex flex-col gap-4">
        {/* Stepper */}
        <div className="flex items-center gap-2">
          {[t.si_type, t.wz3, t.wz4].map((label, i) => {
            const num = i + 1;
            const done = step > num;
            const cur = step === num;
            return (
              <div key={label} className="flex flex-1 items-center gap-2">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${cur ? "bg-or-500 text-rdia-600" : done ? "bg-or-500/20 text-or-500" : "bg-gray-100 text-gray-400 dark:bg-rdia-600 dark:text-rdia-300"}`}>
                  {done ? <Icon path={UI_ICONS.check} size={12} strokeWidth={3} /> : num}
                </span>
                <span className={`hidden truncate text-xs font-medium sm:block ${cur ? "text-gray-800 dark:text-rdia-50" : "text-gray-400 dark:text-rdia-400"}`}>{label}</span>
                {num < 3 && <span className="h-px flex-1 bg-gray-200 dark:bg-rdia-600" />}
              </div>
            );
          })}
        </div>

        {/* Étape 1 — type & gravité + précision */}
        {step === 1 && (
          <div className="flex flex-col gap-3">
            <div>
              <label className={lblCls}>{t.si_type}</label>
              {/* Tuiles compactes : deux colonnes tiennent à 375 px, trois dès sm. */}
              <div className="grid max-h-[36dvh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                {options.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setType(o.value)}
                    className={`rounded-xl border-2 p-3 text-start text-xs font-semibold leading-tight transition-all ${
                      type === o.value
                        ? "border-or-500 bg-or-500/10 text-or-500"
                        : "border-gray-200 text-gray-600 hover:border-or-500/40 dark:border-rdia-600 dark:text-rdia-200"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={lblCls}>{t.col_sev}</label>
              <div className="flex gap-2">
                {SEVS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSev(s)}
                    className={`flex-1 rounded-lg border-2 py-2 text-xs font-semibold transition-colors ${
                      sev === s ? "border-or-500 bg-or-500/10 text-or-500" : "border-gray-200 text-gray-500 hover:border-or-500/40 dark:border-rdia-600 dark:text-rdia-300"
                    }`}
                  >
                    {sevBadge(s, t).label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={lblCls}>{t.si_note}</label>
              <input className="input-champ text-base md:text-sm" placeholder={t.si_note} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        )}

        {/* Étape 2 — localisation (pré-remplie depuis l'incident parent) */}
        {step === 2 && (
          <div className="flex flex-col gap-3">
            <p className="text-[11px] text-gray-400 dark:text-rdia-400">{t.si_loc_hint}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lblCls}>{t.wz_lat}</label>
                <input className={numCls} type="number" step="0.0001" value={lat} onChange={(e) => setLat(e.target.value)} />
              </div>
              <div>
                <label className={lblCls}>{t.wz_lng}</label>
                <input className={numCls} type="number" step="0.0001" value={lng} onChange={(e) => setLng(e.target.value)} />
              </div>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2 font-mono text-[11px] text-gray-500 dark:bg-rdia-700/40 dark:text-rdia-300">
              {t.f_coords} : {lat || "—"}, {lng || "—"}
            </div>
          </div>
        )}

        {/* Étape 3 — victimes & moyens */}
        {step === 3 && (
          <div className="flex flex-col gap-4">
            <div>
              <label className={lblCls}>{t.wz_casualties} <span className="normal-case text-gray-300 dark:text-rdia-500">({t.si_optional})</span></label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={lblCls}>{t.wz_dead}</label>
                  <input className={numCls} type="number" min="0" value={dead} onChange={(e) => setDead(e.target.value)} />
                </div>
                <div>
                  <label className={lblCls}>{t.wz_injured}</label>
                  <input className={numCls} type="number" min="0" value={injured} onChange={(e) => setInjured(e.target.value)} />
                </div>
                <div>
                  <label className={lblCls}>{t.wz_missing}</label>
                  <input className={numCls} type="number" min="0" value={missing} onChange={(e) => setMissing(e.target.value)} />
                </div>
              </div>
            </div>
            <div>
              <label className={lblCls}>{t.lg_units}</label>
              <div className="flex flex-wrap gap-1.5">
                {units.map((u) => (
                  <button key={u.id} type="button" className={chip(selUnits.includes(u.id))} onClick={() => toggle(setSelUnits, u.id)}>{u.nom}</button>
                ))}
              </div>
            </div>
            <div>
              <label className={lblCls}>{t.lg_hosp}</label>
              <div className="flex flex-wrap gap-1.5">
                {hospitals.map((h) => (
                  <button key={h.id} type="button" className={chip(selHosps.includes(h.id))} onClick={() => toggle(setSelHosps, h.id)}>{h.nom}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Navigation du wizard */}
        <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-4 dark:border-rdia-700/50">
          <button className="btn-secondaire cible-tactile text-sm md:text-xs" onClick={() => (step > 1 ? setStep(step - 1) : onClose())}>
            {step > 1 ? t.prev : t.no}
          </button>
          {step < 3 ? (
            <button className="btn-primaire cible-tactile text-sm disabled:opacity-50 md:text-xs" onClick={() => setStep(step + 1)} disabled={step === 1 && !type}>{t.next}</button>
          ) : (
            <button className="btn-primaire cible-tactile text-sm disabled:opacity-50 md:text-xs" onClick={submit} disabled={!type || busy}>{t.si_add}</button>
          )}
        </div>
      </div>
    </Modal>
  );
}
