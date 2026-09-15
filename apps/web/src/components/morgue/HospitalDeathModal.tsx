"use client";

import { useState } from "react";
import { useArgos, useModules } from "@/lib/store";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { nearestSites } from "@/lib/morgue";
import type { Hospital, MorgueSite, MortuaryRecord } from "@/lib/types";

/**
 * Décès en établissement : l'hôpital annonce le transfert du corps vers un
 * site mortuaire — le plus proche d'abord, avec ses places libres. Le dossier
 * naît là-bas, réception à confirmer ; chaque étape est datée et signée.
 */
export function HospitalDeathModal({
  hospital, sites, records, onClose, onDone,
}: {
  hospital: Hospital;
  sites: readonly MorgueSite[];
  records: readonly MortuaryRecord[];
  onClose: () => void;
  onDone: () => void;
}) {
  const m = useModules();
  const showToast = useArgos((s) => s.showToast);
  const incidents = useArgos((s) => s.incidents);
  // La chambre mortuaire de l'établissement d'abord, puis la régionale, puis le plus proche.
  const choix = nearestSites(hospital.ll, sites, records, { hospitalId: hospital.id, region: hospital.region });
  const [mid, setMid] = useState(choix.find((c) => c.free > 0)?.site.id ?? choix[0]?.site.id ?? "");
  const [identifiedAs, setIdentifiedAs] = useState("");
  const [sex, setSex] = useState<"m" | "f" | "unknown">("unknown");
  const [ageRange, setAgeRange] = useState("");
  const [incidentId, setIncidentId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const labelCls = "mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200";

  const submit = async () => {
    if (!mid) return;
    setBusy(true);
    try {
      const res = await api.declareHospitalDeath(hospital.id, {
        mid,
        identifiedAs: identifiedAs.trim() || undefined,
        sex,
        ageRange: ageRange.trim() || undefined,
        incidentId: incidentId || undefined,
        note: note.trim() || undefined,
      });
      const code = res.response?.status;
      if (res.error || (code !== undefined && code >= 400)) {
        setError(code === 409 ? `${m.morgue.err_conflict} ${(res.error as { message?: string } | undefined)?.message ?? ""}` : m.morgue.err_denied);
        return;
      }
      const site = sites.find((s) => s.id === mid);
      showToast(`${m.morgue.h_declared} ${site?.nom ?? mid}.`);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={m.morgue.h_death_title}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-gray-500 dark:text-rdia-300">{m.morgue.h_hint}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls}>{m.morgue.h_to}</label>
            <select className="input-champ text-base md:text-sm" value={mid} onChange={(e) => setMid(e.target.value)}>
              {choix.map(({ site, km, free, attached }) => (
                <option key={site.id} value={site.id} disabled={free <= 0}>
                  {attached ? `★ ${m.morgue.attached_short} · ` : ""}{site.nom} · {km !== null ? `${Math.round(km)} km · ` : ""}{free} {m.morgue.t_free}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>{m.morgue.h_identity}</label>
            <input className="input-champ text-base md:text-sm" placeholder={m.morgue.h_identity_ph} value={identifiedAs} onChange={(e) => setIdentifiedAs(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>{m.resp.g_sex}</label>
            <select className="input-champ text-base md:text-sm" value={sex} onChange={(e) => setSex(e.target.value as "m" | "f" | "unknown")}>
              {(["unknown", "m", "f"] as const).map((s) => <option key={s} value={s}>{m.resp.dvi_sex[s]}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>{m.resp.g_age}</label>
            <input className="input-champ text-base md:text-sm" placeholder="40-55" value={ageRange} onChange={(e) => setAgeRange(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>{m.morgue.h_incident}</label>
            <select className="input-champ text-base md:text-sm" value={incidentId} onChange={(e) => setIncidentId(e.target.value)}>
              <option value="">{m.resp.g_incident_none}</option>
              {incidents.filter((i) => !i.archived).map((i) => <option key={i.id} value={i.id}>{i.id} — {i.titre}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>{m.morgue.h_note}</label>
            <input className="input-champ text-base md:text-sm" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        {error && <p className="text-xs font-semibold text-danger-500">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button className="cible-tactile btn-secondaire text-sm" onClick={onClose}>{m.resp.cancel}</button>
          <button className="cible-tactile btn-primaire text-sm disabled:opacity-60" disabled={busy || !mid} onClick={() => void submit()}>
            {busy ? m.resp.saving : m.morgue.h_death}
          </button>
        </div>
      </div>
    </Modal>
  );
}
