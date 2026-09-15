"use client";

import { useModules } from "@/lib/store";
import { SEXES, type IdentityDraft } from "@/lib/victims";
import type { Sex } from "@/lib/types";

export const labelCls = "mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200";
export const inputCls = "input-champ text-base md:text-sm";

// Les aides pures du brouillon d'identité vivent dans lib/victims.ts (testables, partagées avec lib/morgue.ts).
export { EMPTY_IDENTITY, identityBody, identityDraftOf } from "@/lib/victims";
export type { IdentityDraft } from "@/lib/victims";

export function IdentityFields({
  value, onChange, sexes = SEXES, disabled = false,
}: {
  value: IdentityDraft;
  onChange: (next: IdentityDraft) => void;
  /** À la morgue, l'inconnu n'est plus une réponse : on ne propose que féminin et masculin. */
  sexes?: readonly Sex[];
  disabled?: boolean;
}) {
  const m = useModules();
  const set = (patch: Partial<IdentityDraft>) => onChange({ ...value, ...patch });
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label className={labelCls}>{m.victims.f_last}</label>
        <input className={inputCls} value={value.lastName} disabled={disabled} onChange={(e) => set({ lastName: e.target.value })} />
      </div>
      <div>
        <label className={labelCls}>{m.victims.f_first}</label>
        <input className={inputCls} value={value.firstName} disabled={disabled} onChange={(e) => set({ firstName: e.target.value })} />
      </div>
      <div>
        <label className={labelCls}>{m.victims.f_cni}</label>
        <input className={`${inputCls} font-mono`} placeholder={m.victims.f_cni_ph} value={value.cni} disabled={disabled} onChange={(e) => set({ cni: e.target.value.toUpperCase() })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>{m.resp.g_sex}</label>
          <select className={inputCls} value={value.sex} disabled={disabled} onChange={(e) => set({ sex: e.target.value as Sex })}>
            {sexes.map((s) => (
              <option key={s} value={s}>{m.resp.dvi_sex[s]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>{m.victims.f_age}</label>
          <input className={`${inputCls} font-mono`} type="number" min={0} max={130} placeholder={m.victims.f_age_ph} value={value.age} disabled={disabled} onChange={(e) => set({ age: e.target.value })} />
        </div>
      </div>
    </div>
  );
}
