"use client";

import { useState } from "react";
import { useArgos, useDict, useModules } from "@/lib/store";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { HOSPITAL_KINDS, hospKind, kindDef } from "@/lib/hospitals";
import { HealthGlyph } from "@/components/health/HealthGlyph";
import { MORGUE_TYPES, UNIT_CORPS, type Hospital, type HospitalKind, type MorgueSite, type MorgueType, type Unit, type UnitCorps, type City } from "@/lib/types";
import { corpsLabel, corpsShort } from "@/lib/corps";
import { SHELTER_ORGANS, type Shelter, type ShelterBuilding, type ShelterKind, type ShelterOrgan } from "@/lib/data/modules";
import { LocationPicker, useLocationPicker } from "@/components/org/LocationPicker";
import { resolvePoint } from "@/lib/geo";
import type { Province } from "@/lib/types";

// ============================================================================
// ARGOS — modales de MODIFICATION d'une unité, d'un abri, d'un établissement et
// d'un site mortuaire (ADR 0019). Les mêmes champs que la création, la position
// comprise : la cascade du référentiel puis un point sur la carte, comme à la
// déclaration d'un incident. Toute écriture passe par `PATCH /units/:id`,
// `/shelters/:id`, `/hospitals/:id`, `/morgues/:id`, que l'API garde par le
// rôle, le mode et la portée — la modale ne fait qu'éviter de proposer l'impossible.
// ============================================================================

const labelCls = "mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200";
const inputCls = "input-champ text-sm";

/**
 * Le lieu d'une entité tel que le sélecteur le reprend : sa région, sa
 * province, sa commune si le référentiel la connaît, son point. Sans
 * rattachement enregistré (une morgue mobile posée sur le terrain…), le point
 * dit sa province et, s'il en est assez près, sa commune.
 */
function initialLocation(e: { region?: string; province?: string; ville: string; ll?: [number, number] }, cities: readonly City[], provinces: readonly Province[]) {
  const city = cities.find((c) => c.v === e.ville && (!e.province || c.province === e.province)) ?? cities.find((c) => c.v === e.ville);
  let loc = { region: e.region ?? city?.region ?? "", province: e.province ?? city?.province ?? "", city: city ? city.v : "" };
  if (!loc.province && e.ll) {
    const r = resolvePoint(e.ll, { provinces, cities });
    loc = { region: r.region ?? "", province: r.province ?? "", city: r.city ?? "" };
  }
  return { loc, pin: e.ll ?? null };
}

/** Le message d'erreur d'une route non typée par le client généré. */
function errorOf(res: unknown): string | null {
  const err = (res as { error?: { message?: string | string[] } }).error;
  if (!err) return null;
  const msg = err.message;
  return Array.isArray(msg) ? msg.join(" · ") : (msg ?? "");
}

export function EditUnitModal({ unit, onClose }: { unit: Unit; onClose: () => void }) {
  const t = useDict();
  const cities = useArgos((s) => s.cities);
  const loadDomain = useArgos((s) => s.loadDomain);
  const showToast = useArgos((s) => s.showToast);
  const [nom, setNom] = useState(unit.nom);
  const [ville, setVille] = useState(unit.ville);
  // La position reprend celle de l'unité ; un point posé ou une commune choisie la remplace.
  const provinces = useArgos((s) => s.provinces);
  const picker = useLocationPicker(initialLocation(unit, cities, provinces), setVille);
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
        ...(picker.ll ? { ll: picker.ll } : {}),
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
        <div>
          <label className={labelCls}>{t.f_corps}</label>
          <select className={inputCls + " w-full"} value={corps} onChange={(e) => setCorps(e.target.value as UnitCorps)}>
            {UNIT_CORPS.map((c) => <option key={c} value={c}>{corpsLabel(c, t)}</option>)}
          </select>
        </div>
        <LocationPicker picker={picker} height="h-48" />
        <div>
          <label className={labelCls}>{t.lbl_city}</label>
          <input className={inputCls + " w-full"} value={ville} onChange={(e) => setVille(e.target.value)} maxLength={60} />
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
  const cities = useArgos((s) => s.cities);
  const loadDomain = useArgos((s) => s.loadDomain);
  const showToast = useArgos((s) => s.showToast);
  const [nom, setNom] = useState(shelter.nom);
  const [ville, setVille] = useState(shelter.ville);
  const provinces = useArgos((s) => s.provinces);
  const picker = useLocationPicker(initialLocation(shelter, cities, provinces), setVille);
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
        ...(picker.loc.region ? { region: picker.loc.region as never } : {}),
        ...(picker.loc.province ? { province: picker.loc.province } : {}),
        ...(picker.ll ? { ll: picker.ll } : {}),
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
        <LocationPicker picker={picker} height="h-48" />
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

/** Modifier un établissement de santé : identité, implantation (cascade + point sur la carte) et capacités. */
export function EditHospitalModal({ hospital, onClose }: { hospital: Hospital; onClose: () => void }) {
  const t = useDict();
  const cities = useArgos((s) => s.cities);
  const loadDomain = useArgos((s) => s.loadDomain);
  const showToast = useArgos((s) => s.showToast);
  const [nom, setNom] = useState(hospital.nom);
  const [ville, setVille] = useState(hospital.ville);
  const [kind, setKind] = useState<HospitalKind>(hospKind(hospital));
  const provinces = useArgos((s) => s.provinces);
  const picker = useLocationPicker(initialLocation(hospital, cities, provinces), setVille);
  const [lits, setLits] = useState(hospital.lits);
  const [rea, setRea] = useState(hospital.rea);
  const [staff, setStaff] = useState(hospital.staff);
  const [amb, setAmb] = useState(hospital.amb);
  const [heli, setHeli] = useState(hospital.heli);
  const [busy, setBusy] = useState(false);
  const num = (v: string, min = 0) => Math.max(min, parseInt(v, 10) || 0);
  const canSubmit = nom.trim().length >= 2 && ville.trim().length >= 2 && lits >= 1 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const res = await api.updateHospital(hospital.id, {
        nom: nom.trim(),
        ville: ville.trim(),
        kind,
        type: kindDef(kind).long,
        ...(picker.loc.region ? { region: picker.loc.region as never } : {}),
        ...(picker.loc.province ? { province: picker.loc.province } : {}),
        ...(picker.ll ? { ll: picker.ll } : {}),
        lits,
        rea,
        staff,
        amb,
        heli,
      });
      const err = errorOf(res);
      if (err !== null) {
        showToast(`${t.toast_fail} — ${err}`);
        return;
      }
      await loadDomain();
      showToast(t.hn_hospital_updated);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={`${t.hn_edit_hospital} — ${hospital.nom}`} onClose={onClose} size="md">
      <div className="space-y-3">
        <div>
          <label className={labelCls}>{t.h_name}</label>
          <input className={inputCls + " w-full"} value={nom} onChange={(e) => setNom(e.target.value)} maxLength={120} />
        </div>
        <div>
          <label className={labelCls}>{t.hn_filter_kind}</label>
          <div className="flex flex-wrap gap-2">
            {HOSPITAL_KINDS.map((k) => (
              <button
                key={k.kind}
                type="button"
                onClick={() => setKind(k.kind)}
                aria-pressed={kind === k.kind}
                className={`cible-tactile flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  kind === k.kind ? "border-or-500 bg-or-500/15 text-or-600 dark:text-or-400" : "border-gray-200 text-gray-600 hover:border-or-400 dark:border-rdia-600 dark:text-rdia-200"
                }`}
              >
                <HealthGlyph kind={k.kind} size={14} /> {k.label}
              </button>
            ))}
          </div>
        </div>
        <LocationPicker picker={picker} height="h-48" />
        <div>
          <label className={labelCls}>{t.lbl_city}</label>
          <input className={inputCls + " w-full"} value={ville} onChange={(e) => setVille(e.target.value)} maxLength={60} />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div>
            <label className={labelCls}>{t.beds}</label>
            <input type="number" min={1} className={inputCls + " w-full font-mono"} value={lits} onChange={(e) => setLits(num(e.target.value, 1))} />
          </div>
          <div>
            <label className={labelCls}>{t.icu}</label>
            <input type="number" min={0} className={inputCls + " w-full font-mono"} value={rea} onChange={(e) => setRea(num(e.target.value))} />
          </div>
          <div>
            <label className={labelCls}>{t.staff}</label>
            <input type="number" min={0} className={inputCls + " w-full font-mono"} value={staff} onChange={(e) => setStaff(num(e.target.value))} />
          </div>
          <div>
            <label className={labelCls}>{t.lbl_amb}</label>
            <input type="number" min={0} className={inputCls + " w-full font-mono"} value={amb} onChange={(e) => setAmb(num(e.target.value))} />
          </div>
          <div>
            <label className={labelCls}>{t.lbl_heli}</label>
            <input type="number" min={0} className={inputCls + " w-full font-mono"} value={heli} onChange={(e) => setHeli(num(e.target.value))} />
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

/** Modifier un site mortuaire : désignation, type, implantation (cascade + point sur la carte), capacité et effectif. */
export function EditMorgueModal({ site, onClose, onSaved }: { site: MorgueSite; onClose: () => void; onSaved?: () => void }) {
  const t = useDict();
  const m = useModules();
  const cities = useArgos((s) => s.cities);
  const reloadMorgues = useArgos((s) => s.reloadMorgues);
  const showToast = useArgos((s) => s.showToast);
  const [nom, setNom] = useState(site.nom);
  const [ville, setVille] = useState(site.ville);
  const [type, setType] = useState<MorgueType>(site.type ?? "hospital");
  const provinces = useArgos((s) => s.provinces);
  const picker = useLocationPicker(initialLocation(site, cities, provinces), setVille);
  const [capacity, setCapacity] = useState(site.capacity);
  const [staff, setStaff] = useState(site.staff);
  const [busy, setBusy] = useState(false);
  const canSubmit = nom.trim().length >= 2 && ville.trim().length >= 2 && capacity >= 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const res = await api.updateMorgue(site.id, {
        nom: nom.trim(),
        type,
        ville: ville.trim(),
        ...(picker.loc.region ? { region: picker.loc.region } : {}),
        ...(picker.loc.province ? { province: picker.loc.province } : {}),
        ...(picker.ll ? { ll: picker.ll } : {}),
        capacity,
        staff,
      });
      const err = errorOf(res);
      if (err !== null) {
        showToast(`${t.toast_fail} — ${err}`);
        return;
      }
      await reloadMorgues();
      showToast(m.morgue.site_updated);
      onSaved?.();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={`${m.morgue.edit_site_title} — ${site.nom}`} onClose={onClose} size="md">
      <div className="space-y-3">
        <div>
          <label className={labelCls}>{m.morgue.a_name}</label>
          <input className={inputCls + " w-full"} value={nom} onChange={(e) => setNom(e.target.value)} maxLength={120} />
        </div>
        <div>
          <label className={labelCls}>{m.morgue.a_type}</label>
          <div className="flex flex-wrap gap-2">
            {MORGUE_TYPES.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setType(k)}
                aria-pressed={type === k}
                className={`cible-tactile rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  type === k ? "border-or-500 bg-or-500/15 text-or-600 dark:text-or-400" : "border-gray-200 text-gray-600 hover:border-or-400 dark:border-rdia-600 dark:text-rdia-200"
                }`}
              >
                {m.morgue.types[k]}
              </button>
            ))}
          </div>
        </div>
        <LocationPicker picker={picker} height="h-48" />
        <div>
          <label className={labelCls}>{t.lbl_city}</label>
          <input className={inputCls + " w-full"} value={ville} onChange={(e) => setVille(e.target.value)} maxLength={60} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>{m.morgue.d_capacity}</label>
            <input type="number" min={0} className={inputCls + " w-full font-mono"} value={capacity} onChange={(e) => setCapacity(Math.max(0, parseInt(e.target.value, 10) || 0))} />
          </div>
          <div>
            <label className={labelCls}>{m.morgue.d_staff}</label>
            <input type="number" min={0} className={inputCls + " w-full font-mono"} value={staff} onChange={(e) => setStaff(Math.max(0, parseInt(e.target.value, 10) || 0))} />
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
