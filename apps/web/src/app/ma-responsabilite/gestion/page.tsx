"use client";

// ============================================================================
// « Ma responsabilité › Gestion » — édition de l'entité dont le compte a la charge
//
// Hôpital militaire : capacités de l'établissement + CRUD des services de soins.
// Toute écriture passe par une route cantonnée côté API (@RequireScope) : cet
// écran ne protège rien, il évite simplement de proposer l'impossible.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useArgos, useModules } from "@/lib/store";
import { api } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Pill } from "@/components/ui/Pill";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { UI_ICONS } from "@/lib/icons";
import { loadBarClass, useMyHospital, useResponsibility } from "@/lib/responsibility";
import { NoResponsibility, PendingModule, WARD_STATUSES, WARD_TONES, type Ward } from "@/components/responsibility/Shared";
import { UnitManagement } from "@/components/responsibility/UnitViews";
import { ShelterManagement } from "@/components/responsibility/ShelterViews";
import { MorgueManagement } from "@/components/responsibility/MorgueViews";
import { EquipmentPark } from "@/components/responsibility/EquipmentViews";

export default function GestionPage() {
  const { kind, entityId } = useResponsibility();

  if (!kind) return <NoResponsibility />;
  if (!entityId) return <NoResponsibility unassigned />;
  if (kind === "unit") return <UnitManagement uid={entityId} />;
  if (kind === "shelter") return <ShelterManagement sid={entityId} />;
  if (kind === "morgue") return <MorgueManagement mid={entityId} />;
  if (kind === "equipment") return <EquipmentPark unitId={entityId} />;
  if (kind !== "hospital") return <PendingModule kind={kind} entityId={entityId} />;
  return <HospitalManagement hid={entityId} />;
}

function HospitalManagement({ hid }: { hid: string }) {
  const m = useModules();
  const hosp = useMyHospital();
  const showToast = useArgos((s) => s.showToast);
  const loadDomain = useArgos((s) => s.loadDomain);

  const [wards, setWards] = useState<Ward[]>([]);
  const [editing, setEditing] = useState<Ward | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Ward | null>(null);

  const loadWards = useCallback(async () => {
    const res = await api.getWards(hid);
    if (res.data) setWards(res.data as unknown as Ward[]);
  }, [hid]);

  useEffect(() => {
    void loadWards();
  }, [loadWards]);

  if (!hosp) {
    return (
      <section className="animate-fade-in">
        <div className="carte p-6 text-sm text-gray-500 dark:text-rdia-300">{m.resp.loading}</div>
      </section>
    );
  }

  const removeWard = async (w: Ward) => {
    const res = await api.deleteWard(hid, w.id);
    if (res.error) { showToast(m.resp.err_denied); return; }
    showToast(m.resp.ward_deleted);
    setConfirmDel(null);
    void loadWards();
  };

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      <div className="carte flex flex-wrap items-center gap-3 p-4">
        <Link href="/ma-responsabilite" className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-or-500 dark:hover:bg-rdia-600">
          <Icon path={UI_ICONS.arrowLeft} size={16} strokeWidth={2} />
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-bold text-rdia-600 dark:text-rdia-50">{m.resp.manage_title}</h2>
          <p className="truncate text-xs text-gray-500 dark:text-rdia-300">{hosp.nom} — {hosp.ville}</p>
        </div>
      </div>

      <CapacityForm hid={hid} onSaved={() => { showToast(m.resp.saved); void loadDomain(); }} />

      <div className="carte flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex-1 text-sm font-bold text-rdia-600 dark:text-rdia-50">{m.resp.wards}</h3>
          <button className="btn-primaire flex items-center gap-1.5 text-xs" onClick={() => setAdding(true)}>
            <Icon path={UI_ICONS.plus} size={14} />
            {m.resp.add_ward}
          </button>
        </div>

        {wards.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-200 py-6 text-center text-[11px] text-gray-400 dark:border-rdia-700 dark:text-rdia-400">
            {m.resp.no_ward}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {wards.map((w) => {
            const pct = w.lits > 0 ? Math.round((w.occ / w.lits) * 100) : 0;
            return (
              <div key={w.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-100 p-3 dark:border-rdia-700/60">
                <div className="min-w-0 flex-1" style={{ minWidth: 200 }}>
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-semibold text-gray-800 dark:text-rdia-50">{w.nom}</span>
                    <Pill tone={WARD_TONES[w.statut]} label={m.resp.ward_status[w.statut]} />
                  </div>
                  <div className="mt-0.5 truncate text-[10px] text-gray-400 dark:text-rdia-400">{w.chef ?? "—"}</div>
                </div>
                <div style={{ width: 150 }}>
                  <div className="mb-1 text-end font-mono text-[10px] text-gray-400 dark:text-rdia-400">{w.occ} / {w.lits} · {pct} %</div>
                  <ProgressBar value={pct} fill={loadBarClass(pct)} height="h-2" />
                </div>
                <div className="flex gap-1">
                  <IconButton icon={UI_ICONS.edit} title={m.resp.edit} onClick={() => setEditing(w)} />
                  <IconButton icon={UI_ICONS.trash} title={m.resp.delete} danger onClick={() => setConfirmDel(w)} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {(adding || editing) && (
        <WardForm
          hid={hid}
          ward={editing ?? undefined}
          onClose={() => { setAdding(false); setEditing(null); }}
          onDone={() => { setAdding(false); setEditing(null); void loadWards(); }}
        />
      )}

      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title={m.resp.delete_ward_title}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600 dark:text-rdia-200">
            {m.resp.delete_ward_text} <strong>{confirmDel?.nom}</strong> ?
          </p>
          <div className="flex justify-end gap-2">
            <button className="btn-secondaire text-sm" onClick={() => setConfirmDel(null)}>{m.resp.cancel}</button>
            <button
              className="rounded-lg bg-danger-500 px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              onClick={() => confirmDel && void removeWard(confirmDel)}
            >
              {m.resp.delete}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}

/** Capacités de l'établissement — PATCH /hospitals/:id (route cantonnée). */
function CapacityForm({ hid, onSaved }: { hid: string; onSaved: () => void }) {
  const m = useModules();
  const hosp = useMyHospital();
  const showToast = useArgos((s) => s.showToast);
  const [form, setForm] = useState(() => ({
    lits: hosp?.lits ?? 0, occ: hosp?.occ ?? 0,
    rea: hosp?.rea ?? 0, reaOcc: hosp?.reaOcc ?? 0,
    staff: hosp?.staff ?? 0, amb: hosp?.amb ?? 0, heli: hosp?.heli ?? 0,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const num = (k: keyof typeof form) => (v: string) => {
    setError(null);
    setForm((f) => ({ ...f, [k]: Math.max(0, parseInt(v, 10) || 0) }));
  };

  const save = async () => {
    if (form.occ > form.lits) { setError(m.resp.err_occ); return; }
    if (form.reaOcc > form.rea) { setError(m.resp.err_rea); return; }
    setBusy(true);
    try {
      const res = await api.updateHospital(hid, form);
      if (res.error) { showToast(m.resp.err_denied); return; }
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const fields: [keyof typeof form, string][] = [
    ["lits", m.resp.f_beds], ["occ", m.resp.f_occ],
    ["rea", m.resp.f_icu], ["reaOcc", m.resp.f_icu_occ],
    ["staff", m.resp.f_staff], ["amb", m.resp.f_amb], ["heli", m.resp.f_heli],
  ];

  return (
    <div className="carte flex flex-col gap-4 p-5">
      <h3 className="text-sm font-bold text-rdia-600 dark:text-rdia-50">{m.resp.capacities}</h3>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
        {fields.map(([k, label]) => (
          <div key={k}>
            <label className="mb-1 block text-[11px] font-semibold text-gray-600 dark:text-rdia-200">{label}</label>
            <input
              className="input-champ font-mono text-sm"
              type="number"
              min={0}
              value={form[k]}
              onChange={(e) => num(k)(e.target.value)}
            />
          </div>
        ))}
      </div>
      {error && <p className="text-xs font-semibold text-danger-500">{error}</p>}
      <div className="flex justify-end">
        <button className="btn-primaire text-sm disabled:opacity-60" disabled={busy} onClick={() => void save()}>
          {busy ? m.resp.saving : m.resp.save}
        </button>
      </div>
    </div>
  );
}

/** Création / modification d'un service de soins. */
function WardForm({ hid, ward, onClose, onDone }: { hid: string; ward?: Ward; onClose: () => void; onDone: () => void }) {
  const m = useModules();
  const showToast = useArgos((s) => s.showToast);
  const editing = !!ward;
  const [nom, setNom] = useState(ward?.nom ?? "");
  const [lits, setLits] = useState(ward?.lits ?? 0);
  const [occ, setOcc] = useState(ward?.occ ?? 0);
  const [statut, setStatut] = useState<Ward["statut"]>(ward?.statut ?? "open");
  const [chef, setChef] = useState(ward?.chef ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!nom.trim()) { setError(m.resp.err_name); return; }
    if (occ > lits) { setError(m.resp.err_occ); return; }
    setBusy(true);
    try {
      const body = { nom: nom.trim(), lits, occ, statut, chef: chef.trim() || undefined };
      const res = editing && ward ? await api.updateWard(hid, ward.id, body) : await api.createWard(hid, body);
      if (res.error) { showToast(m.resp.err_denied); return; }
      showToast(editing ? m.resp.ward_saved : m.resp.ward_created);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  const labelCls = "mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200";

  return (
    <Modal open onClose={onClose} title={editing ? m.resp.edit_ward : m.resp.add_ward}>
      <div className="flex flex-col gap-4">
        <div>
          <label className={labelCls}>{m.resp.f_ward_name}</label>
          <input className="input-champ text-sm" placeholder={m.resp.f_ward_name_ph} value={nom} onChange={(e) => { setNom(e.target.value); setError(null); }} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{m.resp.f_beds}</label>
            <input className="input-champ font-mono text-sm" type="number" min={0} value={lits} onChange={(e) => { setLits(Math.max(0, parseInt(e.target.value, 10) || 0)); setError(null); }} />
          </div>
          <div>
            <label className={labelCls}>{m.resp.f_occ}</label>
            <input className="input-champ font-mono text-sm" type="number" min={0} value={occ} onChange={(e) => { setOcc(Math.max(0, parseInt(e.target.value, 10) || 0)); setError(null); }} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{m.resp.f_status}</label>
            <select className="input-champ text-sm" value={statut} onChange={(e) => setStatut(e.target.value as Ward["statut"])}>
              {WARD_STATUSES.map((s) => <option key={s} value={s}>{m.resp.ward_status[s]}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>{m.resp.f_chief}</label>
            <input className="input-champ text-sm" placeholder={m.resp.f_chief_ph} value={chef} onChange={(e) => setChef(e.target.value)} />
          </div>
        </div>
        {error && <p className="text-xs font-semibold text-danger-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondaire text-sm" onClick={onClose}>{m.resp.cancel}</button>
          <button className="btn-primaire text-sm disabled:opacity-60" disabled={busy} onClick={() => void submit()}>
            {busy ? m.resp.saving : m.resp.save}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function IconButton({ icon, title, onClick, danger = false }: { icon: string; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`rounded-lg p-1.5 transition-colors ${
        danger
          ? "text-gray-400 hover:bg-danger-500/10 hover:text-danger-500"
          : "text-gray-400 hover:bg-gray-100 hover:text-or-500 dark:hover:bg-rdia-600"
      }`}
    >
      <Icon path={icon} size={14} />
    </button>
  );
}
