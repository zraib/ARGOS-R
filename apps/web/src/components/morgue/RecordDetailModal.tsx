"use client";

import { useModules } from "@/lib/store";
import { Modal } from "@/components/ui/Modal";
import { Pill } from "@/components/ui/Pill";
import { STATUS_TONES } from "@/components/responsibility/MorgueViews";
import type { CustodyEvent, MorgueSite, MortuaryRecord } from "@/lib/types";

/** « 15/09 08:12 » — l'instant d'une étape. */
export function quand(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * La fiche d'un corps : son identité connue, son origine, et sa chaîne de
 * garde dans l'ordre — chaque étape datée, signée, d'où à où. C'est la
 * traçabilité que la doctrine demande, lisible d'un coup d'œil.
 */
export function RecordDetailModal({ record, sites, onClose }: { record: MortuaryRecord; sites: readonly MorgueSite[]; onClose: () => void }) {
  const m = useModules();
  const site = sites.find((s) => s.id === record.mid);
  const etapes: CustodyEvent[] = record.custody ?? [];
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
          {ligne(m.morgue.col_identity, record.identifiedAs ?? m.morgue.unknown)}
          {ligne(m.morgue.col_origin, record.origin ? (record.origin.kind === "hospital" ? `${m.morgue.origin_hospital} · ${record.origin.label}` : `${m.morgue.origin_field}${record.origin.label ? ` · ${record.origin.label}` : ""}`) : record.foundAt)}
          {ligne(m.resp.g_incident, record.incidentId)}
          {ligne(m.resp.g_sex, record.sex ? m.resp.dvi_sex[record.sex] : undefined)}
          {ligne(m.resp.g_age, record.ageRange)}
          {ligne(m.resp.g_samples, record.samples.length ? record.samples.map((s) => m.resp.dvi_sample[s]).join(" · ") : undefined)}
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
        <div className="flex justify-end">
          <button className="cible-tactile btn-secondaire text-sm" onClick={onClose}>
            {m.resp.cancel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
