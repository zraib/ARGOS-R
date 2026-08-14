"use client";

// Vues « Ma responsabilité » pour l'ABRI : tableau de bord + gestion.
// Écriture via PATCH /shelters/:id, route cantonnée (@RequireScope("shelter")).

import { useCallback, useEffect, useState } from "react";
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

/** Abri tel que servi par l'API (GET /shelters). */
export interface Shelter {
  id: string;
  nom: string;
  ville: string;
  capacity: number;
  occupants: number;
  staff: number;
  supplies: "ok" | "low" | "critical";
  needs: string;
  adults: number;
  children: number;
  elderly: number;
}

export const SUPPLY_LEVELS = ["ok", "low", "critical"] as const;

const SUPPLY_TONES: Record<Shelter["supplies"], Tone> = { ok: "green", low: "amber", critical: "red" };

/** Charge l'abri affecté depuis l'API (les abris ne sont pas dans le store). */
function useShelter(sid: string): { shelter: Shelter | null; reload: () => void } {
  const [shelter, setShelter] = useState<Shelter | null>(null);
  const load = useCallback(async () => {
    const res = await api.getShelters();
    const list = (res.data ?? []) as unknown as Shelter[];
    setShelter(list.find((s) => s.id === sid) ?? null);
  }, [sid]);
  useEffect(() => {
    void load();
  }, [load]);
  return { shelter, reload: () => void load() };
}

export function ShelterDashboard({ sid }: { sid: string }) {
  const m = useModules();
  const supervised = useSupervision();
  const { shelter } = useShelter(sid);
  if (!shelter) return <Loading />;

  const pct = shelter.capacity > 0 ? Math.round((shelter.occupants / shelter.capacity) * 100) : 0;
  const demo: [string, number][] = [
    [m.resp.s_adults, shelter.adults],
    [m.resp.s_children, shelter.children],
    [m.resp.s_elderly, shelter.elderly],
  ];
  const total = demo.reduce((a, [, n]) => a + n, 0);

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      <RespHeader
        icon={NAV_ICONS.shelters}
        title={shelter.nom}
        subtitle={shelter.ville}
        badge={m.resp.supply[shelter.supplies]}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={m.resp.s_places_free} value={shelter.capacity - shelter.occupants} sub={`/ ${shelter.capacity}`} icon={KPI_ICONS.beds} tint={pct >= 90 ? "danger" : "green"} />
        <StatTile label={m.resp.s_occupants} value={shelter.occupants} icon={KPI_ICONS.personnel} tint="blue" />
        <StatTile label={m.resp.s_staff} value={shelter.staff} icon={KPI_ICONS.units} tint="rdia" />
        <StatTile label={m.resp.s_supplies} value={m.resp.supply[shelter.supplies]} icon={UI_ICONS.shield} tint={shelter.supplies === "critical" ? "danger" : shelter.supplies === "low" ? "amber" : "green"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title={m.resp.s_occupancy}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium text-gray-700 dark:text-rdia-100">{m.resp.s_occupants}</span>
            <span className="font-mono text-[10px] text-gray-400 dark:text-rdia-400">{shelter.occupants} / {shelter.capacity} · {pct} %</span>
          </div>
          <ProgressBar value={pct} fill={loadBarClass(pct)} height="h-2.5" />
        </Section>

        <Section title={m.resp.s_demography}>
          {demo.map(([label, n]) => {
            const share = total > 0 ? Math.round((n / total) * 100) : 0;
            return (
              <div key={label}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-700 dark:text-rdia-100">{label}</span>
                  <span className="font-mono text-[10px] text-gray-400 dark:text-rdia-400">{n} · {share} %</span>
                </div>
                <ProgressBar value={share} fill="bg-or-500" height="h-2" />
              </div>
            );
          })}
        </Section>
      </div>

      <Section title={m.resp.s_needs}>
        <div className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2.5 dark:bg-rdia-800/50">
          <Pill tone={SUPPLY_TONES[shelter.supplies]} label={m.resp.supply[shelter.supplies]} />
          <span className="min-w-0 flex-1 text-xs text-gray-700 dark:text-rdia-100">{shelter.needs || "—"}</span>
        </div>
      </Section>

      {!supervised && (
        <div className="flex justify-end">
          <Link href="/ma-responsabilite/gestion" className="btn-primaire flex items-center gap-1.5 text-sm">
            <Icon path={UI_ICONS.edit} size={14} />
            {m.resp.manage}
          </Link>
        </div>
      )}
    </section>
  );
}

export function ShelterManagement({ sid }: { sid: string }) {
  const m = useModules();
  const { shelter, reload } = useShelter(sid);
  const showToast = useArgos((s) => s.showToast);
  const [form, setForm] = useState<Partial<Shelter> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!shelter) return <Loading />;
  const f = form ?? shelter;
  const set = (patch: Partial<Shelter>) => { setError(null); setForm({ ...f, ...patch }); };
  const num = (v: string) => Math.max(0, parseInt(v, 10) || 0);

  const save = async () => {
    const capacity = f.capacity ?? 0;
    const occupants = f.occupants ?? 0;
    if (occupants > capacity) { setError(m.resp.err_occupants); return; }
    setBusy(true);
    try {
      const res = await api.updateShelter(sid, {
        capacity, occupants, staff: f.staff ?? 0, supplies: f.supplies ?? "ok",
        needs: f.needs ?? "", adults: f.adults ?? 0, children: f.children ?? 0, elderly: f.elderly ?? 0,
      });
      if (res.error) { showToast(m.resp.err_denied); return; }
      showToast(m.resp.saved);
      setForm(null);
      reload();
    } finally {
      setBusy(false);
    }
  };

  const labelCls = "mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200";
  const numField = (key: keyof Shelter, label: string) => (
    <div key={key}>
      <label className={labelCls}>{label}</label>
      <input
        className="input-champ font-mono text-sm"
        type="number"
        min={0}
        value={(f[key] as number) ?? 0}
        onChange={(e) => set({ [key]: num(e.target.value) } as Partial<Shelter>)}
      />
    </div>
  );

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      <RespHeader back icon={NAV_ICONS.shelters} title={m.resp.manage_shelter} subtitle={`${shelter.nom} — ${shelter.ville}`} />

      <div className="carte flex flex-col gap-4 p-5">
        <h3 className="text-sm font-bold text-rdia-600 dark:text-rdia-50">{m.resp.s_capacity_block}</h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {numField("capacity", m.resp.s_capacity)}
          {numField("occupants", m.resp.s_occupants)}
          {numField("staff", m.resp.s_staff)}
        </div>

        <h3 className="mt-2 text-sm font-bold text-rdia-600 dark:text-rdia-50">{m.resp.s_demography}</h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {numField("adults", m.resp.s_adults)}
          {numField("children", m.resp.s_children)}
          {numField("elderly", m.resp.s_elderly)}
        </div>

        <h3 className="mt-2 text-sm font-bold text-rdia-600 dark:text-rdia-50">{m.resp.s_needs}</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelCls}>{m.resp.s_supplies}</label>
            <select className="input-champ text-sm" value={f.supplies ?? "ok"} onChange={(e) => set({ supplies: e.target.value as Shelter["supplies"] })}>
              {SUPPLY_LEVELS.map((lvl) => <option key={lvl} value={lvl}>{m.resp.supply[lvl]}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>{m.resp.s_needs_field}</label>
            <input className="input-champ text-sm" placeholder={m.resp.s_needs_ph} value={f.needs ?? ""} onChange={(e) => set({ needs: e.target.value })} />
          </div>
        </div>

        {error && <p className="text-xs font-semibold text-danger-500">{error}</p>}
        <div className="flex justify-end">
          <button className="btn-primaire text-sm disabled:opacity-60" disabled={busy} onClick={() => void save()}>
            {busy ? m.resp.saving : m.resp.save}
          </button>
        </div>
      </div>
    </section>
  );
}
