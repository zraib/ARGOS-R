"use client";

import { useDict, type ArgosState } from "@/lib/store";
import type { NrbcRelease, NrbcSpill, WizardForm } from "@/lib/incidents/wizard";
import type { Lang, NrbcFamily } from "@/lib/types";
import { choiceCls, fieldCls, labelCls, sectionCls } from "./styles";

type Substance = ArgosState["nrbcSubstances"][number];

/**
 * Volet NRBC — visible uniquement pour le type dédié. La famille pilote le
 * reste : substance, ampleur et rejet n'existent qu'en chimique.
 */
export function NrbcSection({
  form,
  lang,
  substances,
  onChange,
}: {
  form: Pick<WizardForm, "nrbcFamily" | "nrbcSubstance" | "nrbcSpill" | "nrbcRelease">;
  lang: Lang;
  substances: Substance[];
  onChange: (p: Partial<WizardForm>) => void;
}) {
  const t = useDict();
  const familles: [NrbcFamily, string][] = [
    ["N", t.nrbc_fam_n],
    ["R", t.nrbc_fam_r],
    ["B", t.nrbc_fam_b],
    ["C", t.nrbc_fam_c],
  ];
  const ampleurs: [NrbcSpill, string][] = [
    ["small", t.nrbc_spill_small],
    ["large", t.nrbc_spill_large],
  ];
  const rejets: [NrbcRelease, string][] = [
    ["instant", t.nrbc_release_instant],
    ["continuous", t.nrbc_release_continuous],
  ];
  const sel = substances.find((s) => s.id === form.nrbcSubstance);
  return (
    <div className="rounded-xl border-2 border-or-500/30 bg-or-500/5 p-3">
      <div className={sectionCls}>{t.nrbc_section}</div>
      <label className={labelCls}>{t.nrbc_family}</label>
      <div className="grid grid-cols-4 gap-2">
        {familles.map(([fam, label]) => (
          <button key={fam} type="button" onClick={() => onChange({ nrbcFamily: fam })} className={`flex flex-col items-center ${choiceCls(form.nrbcFamily === fam)}`}>
            <span className="text-base font-bold">{fam}</span>
            <span className="text-center text-[10px] leading-tight">{label}</span>
          </button>
        ))}
      </div>

      {form.nrbcFamily === "C" && (
        <div className="mt-3 flex flex-col gap-3">
          <div>
            <label className={labelCls}>{t.nrbc_substance}</label>
            <select className={fieldCls} value={form.nrbcSubstance} onChange={(e) => onChange({ nrbcSubstance: e.target.value })}>
              <option value="">{t.nrbc_substance_none}</option>
              {substances.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.labels[lang]} — UN {s.un}
                </option>
              ))}
            </select>
            {sel && !sel.ergVerified && <p className="mt-1 text-[10px] font-semibold text-or-500">{t.nrbc_unverified}</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>{t.nrbc_spill}</label>
              <div className="grid grid-cols-2 gap-2">
                {ampleurs.map(([v, label]) => (
                  <button key={v} type="button" onClick={() => onChange({ nrbcSpill: v })} className={choiceCls(form.nrbcSpill === v)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>{t.nrbc_release}</label>
              <div className="grid grid-cols-2 gap-2">
                {rejets.map(([v, label]) => (
                  <button key={v} type="button" onClick={() => onChange({ nrbcRelease: v })} className={choiceCls(form.nrbcRelease === v)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
