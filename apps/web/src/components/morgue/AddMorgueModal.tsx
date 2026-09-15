"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useArgos, useModules } from "@/lib/store";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { EMPTY_LOCATION, LocationCascade, locationLL, locationProvince, type LocationValue } from "@/components/org/LocationCascade";
import { MORGUE_TYPES, type MorgueLevel, type MorgueType } from "@/lib/types";

// La carte (MapLibre) a besoin de `window` : chargée côté client seulement, comme au wizard.
const LocationPreviewMap = dynamic(() => import("@/components/incidents/LocationPreviewMap").then((x) => x.LocationPreviewMap), { ssr: false });

/**
 * Un site mortuaire fixe de plus — même logique que l'ajout d'un hôpital :
 * la cascade région → province → ville, l'échelon (régional ou de ville),
 * l'établissement de rattachement, la capacité réfrigérée. La position est
 * celle de l'établissement, sinon celle de la ville.
 */
export function AddMorgueModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const m = useModules();
  const showToast = useArgos((s) => s.showToast);
  const hospitals = useArgos((s) => s.hospitals);
  const provinces = useArgos((s) => s.provinces);
  const cities = useArgos((s) => s.cities);
  const [nom, setNom] = useState("");
  const [level, setLevel] = useState<MorgueLevel>("city");
  const [type, setType] = useState<MorgueType>("hospital");
  /** Un point posé sur la carte prime sur l'établissement et la ville. */
  const [pin, setPin] = useState<[number, number] | null>(null);
  const [loc, setLoc] = useState<LocationValue>(EMPTY_LOCATION);
  const [hospitalId, setHospitalId] = useState("");
  const [capacity, setCapacity] = useState(30);
  const [staff, setStaff] = useState(6);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const labelCls = "mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200";

  // Les établissements de la région choisie d'abord ; tous si aucune région.
  const candidats = [...hospitals].sort((a, b) => Number((b.region ?? "") === loc.region) - Number((a.region ?? "") === loc.region) || a.nom.localeCompare(b.nom, "fr"));
  const p = locationProvince(loc, provinces);
  const canSubmit = !!(nom.trim() && loc.region && (loc.city || hospitalId || pin) && capacity > 0);
  const hospSel = hospitals.find((h) => h.id === hospitalId);
  const apercu = pin ?? hospSel?.ll ?? locationLL(loc, provinces, cities) ?? null;

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      const hosp = hospitals.find((h) => h.id === hospitalId);
      const res = await api.createMorgue({
        nom: nom.trim(),
        type,
        level,
        region: loc.region,
        province: p?.v,
        ville: loc.city || hosp?.ville || "",
        hospitalId: hospitalId || undefined,
        capacity,
        staff,
        ll: pin ?? hosp?.ll ?? locationLL(loc, provinces, cities),
      });
      const code = res.response?.status;
      if (res.error || (code !== undefined && code >= 400)) {
        setError(m.morgue.err_denied);
        return;
      }
      showToast(m.morgue.added);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={m.morgue.add_title}>
      <div className="flex flex-col gap-4">
        <div>
          <label className={labelCls}>{m.morgue.a_name}</label>
          <input className="input-champ text-base md:text-sm" placeholder={m.morgue.a_name_ph} value={nom} onChange={(e) => { setNom(e.target.value); setError(null); }} />
        </div>
        <div>
          <label className={labelCls}>{m.morgue.a_level}</label>
          <div className="flex flex-wrap gap-2">
            {(["regional", "city"] as MorgueLevel[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLevel(l)}
                aria-pressed={level === l}
                className={`cible-tactile rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  level === l ? "border-or-500 bg-or-500/15 text-or-600 dark:text-or-400" : "border-gray-200 text-gray-600 hover:border-or-400 dark:border-rdia-600 dark:text-rdia-200"
                }`}
              >
                {l === "regional" ? m.morgue.level_regional : m.morgue.level_city}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-gray-400 dark:text-rdia-400">{m.morgue.a_level_hint}</p>
        </div>
        <div>
          <label className={labelCls}>{m.morgue.a_type}</label>
          <div className="flex flex-wrap gap-2">
            {MORGUE_TYPES.map((k) => (
              <button key={k} type="button" onClick={() => setType(k)} aria-pressed={type === k} className={`cible-tactile rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${type === k ? "border-or-500 bg-or-500/15 text-or-600 dark:text-or-400" : "border-gray-200 text-gray-600 hover:border-or-400 dark:border-rdia-600 dark:text-rdia-200"}`}>
                {m.morgue.types[k]}
              </button>
            ))}
          </div>
        </div>
        {/* La localisation, comme à la déclaration d'un incident : la cascade, puis un point sur la carte. */}
        <LocationCascade value={loc} onChange={(next) => { setLoc(next); setPin(null); }} />
        <div className="h-56 overflow-hidden rounded-lg border border-gray-200 dark:border-rdia-600">
          <LocationPreviewMap value={apercu} onPick={setPin} labels={{ hint: m.morgue.a_map_hint, full: m.morgue.a_map_full, exit: m.morgue.a_map_exit }} />
        </div>
        {pin && <p className="-mt-2 font-mono text-[11px] text-gray-500 dark:text-rdia-300">{pin[1].toFixed(4)}, {pin[0].toFixed(4)}</p>}
        <div>
          <label className={labelCls}>{m.morgue.a_hospital}</label>
          <select className="input-champ text-base md:text-sm" value={hospitalId} onChange={(e) => setHospitalId(e.target.value)}>
            <option value="">{m.morgue.a_hospital_none}</option>
            {candidats.map((h) => (
              <option key={h.id} value={h.id}>{h.nom} · {h.ville}</option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-gray-400 dark:text-rdia-400">{m.morgue.a_hospital_hint}</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{m.morgue.d_capacity}</label>
            <input className="input-champ font-mono text-base md:text-sm" type="number" min={1} value={capacity} onChange={(e) => setCapacity(Math.max(1, parseInt(e.target.value, 10) || 1))} />
          </div>
          <div>
            <label className={labelCls}>{m.morgue.d_staff}</label>
            <input className="input-champ font-mono text-base md:text-sm" type="number" min={0} value={staff} onChange={(e) => setStaff(Math.max(0, parseInt(e.target.value, 10) || 0))} />
          </div>
        </div>
        {error && <p className="text-xs font-semibold text-danger-500">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button className="cible-tactile btn-secondaire text-sm" onClick={onClose}>{m.resp.cancel}</button>
          <button className="cible-tactile btn-primaire text-sm disabled:opacity-60" disabled={busy || !canSubmit} onClick={() => void submit()}>
            {busy ? m.resp.saving : m.morgue.add_btn}
          </button>
        </div>
      </div>
    </Modal>
  );
}
