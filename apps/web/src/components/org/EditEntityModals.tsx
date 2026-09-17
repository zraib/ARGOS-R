"use client";

import { useState } from "react";
import { useArgos, useDict, useModules } from "@/lib/store";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { UNIT_CORPS, type Unit, type UnitCorps } from "@/lib/types";
import { corpsLabel, corpsShort } from "@/lib/corps";
import { SHELTER_ORGANS, type Shelter, type ShelterBuilding, type ShelterKind, type ShelterOrgan } from "@/lib/data/modules";

// ============================================================================
// ARGOS — modales de MODIFICATION d'une unité et d'un abri, depuis OPSnet
// (ADR 0019). Les mêmes champs que la création, moins la position : un lieu
// se déplace par la carte, pas par un formulaire. Toute écriture passe par
// `PATCH /units/:id` et `PATCH /shelters/:id`, que l'API garde par le rôle,
// le mode et la portée — la modale ne fait qu'éviter de proposer l'impossible.
// ============================================================================

const labelCls = "mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200";
const inputCls = "input-champ text-sm";

export function EditUnitModal({ unit, onClose }: { unit: Unit; onClose: () => void }) {
  const t = useDict();
  const loadDomain = useArgos((s) => s.loadDomain);
  const showToast = useArgos((s) => s.showToast);
  const [nom, setNom] = useState(unit.nom);
  const [ville, setVille] = useState(unit.ville);
  const [corps, setCorps] = useState<UnitCorps>(unit.corps ?? "far");
  const [cmdt, setCmdt] = useState(unit.cmdt === "—" ? "" : unit.cmdt);
  const [eff, setEff] = useState(unit.eff);
  const [dispo, setDispo] = useState<Unit["dispo"]>(unit.dispo);
  const [readiness, setReadiness] = useState(unit.readiness);
  const [busy, setBusy] = useState(false);
  const canSubmit = nom.trim().length >= 2 && ville.trim().length >= 2 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const res = await api.updateUnit(unit.id, {
        nom: nom.trim(),
        ville: ville.trim(),
        corps,
        ...(cmdt.trim() ? { cmdt: cmdt.trim() } : {}),
        eff,
        dispo,
        readiness,
      });
      // Le client généré ne type pas l'erreur de cette route : on la lit telle quelle.
      const err = (res as { error?: { message?: string | string[] } }).error;
      if (err) {
        const msg = err.message;
        showToast(`${t.toast_fail} — ${Array.isArray(msg) ? msg.join(" · ") : (msg ?? "")}`);
        return;
      }
      await loadDomain();
      showToast(t.ops_unit_updated);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={`${t.ops_edit_unit} — ${corpsShort(unit.corps)} · ${unit.nom}`} onClose={onClose} size="md">
      <div className="space-y-3">
        <div>
          <label className={labelCls}>{t.ops_unit}</label>
          <input className={inputCls + " w-full"} value={nom} onChange={(e) => setNom(e.target.value)} maxLength={80} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>{t.lbl_city}</label>
            <input className={inputCls + " w-full"} value={ville} onChange={(e) => setVille(e.target.value)} maxLength={60} />
          </div>
          <div>
            <label className={labelCls}>{t.f_corps}</label>
            <select className={inputCls + " w-full"} value={corps} onChange={(e) => setCorps(e.target.value as UnitCorps)}>
              {UNIT_CORPS.map((c) => <option key={c} value={c}>{corpsLabel(c, t)}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>{t.ops_commander}</label>
          <input className={inputCls + " w-full"} value={cmdt} onChange={(e) => setCmdt(e.target.value)} maxLength={80} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>{t.ops_strength}</label>
            <input type="number" min={0} className={inputCls + " w-full font-mono"} value={eff} onChange={(e) => setEff(Math.max(0, parseInt(e.target.value, 10) || 0))} />
          </div>
          <div>
            <label className={labelCls}>{t.ops_status}</label>
            <select className={inputCls + " w-full"} value={dispo} onChange={(e) => setDispo(e.target.value as Unit["dispo"])}>
              {(["ready", "deployed", "standby"] as const).map((d) => <option key={d} value={d}>{t[`ops_${d}` as const]}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t.ops_readiness} (%)</label>
            <input type="number" min={0} max={100} className={inputCls + " w-full font-mono"} value={readiness} onChange={(e) => setReadiness(Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)))} />
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondaire cible-tactile text-sm" onClick={onClose}>{t.cancel}</button>
          <button type="button" className="btn-primaire cible-tactile text-sm" disabled={!canSubmit} onClick={() => void submit()}>{busy ? "…" : t.save}</button>
        </div>
      </div>
    </Modal>
  );
}

export function EditShelterModal({ shelter, onClose }: { shelter: Shelter; onClose: () => void }) {
  const t = useDict();
  const m = useModules();
  const loadDomain = useArgos((s) => s.loadDomain);
  const showToast = useArgos((s) => s.showToast);
  const [nom, setNom] = useState(shelter.nom);
  const [ville, setVille] = useState(shelter.ville);
  const [organ, setOrgan] = useState<ShelterOrgan | "">(shelter.organ ?? "");
  const [kind, setKind] = useState<ShelterKind>(shelter.kind ?? "dur");
  const [building, setBuilding] = useState<ShelterBuilding>(shelter.building ?? "dedie");
  const [tents, setTents] = useState(shelter.tents ?? 20);
  const [perTent, setPerTent] = useState(shelter.perTent ?? 6);
  const [capacity, setCapacity] = useState(shelter.capacity);
  const [occupants, setOccupants] = useState(shelter.occupants);
  const [staff, setStaff] = useState(shelter.staff);
  const [supplies, setSupplies] = useState<Shelter["supplies"]>(shelter.supplies);
  const [needs, setNeeds] = useState(shelter.needs);
  const [adults, setAdults] = useState(shelter.adults);
  const [children, setChildren] = useState(shelter.children);
  const [elderly, setElderly] = useState(shelter.elderly);
  const [busy, setBusy] = useState(false);
  const num = (v: string, min = 0) => Math.max(min, parseInt(v, 10) || 0);
  const canSubmit = nom.trim().length >= 2 && ville.trim().length >= 2 && (kind === "tentes" ? tents > 0 && perTent > 0 : capacity > 0) && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const res = await api.updateShelter(shelter.id, {
        nom: nom.trim(),
        ville: ville.trim(),
        ...(organ ? { organ } : {}),
        kind,
        ...(kind === "tentes" ? { tents, perTent } : { building, capacity }),
        occupants,
        staff,
        supplies,
        needs: needs.trim(),
        adults,
        children,
        elderly,
      });
      const err = (res as { error?: { message?: string | string[] } }).error;
      if (err) {
        const msg = err.message;
        showToast(`${t.toast_fail} — ${Array.isArray(msg) ? msg.join(" · ") : (msg ?? "")}`);
        return;
      }
      await loadDomain();
      showToast(t.ops_shelter_updated);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={`${t.ops_edit_shelter} — ${shelter.id}`} onClose={onClose} size="md">
      <div className="space-y-3">
        <div>
          <label className={labelCls}>{t.ops_shelter_name}</label>
          <input className={inputCls + " w-full"} value={nom} onChange={(e) => setNom(e.target.value)} maxLength={80} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>{t.ops_shelter_city}</label>
            <input className={inputCls + " w-full"} value={ville} onChange={(e) => setVille(e.target.value)} maxLength={60} />
          </div>
          <div>
            <label className={labelCls}>{m.shelters.organ}</label>
            <select className={inputCls + " w-full"} value={organ} onChange={(e) => setOrgan(e.target.value as ShelterOrgan | "")}>
              <option value="">—</option>
              {SHELTER_ORGANS.map((o) => <option key={o} value={o}>{m.shelters[`o_${o}` as const]}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>{m.shelters.kind}</label>
          <div className="flex gap-2">
            {(["dur", "tentes"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                aria-pressed={kind === k}
                className={`cible-tactile flex-1 rounded-lg border px-3 text-xs font-semibold transition-colors lg:min-h-0 lg:py-2 ${
                  kind === k ? "border-or-500 bg-or-500/15 text-or-600 dark:text-or-400" : "border-gray-200 text-gray-600 hover:border-or-400 dark:border-rdia-600 dark:text-rdia-200"
                }`}
              >
                {k === "dur" ? m.shelters.kind_hard : m.shelters.kind_tent}
              </button>
            ))}
          </div>
        </div>
        {kind === "dur" ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{m.shelters.building}</label>
              <select className={inputCls + " w-full"} value={building} onChange={(e) => setBuilding(e.target.value as ShelterBuilding)}>
                {(["dedie", "ecole", "college", "lycee", "autre"] as const).map((b) => <option key={b} value={b}>{m.shelters[`b_${b}` as const]}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t.ops_capacity}</label>
              <input type="number" min={1} className={inputCls + " w-full font-mono"} value={capacity} onChange={(e) => setCapacity(num(e.target.value, 1))} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{m.shelters.tents}</label>
              <input type="number" min={1} className={inputCls + " w-full font-mono"} value={tents} onChange={(e) => setTents(num(e.target.value, 1))} />
            </div>
            <div>
              <label className={labelCls}>{m.shelters.per_tent}</label>
              <input type="number" min={1} className={inputCls + " w-full font-mono"} value={perTent} onChange={(e) => setPerTent(num(e.target.value, 1))} />
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>{t.ops_occupants_now}</label>
            <input type="number" min={0} className={inputCls + " w-full font-mono"} value={occupants} onChange={(e) => setOccupants(num(e.target.value))} />
          </div>
          <div>
            <label className={labelCls}>{t.ops_staff}</label>
            <input type="number" min={0} className={inputCls + " w-full font-mono"} value={staff} onChange={(e) => setStaff(num(e.target.value))} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>{t.ops_adults}</label>
            <input type="number" min={0} className={inputCls + " w-full font-mono"} value={adults} onChange={(e) => setAdults(num(e.target.value))} />
          </div>
          <div>
            <label className={labelCls}>{t.ops_children}</label>
            <input type="number" min={0} className={inputCls + " w-full font-mono"} value={children} onChange={(e) => setChildren(num(e.target.value))} />
          </div>
          <div>
            <label className={labelCls}>{t.ops_elderly}</label>
            <input type="number" min={0} className={inputCls + " w-full font-mono"} value={elderly} onChange={(e) => setElderly(num(e.target.value))} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>{t.ops_supplies}</label>
            <select className={inputCls + " w-full"} value={supplies} onChange={(e) => setSupplies(e.target.value as Shelter["supplies"])}>
              <option value="ok">{m.shelters.sup_ok}</option>
              <option value="low">{m.shelters.sup_low}</option>
              <option value="critical">{m.shelters.sup_critical}</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>{t.ops_needs}</label>
            <input className={inputCls + " w-full"} value={needs} onChange={(e) => setNeeds(e.target.value)} maxLength={200} />
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondaire cible-tactile text-sm" onClick={onClose}>{t.cancel}</button>
          <button type="button" className="btn-primaire cible-tactile text-sm" disabled={!canSubmit} onClick={() => void submit()}>{busy ? "…" : t.save}</button>
        </div>
      </div>
    </Modal>
  );
}
