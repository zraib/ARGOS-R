"use client";

import { useState } from "react";
import { useArgos, useModules } from "@/lib/store";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Pill } from "@/components/ui/Pill";
import { ID_METHOD_ORDER, fromLocalInput, missingFields, personName, toLocalInput, whenShort } from "@/lib/victims";
import { IdentityFields, identityBody, identityDraftOf, inputCls, labelCls, type IdentityDraft } from "@/components/morgue/IdentityFields";
import type { IdMethod, MortuaryRecord } from "@/lib/types";

/**
 * L'identification à la morgue : elle reçoit la préliminaire du terrain (ou
 * ce que l'hôpital a dit) et la COMPLÈTE avec des informations exactes —
 * heure du décès corrigée, nom, prénom, CNI, sexe, âge, mode
 * d'identification, date, qui a identifié, note. Enregistrer confirme
 * l'identité : le dossier passe « identifié » (règle DVI de l'API).
 */
export function IdentifyModal({ record, onClose, onDone }: { record: MortuaryRecord; onClose: () => void; onDone: () => void }) {
  const m = useModules();
  const showToast = useArgos((s) => s.showToast);
  const sessionUser = useArgos((s) => s.sessionUser);
  const [identity, setIdentity] = useState<IdentityDraft>(() => {
    const d = identityDraftOf(record);
    return { ...d, sex: d.sex === "unknown" ? "unknown" : d.sex };
  });
  const [deathAt, setDeathAt] = useState(toLocalInput(record.deathAt));
  const [method, setMethod] = useState<IdMethod | "">(record.idMethod ?? "");
  const [identifiedAt, setIdentifiedAt] = useState(toLocalInput(record.identifiedAt ?? new Date().toISOString()));
  const [identifiedBy, setIdentifiedBy] = useState(record.identifiedBy ?? sessionUser?.matricule ?? "");
  const [note, setNote] = useState(record.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const manque = missingFields(record);
  const nom = personName(identity.lastName || identity.firstName ? { lastName: identity.lastName, firstName: identity.firstName } : {});
  const canConfirm = !!nom && identity.sex !== "unknown" && !!method && !!identifiedBy.trim();

  const submit = async () => {
    if (!canConfirm) {
      setError(m.morgue.id_err_required);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.updateMortuaryRecord(record.mid, record.id, {
        ...identityBody(identity),
        status: "identified",
        deathAt: fromLocalInput(deathAt),
        idMethod: method || undefined,
        identifiedAt: fromLocalInput(identifiedAt) ?? new Date().toISOString(),
        identifiedBy: identifiedBy.trim(),
        note: note.trim() || undefined,
      });
      const code = res.response?.status;
      if (res.error || (code !== undefined && code >= 400)) {
        setError(code === 409 ? `${m.morgue.err_conflict} ${(res.error as { message?: string } | undefined)?.message ?? ""}` : m.morgue.err_denied);
        return;
      }
      showToast(m.morgue.id_done);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  const manqueLabel: Record<(typeof manque)[number], string> = {
    name: m.victims.f_name, cni: m.victims.f_cni, sex: m.resp.g_sex, age: m.victims.f_age, deathAt: m.victims.death_at, method: m.morgue.id_method,
  };

  return (
    <Modal open onClose={onClose} title={`${m.morgue.identify} — ${record.reference}`}>
      <div className="flex flex-col gap-4">
        {/* Ce que le terrain a transmis, et ce qui reste à confirmer. */}
        <div className="rounded-lg bg-gray-50 p-3 text-[11.5px] dark:bg-rdia-800/50">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-gray-700 dark:text-rdia-100">{m.morgue.id_prelim}</span>
            <span className="text-gray-500 dark:text-rdia-300">
              {record.origin?.kind === "hospital" ? `${m.morgue.origin_hospital} · ${record.origin.label}` : record.origin?.label ? `${m.morgue.origin_field} · ${record.origin.label}` : m.morgue.origin_field}
              {record.incidentId ? ` · ${record.incidentId}` : ""}
            </span>
          </div>
          <div className="mt-1 text-gray-600 dark:text-rdia-200">
            {personName(record) ?? m.victims.unidentified} · {m.resp.dvi_sex[record.sex ?? "unknown"]} · {record.age === undefined ? m.victims.age_unknown : `${record.age} ${m.victims.years}`} · {m.victims.death_at} {whenShort(record.deathAt) ?? m.victims.time_unknown}
          </div>
          {manque.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <span className="text-gray-500 dark:text-rdia-300">{m.morgue.id_to_confirm}</span>
              {manque.map((k) => <Pill key={k} tone="amber" label={manqueLabel[k]} size="sm" />)}
            </div>
          )}
        </div>

        <IdentityFields value={identity} onChange={setIdentity} sexes={["unknown", "f", "m"]} />
        <p className="-mt-2 text-[11px] text-gray-400 dark:text-rdia-400">{m.morgue.id_sex_hint}</p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>{m.morgue.id_death_at}</label>
            <input type="datetime-local" className={inputCls} value={deathAt} onChange={(e) => setDeathAt(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>{m.morgue.id_method}</label>
            <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value as IdMethod | "")}>
              <option value="">—</option>
              {ID_METHOD_ORDER.map((k) => (
                <option key={k} value={k}>{m.morgue.id_methods[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{m.morgue.id_at}</label>
            <input type="datetime-local" className={inputCls} value={identifiedAt} onChange={(e) => setIdentifiedAt(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>{m.morgue.id_by}</label>
            <input className={inputCls} value={identifiedBy} onChange={(e) => setIdentifiedBy(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>{m.morgue.t_note}</label>
            <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        {error && <p className="text-xs font-semibold text-danger-500">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button className="cible-tactile btn-secondaire text-sm" onClick={onClose}>{m.resp.cancel}</button>
          <button className="cible-tactile btn-primaire text-sm disabled:opacity-60" disabled={busy} onClick={() => void submit()}>
            {busy ? m.resp.saving : m.morgue.id_confirm}
          </button>
        </div>
      </div>
    </Modal>
  );
}
