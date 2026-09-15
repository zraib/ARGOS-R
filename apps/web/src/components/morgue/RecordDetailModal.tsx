"use client";

import { useModules } from "@/lib/store";
import type { ModulesDict } from "@/lib/i18n/modules";
import { Modal } from "@/components/ui/Modal";
import { Pill } from "@/components/ui/Pill";
import { STATUS_TONES } from "@/components/responsibility/MorgueViews";
import { personName, whenShort } from "@/lib/victims";
import type { CustodyEvent, MorgueSite, MortuaryRecord, RecordChange } from "@/lib/types";

/** « 15/09 08:12 » — l'instant d'une étape. */
export function quand(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Libellé d'un champ du dossier, pour l'historique. */
export function fieldLabel(m: ModulesDict, k: string): string {
  const labels: Record<string, string> = {
    lastName: m.victims.f_last, firstName: m.victims.f_first, cni: m.victims.f_cni, sex: m.resp.g_sex, age: m.victims.f_age,
    deathAt: m.morgue.id_death_at, idMethod: m.morgue.id_method, identifiedAt: m.morgue.id_at, identifiedBy: m.morgue.id_by, note: m.morgue.t_note,
    status: m.morgue.h_field_status, identifiedAs: m.morgue.h_field_identity, releasedTo: m.morgue.h_field_released, samples: m.morgue.h_field_samples,
    foundAt: m.morgue.h_field_found, ageRange: m.morgue.h_field_age_range,
  };
  return labels[k] ?? k;
}

/** Une valeur de l'historique, lisible : statuts, sexes, modes et dates traduits ; le reste tel quel. */
export function valueLabel(m: ModulesDict, k: string, v: unknown): string {
  if (v === undefined || v === null || v === "") return m.morgue.h_empty;
  if (k === "status" && typeof v === "string" && v in m.resp.dvi_status) return m.resp.dvi_status[v as keyof typeof m.resp.dvi_status];
  if (k === "sex" && typeof v === "string" && v in m.resp.dvi_sex) return m.resp.dvi_sex[v as keyof typeof m.resp.dvi_sex];
  if (k === "idMethod" && typeof v === "string" && v in m.morgue.id_methods) return m.morgue.id_methods[v as keyof typeof m.morgue.id_methods];
  if ((k === "deathAt" || k === "identifiedAt") && typeof v === "string") return whenShort(v) ?? v;
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" && x in m.resp.dvi_sample ? m.resp.dvi_sample[x as keyof typeof m.resp.dvi_sample] : String(x))).join(" · ") || m.morgue.h_empty;
  return String(v);
}

/**
 * La fiche d'un corps : son identité connue, son origine, sa chaîne de garde
 * dans l'ordre — chaque étape datée, signée, d'où à où — et l'historique des
 * modifications, signé lui aussi. C'est la traçabilité que la doctrine
 * demande, lisible d'un coup d'œil.
 */
export function RecordDetailModal({ record, sites, onClose }: { record: MortuaryRecord; sites: readonly MorgueSite[]; onClose: () => void }) {
  const m = useModules();
  const site = sites.find((s) => s.id === record.mid);
  const etapes: CustodyEvent[] = record.custody ?? [];
  const changes: RecordChange[] = record.history ?? [];
  const ligne = (label: string, value: string | undefined) => (
    <div className="min-w-0">
      <dt className="text-[11px] text-gray-400 dark:text-rdia-400">{label}</dt>
      <dd className="truncate text-[13px] text-gray-800 dark:text-rdia-50">{value || "—"}</dd>
    </div>
  );
  return (
    <Modal open onClose={onClose} title={`${m.morgue.detail} — ${record.reference}`}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={STATUS_TONES[record.status]} label={m.resp.dvi_status[record.status]} />
          {record.pendingReceipt && <Pill tone="amber" label={m.morgue.pending_badge} />}
          <span className="text-xs text-gray-500 dark:text-rdia-300">{site?.nom ?? record.mid}</span>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          {ligne(m.morgue.col_identity, record.identifiedAs ?? personName(record) ?? m.morgue.unknown)}
          {ligne(m.victims.f_cni, record.cni)}
          {ligne(m.resp.g_sex, record.sex ? m.resp.dvi_sex[record.sex] : undefined)}
          {ligne(m.victims.f_age, record.age !== undefined ? `${record.age} ${m.victims.years}` : record.ageRange)}
          {ligne(m.morgue.id_death_at, whenShort(record.deathAt) ?? undefined)}
          {ligne(m.morgue.id_method, record.idMethod ? m.morgue.id_methods[record.idMethod] : undefined)}
          {ligne(m.morgue.id_at, whenShort(record.identifiedAt) ?? undefined)}
          {ligne(m.morgue.id_by, record.identifiedBy)}
          {ligne(m.morgue.col_origin, record.origin ? (record.origin.kind === "hospital" ? `${m.morgue.origin_hospital} · ${record.origin.label}` : `${m.morgue.origin_field}${record.origin.label ? ` · ${record.origin.label}` : ""}`) : record.foundAt)}
          {ligne(m.resp.g_incident, record.incidentId)}
          {ligne(m.resp.g_samples, record.samples.length ? record.samples.map((s) => m.resp.dvi_sample[s]).join(" · ") : undefined)}
          {ligne(m.morgue.t_note, record.note)}
        </dl>
        <div>
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{m.morgue.detail}</h4>
          {etapes.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-rdia-300">
              {m.morgue.custody_none} {quand(record.admittedAt)}.
            </p>
          ) : (
            <ol className="relative ms-2 flex flex-col gap-3 border-s border-gray-200 ps-4 dark:border-rdia-600">
              {etapes.map((e, i) => (
                <li key={`${e.at}-${i}`} className="relative">
                  <span aria-hidden="true" className="absolute -start-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-or-500 dark:border-rdia-700" />
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[13px] font-semibold text-gray-800 dark:text-rdia-50">{m.morgue.custody[e.step]}</span>
                    <span className="font-mono text-[11px] text-gray-400 dark:text-rdia-400">{quand(e.at)}</span>
                  </div>
                  <div className="text-xs text-gray-600 dark:text-rdia-200">
                    {e.from ? `${e.from} → ` : ""}
                    {e.to ?? ""}
                    <span className="text-gray-400 dark:text-rdia-400"> · {m.morgue.by} {e.by}</span>
                  </div>
                  {e.note && <div className="text-xs italic text-gray-500 dark:text-rdia-300">{e.note}</div>}
                </li>
              ))}
            </ol>
          )}
        </div>
        {/* L'historique des modifications : qui, quand, quoi — avant → après. */}
        <div>
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{m.morgue.history}</h4>
          {changes.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-rdia-300">{m.morgue.history_none}</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {[...changes].reverse().map((c, i) => (
                <li key={`${c.at}-${i}`} className="rounded-lg border border-gray-100 p-2.5 text-xs dark:border-rdia-700/60">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-mono text-[11px] text-gray-400 dark:text-rdia-400">{quand(c.at)}</span>
                    <span className="text-gray-500 dark:text-rdia-300">{m.morgue.by} <span className="font-semibold text-gray-700 dark:text-rdia-100">{c.by}</span></span>
                  </div>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {c.fields.map((k) => (
                      <li key={k} className="text-gray-700 dark:text-rdia-100">
                        <span className="font-semibold">{fieldLabel(m, k)}</span>
                        <span className="text-gray-400 dark:text-rdia-400"> : {valueLabel(m, k, c.before[k])} → </span>
                        <span>{valueLabel(m, k, c.after[k])}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="flex justify-end">
          <button className="cible-tactile btn-secondaire text-sm" onClick={onClose}>
            {m.resp.cancel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
