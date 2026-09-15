"use client";

import { useState } from "react";
import { useArgos, useModules } from "@/lib/store";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Pill } from "@/components/ui/Pill";
import { ID_METHOD_ORDER, missingFields, personName, toLocalInput, whenShort } from "@/lib/victims";
import { recordPatch, type RecordDraft } from "@/lib/morgue";
import { IdentityFields, identityDraftOf, inputCls, labelCls, type IdentityDraft } from "@/components/morgue/IdentityFields";
import { SignatureField } from "@/components/morgue/SignatureField";
import type { IdMethod, MortuaryRecord } from "@/lib/types";

/**
 * Identifier — ou modifier — un dossier à la morgue.
 *
 * Rien n'est imposé : la préliminaire du terrain (ou ce que l'hôpital a dit)
 * se complète au fur et à mesure — un nom aujourd'hui, le mode
 * d'identification demain, l'heure du décès corrigée quand on la sait. Chaque
 * enregistrement ne porte que ce qui a changé, est signé par le mot de passe
 * du compte (exigé par l'API) et se retrouve dans l'historique du dossier.
 * Passer « identifié » reste un choix explicite, qui demande au moins un nom.
 */
export function IdentifyModal({ record, onClose, onDone }: { record: MortuaryRecord; onClose: () => void; onDone: () => void }) {
  const m = useModules();
  const showToast = useArgos((s) => s.showToast);
  const sessionUser = useArgos((s) => s.sessionUser);
  const edit = record.status === "identified";
  const [identity, setIdentity] = useState<IdentityDraft>(() => identityDraftOf(record));
  const [deathAt, setDeathAt] = useState(toLocalInput(record.deathAt));
  const [method, setMethod] = useState<IdMethod | "">(record.idMethod ?? "");
  const [identifiedAt, setIdentifiedAt] = useState(toLocalInput(record.identifiedAt));
  const [identifiedBy, setIdentifiedBy] = useState(record.identifiedBy ?? "");
  const [note, setNote] = useState(record.note ?? "");
  const [statusChoice, setStatusChoice] = useState<"keep" | "in_progress" | "identified">("keep");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const manque = missingFields(record);
  const nom = personName({ lastName: identity.lastName, firstName: identity.firstName });
  const draft: RecordDraft = { identity, deathAt, method, identifiedAt, identifiedBy, note, status: statusChoice === "keep" ? undefined : statusChoice };
  const patch = recordPatch(record, draft);
  const rien = Object.keys(patch).length === 0;

  const submit = async () => {
    setError(null);
    setPwError(null);
    if (rien) {
      setError(m.morgue.id_no_change);
      return;
    }
    if (patch.status === "identified" && !nom) {
      setError(m.morgue.id_mark_identified_hint);
      return;
    }
    if (!password) {
      setPwError(m.morgue.pw_required);
      return;
    }
    setBusy(true);
    try {
      // Le premier passage en « identifié » sans identifiant renseigné : c'est le compte connecté qui signe.
      const body = patch.status === "identified" && !identifiedBy.trim() && !record.identifiedBy ? { ...patch, identifiedBy: sessionUser?.matricule ?? "" } : patch;
      const res = await api.updateMortuaryRecord(record.mid, record.id, { ...body, password });
      const code = res.response?.status;
      if (res.error || (code !== undefined && code >= 400)) {
        if (code === 403) setPwError(m.morgue.pw_wrong);
        else setError(code === 409 ? `${m.morgue.err_conflict} ${(res.error as { message?: string } | undefined)?.message ?? ""}` : m.morgue.err_denied);
        return;
      }
      showToast(patch.status === "identified" ? m.morgue.id_done : m.morgue.id_saved);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  const manqueLabel: Record<(typeof manque)[number], string> = {
    name: m.victims.f_name, cni: m.victims.f_cni, sex: m.resp.g_sex, age: m.victims.f_age, deathAt: m.victims.death_at, method: m.morgue.id_method,
  };
  const choix: { k: "keep" | "in_progress" | "identified"; label: string; off?: boolean }[] = [
    { k: "keep", label: `${m.morgue.id_keep} · ${m.resp.dvi_status[record.status]}` },
    ...(record.status === "identified" ? [] : [{ k: "in_progress" as const, label: m.morgue.id_mark_progress }]),
    { k: "identified", label: m.morgue.id_mark_identified, off: !nom },
  ];

  return (
    <Modal open onClose={onClose} title={`${edit ? m.morgue.edit_title : m.morgue.identify} — ${record.reference}`}>
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
        <p className="-mt-2 text-[11px] text-gray-500 dark:text-rdia-300">{m.morgue.id_partial_hint}</p>

        <IdentityFields value={identity} onChange={setIdentity} sexes={["unknown", "f", "m"]} disabled={busy} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>{m.morgue.id_death_at}</label>
            <input type="datetime-local" className={inputCls} value={deathAt} disabled={busy} onChange={(e) => setDeathAt(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>{m.morgue.id_method}</label>
            <select className={inputCls} value={method} disabled={busy} onChange={(e) => setMethod(e.target.value as IdMethod | "")}>
              <option value="">—</option>
              {ID_METHOD_ORDER.map((k) => (
                <option key={k} value={k}>{m.morgue.id_methods[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{m.morgue.id_at}</label>
            <input type="datetime-local" className={inputCls} value={identifiedAt} disabled={busy} onChange={(e) => setIdentifiedAt(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>{m.morgue.id_by}</label>
            <input className={inputCls} value={identifiedBy} disabled={busy} placeholder={sessionUser?.matricule ?? ""} onChange={(e) => setIdentifiedBy(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>{m.morgue.t_note}</label>
            <input className={inputCls} value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        {/* Le statut est un choix explicite, jamais une conséquence silencieuse de la saisie. */}
        {record.status !== "released" && (
          <div>
            <label className={labelCls}>{m.morgue.id_status}</label>
            <div className="flex flex-wrap gap-2">
              {choix.map((c) => (
                <button
                  key={c.k}
                  type="button"
                  disabled={busy || c.off}
                  aria-pressed={statusChoice === c.k}
                  title={c.off ? m.morgue.id_mark_identified_hint : undefined}
                  onClick={() => setStatusChoice(c.k)}
                  className={`cible-tactile rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    statusChoice === c.k ? "border-or-500 bg-or-500/15 text-or-600 dark:text-or-400" : "border-gray-200 text-gray-600 hover:border-or-400 dark:border-rdia-600 dark:text-rdia-200"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {!nom && <p className="mt-1 text-[11px] text-gray-400 dark:text-rdia-400">{m.morgue.id_mark_identified_hint}</p>}
          </div>
        )}

        <SignatureField value={password} onChange={(v) => { setPassword(v); setPwError(null); }} error={pwError} disabled={busy} />

        {error && <p className="text-xs font-semibold text-danger-500">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button className="cible-tactile btn-secondaire text-sm" onClick={onClose}>{m.resp.cancel}</button>
          <button className="cible-tactile btn-primaire text-sm disabled:opacity-60" disabled={busy} onClick={() => void submit()}>
            {busy ? m.resp.saving : patch.status === "identified" ? m.morgue.id_confirm : m.resp.save}
          </button>
        </div>
      </div>
    </Modal>
  );
}
