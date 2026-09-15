"use client";

import { useDict, useModules } from "@/lib/store";
import { casualtySecondary, needsMorgue, type WizardForm } from "@/lib/incidents/wizard";
import { ResponderRow } from "./ResponderRow";
import { labelCls, sectionCls } from "./styles";
import type { WizardActions } from "./useWizardForm";

type Ranked = { id: string; nom: string; ville: string; km: number | null };

/** Étape 4 — bilan humain et premiers intervenants suggérés par proximité. */
export function StepCasualties({
  form,
  actions,
  nearUnits,
  nearHosps,
  nearMorgues,
}: {
  form: WizardForm;
  actions: WizardActions;
  nearUnits: Ranked[];
  nearHosps: Ranked[];
  nearMorgues: Ranked[];
}) {
  const t = useDict();
  const m = useModules();
  const secondary = casualtySecondary(form.type);
  const count = (field: "dead" | "missing" | typeof secondary.field, value: string) => (
    <input type="number" min={0} className="input-champ text-sm" placeholder="0" value={value} onChange={(e) => actions.patch({ [field]: e.target.value })} />
  );
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className={sectionCls}>{t.wz_casualties}</div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>{m.wizard.dead}</label>
            {count("dead", form.dead)}
          </div>
          <div>
            <label className={`${labelCls} ${secondary.color}`}>{secondary.label}</label>
            {count(secondary.field, form[secondary.field])}
          </div>
          <div>
            <label className={labelCls}>{m.wizard.missing}</label>
            {count("missing", form.missing)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <div className={sectionCls}>
            {t.wz_units_near}
            {form.units.length > 0 && <span className="ml-1 text-or-500">({form.units.length})</span>}
          </div>
          <div className="flex max-h-[34vh] flex-col gap-2 overflow-y-auto pr-1">
            {nearUnits.map((u, i) => (
              <ResponderRow key={u.id} item={u} selected={form.units.includes(u.id)} suggested={form.pt !== null && i === 0} onToggle={actions.toggleUnit} />
            ))}
          </div>
        </div>
        <div>
          <div className={sectionCls}>
            {t.wz_hospitals_near}
            {form.hospitals.length > 0 && <span className="ml-1 text-or-500">({form.hospitals.length})</span>}
          </div>
          <div className="flex max-h-[34vh] flex-col gap-2 overflow-y-auto pr-1">
            {nearHosps.map((h, i) => (
              <ResponderRow key={h.id} item={h} selected={form.hospitals.includes(h.id)} suggested={form.pt !== null && i === 0} onToggle={actions.toggleHosp} />
            ))}
          </div>
        </div>
        {/* Un décès au moins : les sites mortuaires se proposent comme les unités et les hôpitaux. */}
        {needsMorgue(form) && (
          <div className="sm:col-span-2">
            <div className={sectionCls}>
              {t.wz_morgues_near}
              {form.morgues.length > 0 && <span className="ml-1 text-or-500">({form.morgues.length})</span>}
            </div>
            <p className="mb-2 text-[11px] text-gray-400 dark:text-rdia-400">{t.wz_morgues_hint}</p>
            <div className="grid max-h-[34vh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {nearMorgues.map((s, i) => (
                <ResponderRow key={s.id} item={s} selected={form.morgues.includes(s.id)} suggested={form.pt !== null && i === 0} onToggle={actions.toggleMorgue} />
              ))}
              {nearMorgues.length === 0 && <p className="text-[11px] text-gray-400 dark:text-rdia-400">{t.wz_morgues_none}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
