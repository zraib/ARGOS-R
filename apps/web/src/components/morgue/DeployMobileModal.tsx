"use client";

import { useState } from "react";
import { useArgos, useModules } from "@/lib/store";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";

/**
 * Déployer une morgue mobile : un conteneur réfrigéré posé sur le terrain, à
 * l'emplacement d'un incident (le cas ordinaire) ou près d'une ville.
 */
export function DeployMobileModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const m = useModules();
  const showToast = useArgos((s) => s.showToast);
  const incidents = useArgos((s) => s.incidents);
  const cities = useArgos((s) => s.cities);
  const actifs = incidents.filter((i) => !i.archived);
  const [nom, setNom] = useState("");
  const [capacity, setCapacity] = useState(24);
  const [staff, setStaff] = useState(4);
  const [incidentId, setIncidentId] = useState(actifs[0]?.id ?? "");
  const [cityName, setCityName] = useState(cities[0]?.v ?? "");
  const [site, setSite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const labelCls = "mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200";

  const incident = actifs.find((i) => i.id === incidentId);
  const city = cities.find((c) => c.v === cityName);
  const ll: [number, number] | undefined = incident?.ll ?? city?.ll;

  const submit = async () => {
    if (!nom.trim() || !site.trim() || !ll) {
      setError(m.morgue.d_err);
      return;
    }
    setBusy(true);
    try {
      const res = await api.deployMobileMorgue({ nom: nom.trim(), capacity, staff, site: site.trim(), ll, incidentId: incidentId || undefined });
      const code = res.response?.status;
      if (res.error || (code !== undefined && code >= 400)) {
        setError(m.morgue.err_denied);
        return;
      }
      showToast(m.morgue.deployed);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={m.morgue.deploy}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-gray-500 dark:text-rdia-300">{m.morgue.deploy_hint}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls}>{m.morgue.d_name}</label>
            <input className="input-champ text-base md:text-sm" placeholder={m.morgue.d_name_ph} value={nom} onChange={(e) => { setNom(e.target.value); setError(null); }} />
          </div>
          <div>
            <label className={labelCls}>{m.morgue.d_capacity}</label>
            <input className="input-champ font-mono text-base md:text-sm" type="number" min={1} value={capacity} onChange={(e) => setCapacity(Math.max(1, parseInt(e.target.value, 10) || 1))} />
          </div>
          <div>
            <label className={labelCls}>{m.morgue.d_staff}</label>
            <input className="input-champ font-mono text-base md:text-sm" type="number" min={0} value={staff} onChange={(e) => setStaff(Math.max(0, parseInt(e.target.value, 10) || 0))} />
          </div>
          <div>
            <label className={labelCls}>{m.morgue.d_incident}</label>
            <select className="input-champ text-base md:text-sm" value={incidentId} onChange={(e) => setIncidentId(e.target.value)}>
              <option value="">{m.morgue.d_incident_none}</option>
              {actifs.map((i) => (
                <option key={i.id} value={i.id}>{i.id} — {i.titre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{m.morgue.d_city}</label>
            <select className="input-champ text-base md:text-sm" value={cityName} onChange={(e) => setCityName(e.target.value)} disabled={!!incident}>
              {cities.map((c) => (
                <option key={c.v} value={c.v}>{c.v}</option>
              ))}
            </select>
            {incident && <p className="mt-1 text-[11px] text-gray-400 dark:text-rdia-400">{m.morgue.d_position_incident}</p>}
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>{m.morgue.d_site}</label>
            <input className="input-champ text-base md:text-sm" placeholder={m.morgue.d_site_ph} value={site} onChange={(e) => { setSite(e.target.value); setError(null); }} />
          </div>
        </div>
        {error && <p className="text-xs font-semibold text-danger-500">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button className="cible-tactile btn-secondaire text-sm" onClick={onClose}>{m.resp.cancel}</button>
          <button className="cible-tactile btn-primaire text-sm disabled:opacity-60" disabled={busy} onClick={() => void submit()}>
            {busy ? m.resp.saving : m.morgue.deploy_btn}
          </button>
        </div>
      </div>
    </Modal>
  );
}
