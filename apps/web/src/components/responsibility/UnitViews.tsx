"use client";

// Vues « Ma responsabilité » pour l'UNITÉ : tableau de bord + gestion.
// L'unité est résolue depuis la portée ABAC ; toute écriture passe par
// PATCH /units/:id, route cantonnée côté API (@RequireScope("unit")).

import { useState } from "react";
import Link from "next/link";
import { useArgos, useModules } from "@/lib/store";
import { api } from "@/lib/api";
import { StatTile } from "@/components/ui/StatTile";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Icon } from "@/components/ui/Icon";
import { Pill, type Tone } from "@/components/ui/Pill";
import { KPI_ICONS, NAV_ICONS, UI_ICONS } from "@/lib/icons";
import { loadBarClass } from "@/lib/responsibility";
import { Loading, useSupervision, RespHeader, Section } from "@/components/responsibility/Shared";
import type { Unit } from "@/lib/types";

const DISPO_TONES: Record<Unit["dispo"], Tone> = { ready: "green", deployed: "amber", standby: "gray" };

/** L'unité dont la session a la charge, ou `null` si pas encore chargée. */
function useMyUnit(uid: string): Unit | null {
  const units = useArgos((s) => s.units);
  return units.find((u) => u.id === uid) ?? null;
}

export function UnitDashboard({ uid }: { uid: string }) {
  const m = useModules();
  const supervised = useSupervision();
  const unit = useMyUnit(uid);
  const incidents = useArgos((s) => s.incidents);
  if (!unit) return <Loading />;

  const myIncidents = incidents.filter((i) => !i.archived && i.responders?.units?.includes(uid));

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      <RespHeader
        icon={NAV_ICONS.units}
        title={unit.nom}
        subtitle={`${unit.ville} · ${unit.cmdt}`}
        badge={m.resp.unit_dispo[unit.dispo]}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={m.resp.u_effectif} value={unit.eff} icon={KPI_ICONS.personnel} tint="blue" />
        <StatTile label={m.resp.u_readiness} value={`${unit.readiness} %`} icon={KPI_ICONS.units} tint={unit.readiness >= 85 ? "green" : unit.readiness >= 70 ? "or" : "danger"} />
        <StatTile label={m.resp.u_posture} value={m.resp.unit_dispo[unit.dispo]} icon={UI_ICONS.shield} tint="rdia" />
        <StatTile label={m.resp.u_missions} value={myIncidents.length} icon={KPI_ICONS.incidents} tint={myIncidents.length > 0 ? "danger" : "gray"} />
      </div>

      <Section title={m.resp.u_readiness}>
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="font-medium text-gray-700 dark:text-rdia-100">{m.resp.u_readiness}</span>
          <span className="font-mono text-[10px] text-gray-400 dark:text-rdia-400">{unit.readiness} %</span>
        </div>
        {/* Préparation : plus le taux est HAUT, mieux c'est — barre inversée. */}
        <ProgressBar value={unit.readiness} fill={loadBarClass(100 - unit.readiness)} height="h-2.5" />
      </Section>

      <Section title={m.resp.u_engaged} count={myIncidents.length}>
        {myIncidents.length === 0 && <Empty label={m.resp.no_incident} />}
        {myIncidents.map((i) => (
          <div key={i.id} className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2 dark:bg-rdia-800/50">
            <Icon path={KPI_ICONS.incidents} size={14} />
            <span className="font-mono text-[10px] text-gray-400 dark:text-rdia-400">{i.id}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-gray-700 dark:text-rdia-100">{i.titre}</span>
            <span className="font-mono text-[10px] text-gray-400 dark:text-rdia-400">{i.time}</span>
          </div>
        ))}
      </Section>

      {!supervised && (
        <div className="flex justify-end">
          <Link href="/ma-responsabilite/gestion" className="cible-tactile btn-primaire flex items-center gap-1.5 text-sm">
            <Icon path={UI_ICONS.edit} size={14} />
            {m.resp.manage}
          </Link>
        </div>
      )}
    </section>
  );
}

export function UnitManagement({ uid }: { uid: string }) {
  const m = useModules();
  const unit = useMyUnit(uid);
  const showToast = useArgos((s) => s.showToast);
  const loadDomain = useArgos((s) => s.loadDomain);
  const [form, setForm] = useState(() => ({
    cmdt: unit?.cmdt ?? "", eff: unit?.eff ?? 0,
    dispo: (unit?.dispo ?? "ready") as Unit["dispo"], readiness: unit?.readiness ?? 0,
  }));
  const [busy, setBusy] = useState(false);
  if (!unit) return <Loading />;

  const save = async () => {
    setBusy(true);
    try {
      const res = await api.updateUnit(uid, form);
      if (res.error) { showToast(m.resp.err_denied); return; }
      showToast(m.resp.saved);
      void loadDomain();
    } finally {
      setBusy(false);
    }
  };

  const labelCls = "mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200";

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      <RespHeader back icon={NAV_ICONS.units} title={m.resp.manage_unit} subtitle={`${unit.nom} — ${unit.ville}`} />

      <div className="carte flex flex-col gap-4 p-5">
        <h3 className="text-sm font-bold text-rdia-600 dark:text-rdia-50">{m.resp.u_posture_block}</h3>
        {/* Champs à 16 px sur mobile (pas de zoom iOS au focus) et ≥ 44 px de haut. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className={labelCls}>{m.resp.u_cmdt}</label>
            <input className="input-champ text-base md:text-sm" value={form.cmdt} onChange={(e) => setForm((f) => ({ ...f, cmdt: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>{m.resp.u_effectif}</label>
            <input className="input-champ font-mono text-base md:text-sm" type="number" min={0} value={form.eff} onChange={(e) => setForm((f) => ({ ...f, eff: Math.max(0, parseInt(e.target.value, 10) || 0) }))} />
          </div>
          <div>
            <label className={labelCls}>{m.resp.u_posture}</label>
            <select className="input-champ text-base md:text-sm" value={form.dispo} onChange={(e) => setForm((f) => ({ ...f, dispo: e.target.value as Unit["dispo"] }))}>
              {(["ready", "deployed", "standby"] as const).map((d) => (
                <option key={d} value={d}>{m.resp.unit_dispo[d]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{m.resp.u_readiness} (%)</label>
            <input className="input-champ font-mono text-base md:text-sm" type="number" min={0} max={100} value={form.readiness} onChange={(e) => setForm((f) => ({ ...f, readiness: Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)) }))} />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Pill tone={DISPO_TONES[form.dispo]} label={m.resp.unit_dispo[form.dispo]} />
          <button className="cible-tactile btn-primaire text-sm disabled:opacity-60" disabled={busy} onClick={() => void save()}>
            {busy ? m.resp.saving : m.resp.save}
          </button>
        </div>
      </div>
    </section>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 py-4 text-center text-[11px] text-gray-400 dark:border-rdia-700 dark:text-rdia-400">
      {label}
    </div>
  );
}
