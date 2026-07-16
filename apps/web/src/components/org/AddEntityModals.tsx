"use client";

import { useState } from "react";
import { useArgos, useDict } from "@/lib/store";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { svgToLL } from "@/lib/helpers";
import type { UnitReadiness } from "@/lib/types";

// ============================================================================
// ARGOS — modales de création d'entités organisationnelles (unité, hôpital)
// Création via l'API (RBAC org:*:manage appliqué serveur, mutation auditée),
// puis rechargement du domaine. La position vient d'une province de référence
// (coordonnées SVG → géographiques, comme le wizard incident).
// ============================================================================

const labelCls = "mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200";
const inputCls = "input-champ text-sm";

/** Sélecteur de province (position de la nouvelle entité). */
function ProvinceSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useDict();
  const provinces = useArgos((s) => s.provinces);
  return (
    <div>
      <label className={labelCls}>{t.f_prov}</label>
      <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
        {provinces.map((p) => (
          <option key={p.v} value={p.v}>{p.v} — {p.region}</option>
        ))}
      </select>
    </div>
  );
}

/** Modale « Ajouter une unité » (Super Admin / Admin). */
export function AddUnitModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useDict();
  const provinces = useArgos((s) => s.provinces);
  const loadDomain = useArgos((s) => s.loadDomain);
  const showToast = useArgos((s) => s.showToast);

  const [nom, setNom] = useState("");
  const [ville, setVille] = useState("");
  const [cmdt, setCmdt] = useState("");
  const [eff, setEff] = useState(200);
  const [dispo, setDispo] = useState<UnitReadiness>("ready");
  const [readiness, setReadiness] = useState(85);
  const [prov, setProv] = useState("");
  const [busy, setBusy] = useState(false);

  const canSubmit = !!(nom.trim() && ville.trim() && cmdt.trim() && eff > 0);

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      const p = provinces.find((x) => x.v === prov) ?? provinces[0];
      const res = await api.createUnit({
        nom: nom.trim(),
        ville: ville.trim(),
        cmdt: cmdt.trim(),
        eff,
        dispo,
        readiness,
        x: p.x,
        y: p.y,
        ll: svgToLL(p.x, p.y),
      });
      if (res.error) return;
      await loadDomain();
      showToast(t.toast_unit);
      setNom(""); setVille(""); setCmdt("");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const dispoOptions: [UnitReadiness, string][] = [["ready", t.u_ready], ["deployed", t.u_deployed], ["standby", t.u_standby]];

  return (
    <Modal open={open} title={t.add_unit} onClose={onClose} size="md">
      <div className="flex flex-col gap-4">
        <div>
          <label className={labelCls}>{t.h_name}</label>
          <input className={inputCls} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="6e Bataillon Médical" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>{t.lbl_city}</label>
            <input className={inputCls} value={ville} onChange={(e) => setVille(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>{t.commander}</label>
            <input className={inputCls} value={cmdt} onChange={(e) => setCmdt(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelCls}>{t.effectif}</label>
            <input type="number" min={1} className={inputCls} value={eff} onChange={(e) => setEff(Math.max(1, Number(e.target.value) || 1))} />
          </div>
          <div>
            <label className={labelCls}>{t.h_status}</label>
            <select className={inputCls} value={dispo} onChange={(e) => setDispo(e.target.value as UnitReadiness)}>
              {dispoOptions.map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t.readiness} (%)</label>
            <input type="number" min={0} max={100} className={inputCls} value={readiness} onChange={(e) => setReadiness(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} />
          </div>
        </div>
        <ProvinceSelect value={prov} onChange={setProv} />
        <div className="flex justify-end gap-2">
          <button className="btn-secondaire text-sm" onClick={onClose}>{t.cancel}</button>
          <button className="btn-primaire text-sm" onClick={() => void submit()} disabled={!canSubmit || busy}>
            {busy ? "…" : t.lbl_create}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Modale « Ajouter un hôpital » (Super Admin / Admin). */
export function AddHospitalModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useDict();
  const provinces = useArgos((s) => s.provinces);
  const loadDomain = useArgos((s) => s.loadDomain);
  const showToast = useArgos((s) => s.showToast);

  const [nom, setNom] = useState("");
  const [ville, setVille] = useState("");
  const [lits, setLits] = useState(200);
  const [rea, setRea] = useState(16);
  const [staff, setStaff] = useState(250);
  const [amb, setAmb] = useState(10);
  const [heli, setHeli] = useState(1);
  const [prov, setProv] = useState("");
  const [busy, setBusy] = useState(false);

  const canSubmit = !!(nom.trim() && ville.trim() && lits > 0);

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      const p = provinces.find((x) => x.v === prov) ?? provinces[0];
      const res = await api.createHospital({
        nom: nom.trim(),
        ville: ville.trim(),
        lits,
        rea,
        staff,
        amb,
        heli,
        x: p.x,
        y: p.y,
        ll: svgToLL(p.x, p.y),
      });
      if (res.error) return;
      await loadDomain();
      showToast(t.toast_hosp);
      setNom(""); setVille("");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const num = (v: string, min = 0) => Math.max(min, Number(v) || 0);

  return (
    <Modal open={open} title={t.add_hosp} onClose={onClose} size="md">
      <div className="flex flex-col gap-4">
        <div>
          <label className={labelCls}>{t.h_name}</label>
          <input className={inputCls} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Hôpital Militaire de Tanger" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>{t.lbl_city}</label>
            <input className={inputCls} value={ville} onChange={(e) => setVille(e.target.value)} />
          </div>
          <ProvinceSelect value={prov} onChange={setProv} />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <div>
            <label className={labelCls}>{t.beds_total}</label>
            <input type="number" min={1} className={inputCls} value={lits} onChange={(e) => setLits(num(e.target.value, 1))} />
          </div>
          <div>
            <label className={labelCls}>{t.icu}</label>
            <input type="number" min={0} className={inputCls} value={rea} onChange={(e) => setRea(num(e.target.value))} />
          </div>
          <div>
            <label className={labelCls}>{t.staff}</label>
            <input type="number" min={0} className={inputCls} value={staff} onChange={(e) => setStaff(num(e.target.value))} />
          </div>
          <div>
            <label className={labelCls}>{t.lbl_amb}</label>
            <input type="number" min={0} className={inputCls} value={amb} onChange={(e) => setAmb(num(e.target.value))} />
          </div>
          <div>
            <label className={labelCls}>{t.lbl_heli}</label>
            <input type="number" min={0} className={inputCls} value={heli} onChange={(e) => setHeli(num(e.target.value))} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-secondaire text-sm" onClick={onClose}>{t.cancel}</button>
          <button className="btn-primaire text-sm" onClick={() => void submit()} disabled={!canSubmit || busy}>
            {busy ? "…" : t.lbl_create}
          </button>
        </div>
      </div>
    </Modal>
  );
}
