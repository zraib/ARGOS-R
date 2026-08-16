"use client";

// Vues « Ma responsabilité » pour l'HÔPITAL MILITAIRE : tableau de bord + gestion.
// Extraites des pages pour être réutilisables — la supervision (/responsabilites)
// affiche les MÊMES tableaux de bord, sur une entité choisie plutôt que sur
// l'entité affectée. Écriture cantonnée côté API (@RequireScope("hospital")).

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useArgos, useModules } from "@/lib/store";
import { api } from "@/lib/api";
import { StatTile } from "@/components/ui/StatTile";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Modal } from "@/components/ui/Modal";
import { Pill } from "@/components/ui/Pill";
import { Icon } from "@/components/ui/Icon";
import { KPI_ICONS, NAV_ICONS, UI_ICONS } from "@/lib/icons";
import { loadBarClass } from "@/lib/responsibility";
import { useSupervision, WARD_STATUSES, WARD_TONES, type Ward } from "@/components/responsibility/Shared";
import type { Hospital } from "@/lib/types";

/** L'établissement visé : celui de la session, ou celui choisi en supervision. */
function useHospital(hid: string): Hospital | null {
  const hospitals = useArgos((s) => s.hospitals);
  return hospitals.find((h) => h.id === hid) ?? null;
}

export function HospitalDashboard({ hid }: { hid: string }) {
  const m = useModules();
  const supervised = useSupervision();
  const hosp = useHospital(hid);
  const fieldHosps = useArgos((s) => s.fieldHosps);
  const incidents = useArgos((s) => s.incidents);
  const [wards, setWards] = useState<Ward[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getWards(hid);
      if (res.data) setWards(res.data as unknown as Ward[]);
    } finally {
      setLoading(false);
    }
  }, [hid]);

  useEffect(() => {
    void load();
  }, [load]);

  // L'établissement peut ne pas être encore chargé dans le store.
  if (!hosp) {
    return (
      <section className="animate-fade-in">
        <div className="carte p-6 text-sm text-gray-500 dark:text-rdia-300">{m.resp.loading}</div>
      </section>
    );
  }

  const occPct = hosp.lits > 0 ? Math.round((hosp.occ / hosp.lits) * 100) : 0;
  const reaPct = hosp.rea > 0 ? Math.round((hosp.reaOcc / hosp.rea) * 100) : 0;
  const myFields = fieldHosps.filter((f) => f.hid === hid);
  // Incidents ayant explicitement engagé cet établissement.
  const myIncidents = incidents.filter((i) => !i.archived && i.responders?.hospitals?.includes(hid));

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      <Header hosp={{ nom: hosp.nom, ville: hosp.ville, type: hosp.type }} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={m.resp.beds_free} value={hosp.lits - hosp.occ} sub={`/ ${hosp.lits}`} icon={KPI_ICONS.beds} tint={occPct >= 90 ? "danger" : "green"} />
        <StatTile label={m.resp.icu_free} value={hosp.rea - hosp.reaOcc} sub={`/ ${hosp.rea}`} icon={KPI_ICONS.incidents} tint={reaPct >= 90 ? "danger" : "or"} />
        <StatTile label={m.resp.staff} value={hosp.staff} icon={KPI_ICONS.personnel} tint="blue" />
        <StatTile label={m.resp.vehicles} value={`${hosp.amb} + ${hosp.heli}`} sub={m.resp.amb_heli} icon={KPI_ICONS.units} tint="rdia" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="carte flex flex-col gap-4 p-5">
          <h3 className="text-sm font-bold text-rdia-600 dark:text-rdia-50">{m.resp.load}</h3>
          <Gauge label={m.resp.beds_overall} occ={hosp.occ} total={hosp.lits} pct={occPct} />
          <Gauge label={m.resp.icu} occ={hosp.reaOcc} total={hosp.rea} pct={reaPct} />
        </div>

        <div className="carte flex flex-col gap-3 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-rdia-600 dark:text-rdia-50">{m.resp.field_hosp}</h3>
            <span className="font-mono text-[10px] text-gray-400 dark:text-rdia-400">{myFields.length}</span>
          </div>
          {myFields.length === 0 && <Empty label={m.resp.no_field} />}
          {myFields.map((f) => {
            const pct = f.cap > 0 ? Math.round((f.occ / f.cap) * 100) : 0;
            return (
              <div key={f.nom}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-700 dark:text-rdia-100">{f.nom}</span>
                  <span className="font-mono text-[10px] text-gray-400 dark:text-rdia-400">{f.occ} / {f.cap} · {f.depuis}</span>
                </div>
                <ProgressBar value={pct} fill={loadBarClass(pct)} height="h-2" />
              </div>
            );
          })}
        </div>
      </div>

      <div className="carte flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-rdia-600 dark:text-rdia-50">{m.resp.wards}</h3>
          {!supervised && <Link href="/ma-responsabilite/gestion" className="cible-tactile btn-secondaire shrink-0 text-xs">{m.resp.manage}</Link>}
        </div>
        {loading && <Empty label={m.resp.loading} />}
        {!loading && wards.length === 0 && <Empty label={m.resp.no_ward} />}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {wards.map((w) => {
            const pct = w.lits > 0 ? Math.round((w.occ / w.lits) * 100) : 0;
            return (
              <div key={w.id} className="rounded-lg border border-gray-100 p-3 dark:border-rdia-700/60">
                <div className="mb-1.5 flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold leading-snug text-gray-800 dark:text-rdia-50">{w.nom}</span>
                  <Pill tone={WARD_TONES[w.statut]} label={m.resp.ward_status[w.statut]} />
                </div>
                <div className="mb-1 flex items-center justify-between text-[10px] text-gray-400 dark:text-rdia-400">
                  <span>{w.chef ?? "—"}</span>
                  <span className="font-mono">{w.occ} / {w.lits} · {pct} %</span>
                </div>
                <ProgressBar value={pct} fill={loadBarClass(pct)} height="h-2" />
              </div>
            );
          })}
        </div>
      </div>

      <div className="carte flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-rdia-600 dark:text-rdia-50">{m.resp.incidents}</h3>
          <span className="font-mono text-[10px] text-gray-400 dark:text-rdia-400">{myIncidents.length}</span>
        </div>
        {myIncidents.length === 0 && <Empty label={m.resp.no_incident} />}
        {myIncidents.map((i) => (
          <div key={i.id} className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2 dark:bg-rdia-800/50">
            <Icon path={KPI_ICONS.incidents} size={14} />
            <span className="font-mono text-[10px] text-gray-400 dark:text-rdia-400">{i.id}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-gray-700 dark:text-rdia-100">{i.titre}</span>
            <span className="font-mono text-[10px] text-gray-400 dark:text-rdia-400">{i.time}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Header({ hosp }: { hosp: { nom: string; ville: string; type?: string } }) {
  const m = useModules();
  const supervised = useSupervision();
  return (
    <div className="carte flex flex-wrap items-center gap-2 p-3 sm:gap-3 sm:p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-or-500/15 text-or-500">
        <Icon path={NAV_ICONS.hospitals} size={20} />
      </div>
      {/* `basis-32` : le titre RÉCLAME de la place, sinon (basis 0) la pastille
          et le bouton restent sur la première ligne et l'écrasent. */}
      <div className="min-w-0 flex-1 basis-32 sm:basis-40">
        <h2 className="truncate text-sm font-bold text-rdia-600 dark:text-rdia-50">{hosp.nom}</h2>
        <p className="truncate text-xs text-gray-500 dark:text-rdia-300">
          {hosp.ville}{hosp.type ? ` · ${hosp.type}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-or-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-or-500">
          {m.resp.my_responsibility}
        </span>
        {!supervised && (
          <Link href="/ma-responsabilite/gestion" className="cible-tactile btn-primaire flex items-center gap-1.5 text-sm">
            <Icon path={UI_ICONS.edit} size={14} />
            {m.resp.manage}
          </Link>
        )}
      </div>
    </div>
  );
}

function Gauge({ label, occ, total, pct }: { label: string; occ: number; total: number; pct: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-gray-700 dark:text-rdia-100">{label}</span>
        <span className="font-mono text-[10px] text-gray-400 dark:text-rdia-400">{occ} / {total} · {pct} %</span>
      </div>
      <ProgressBar value={pct} fill={loadBarClass(pct)} height="h-2.5" />
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 py-4 text-center text-[11px] text-gray-400 dark:border-rdia-700 dark:text-rdia-400">
      {label}
    </div>
  );
}

export function HospitalManagement({ hid }: { hid: string }) {
  const m = useModules();
  const hosp = useHospital(hid);
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
      <div className="carte flex flex-wrap items-center gap-2 p-3 sm:gap-3 sm:p-4">
        <Link href="/ma-responsabilite" className="cible-tactile flex shrink-0 items-center justify-center rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-or-500 dark:hover:bg-rdia-600">
          {/* La flèche de retour suit le sens de lecture (RTL en arabe). */}
          <Icon path={UI_ICONS.arrowLeft} size={16} strokeWidth={2} className="rtl:rotate-180" />
        </Link>
        <div className="min-w-0 flex-1 basis-32 sm:basis-40">
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
              // Les largeurs figées (200 px / 150 px) débordaient sous 375 px :
              // remplacées par des bases souples qui se replient.
              <div key={w.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-gray-100 p-3 dark:border-rdia-700/60">
                <div className="min-w-0 flex-1 basis-40">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-semibold text-gray-800 dark:text-rdia-50">{w.nom}</span>
                    <Pill tone={WARD_TONES[w.statut]} label={m.resp.ward_status[w.statut]} />
                  </div>
                  <div className="mt-0.5 truncate text-[10px] text-gray-400 dark:text-rdia-400">{w.chef ?? "—"}</div>
                </div>
                <div className="min-w-0 flex-1 basis-32 sm:max-w-[150px] sm:flex-none sm:basis-[150px]">
                  <div className="mb-1 text-end font-mono text-[10px] text-gray-400 dark:text-rdia-400">{w.occ} / {w.lits} · {pct} %</div>
                  <ProgressBar value={pct} fill={loadBarClass(pct)} height="h-2" />
                </div>
                <div className="flex shrink-0 gap-2">
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
          <div className="flex flex-wrap justify-end gap-2">
            <button className="cible-tactile btn-secondaire text-sm" onClick={() => setConfirmDel(null)}>{m.resp.cancel}</button>
            <button
              className="cible-tactile rounded-lg bg-danger-500 px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
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
  const hosp = useHospital(hid);
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
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 xl:grid-cols-7">
        {fields.map(([k, label]) => (
          <div key={k}>
            <label className="mb-1 block text-[11px] font-semibold text-gray-600 dark:text-rdia-200">{label}</label>
            {/* 16 px sur mobile (pas de zoom iOS au focus) et hauteur ≥ 44 px. */}
            <input
              className="input-champ font-mono text-base md:text-sm"
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
        {/* Champs à 16 px sur mobile : sous ce seuil iOS zoome au focus. */}
        <div>
          <label className={labelCls}>{m.resp.f_ward_name}</label>
          <input className="input-champ text-base md:text-sm" placeholder={m.resp.f_ward_name_ph} value={nom} onChange={(e) => { setNom(e.target.value); setError(null); }} />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <div>
            <label className={labelCls}>{m.resp.f_beds}</label>
            <input className="input-champ font-mono text-base md:text-sm" type="number" min={0} value={lits} onChange={(e) => { setLits(Math.max(0, parseInt(e.target.value, 10) || 0)); setError(null); }} />
          </div>
          <div>
            <label className={labelCls}>{m.resp.f_occ}</label>
            <input className="input-champ font-mono text-base md:text-sm" type="number" min={0} value={occ} onChange={(e) => { setOcc(Math.max(0, parseInt(e.target.value, 10) || 0)); setError(null); }} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>{m.resp.f_status}</label>
            <select className="input-champ text-base md:text-sm" value={statut} onChange={(e) => setStatut(e.target.value as Ward["statut"])}>
              {WARD_STATUSES.map((s) => <option key={s} value={s}>{m.resp.ward_status[s]}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>{m.resp.f_chief}</label>
            <input className="input-champ text-base md:text-sm" placeholder={m.resp.f_chief_ph} value={chef} onChange={(e) => setChef(e.target.value)} />
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
      className={`cible-tactile flex items-center justify-center rounded-lg p-1.5 transition-colors ${
        danger
          ? "text-gray-400 hover:bg-danger-500/10 hover:text-danger-500"
          : "text-gray-400 hover:bg-gray-100 hover:text-or-500 dark:hover:bg-rdia-600"
      }`}
    >
      <Icon path={icon} size={14} />
    </button>
  );
}
