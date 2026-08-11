"use client";

// ============================================================================
// « Ma responsabilité » — tableau de bord du responsable
//
// Vue globale de l'ENTITÉ dont le compte connecté a la charge. L'entité est
// résolue depuis la portée ABAC servie par l'API à la connexion.
// Route jumelle : /ma-responsabilite/gestion (édition).
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useArgos, useModules } from "@/lib/store";
import { api } from "@/lib/api";
import { StatTile } from "@/components/ui/StatTile";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Pill, type Tone } from "@/components/ui/Pill";
import { Icon } from "@/components/ui/Icon";
import { KPI_ICONS, NAV_ICONS, UI_ICONS } from "@/lib/icons";
import { loadBarClass, useMyHospital, useResponsibility } from "@/lib/responsibility";
import { NoResponsibility, PendingModule, type Ward, WARD_TONES } from "@/components/responsibility/Shared";
import { UnitDashboard } from "@/components/responsibility/UnitViews";
import { ShelterDashboard } from "@/components/responsibility/ShelterViews";
import { MorgueDashboard } from "@/components/responsibility/MorgueViews";
import { EquipmentPark } from "@/components/responsibility/EquipmentViews";

export default function MaResponsabilitePage() {
  const { kind, entityId } = useResponsibility();

  if (!kind) return <NoResponsibility />;
  if (!entityId) return <NoResponsibility unassigned />;
  if (kind === "unit") return <UnitDashboard uid={entityId} />;
  if (kind === "shelter") return <ShelterDashboard sid={entityId} />;
  if (kind === "morgue") return <MorgueDashboard mid={entityId} />;
  // Parc d'équipement : pas de tableau de bord distinct (non demandé).
  if (kind === "equipment") return <EquipmentPark unitId={entityId} />;
  if (kind !== "hospital") return <PendingModule kind={kind} entityId={entityId} />;
  return <HospitalDashboard hid={entityId} />;
}

/** Tableau de bord de l'hôpital militaire dont la session a la charge. */
function HospitalDashboard({ hid }: { hid: string }) {
  const m = useModules();
  const hosp = useMyHospital();
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
          <Link href="/ma-responsabilite/gestion" className="btn-secondaire text-xs">{m.resp.manage}</Link>
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
  return (
    <div className="carte flex flex-wrap items-center gap-3 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-or-500/15 text-or-500">
        <Icon path={NAV_ICONS.hospitals} size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-bold text-rdia-600 dark:text-rdia-50">{hosp.nom}</h2>
        <p className="truncate text-xs text-gray-500 dark:text-rdia-300">
          {hosp.ville}{hosp.type ? ` · ${hosp.type}` : ""}
        </p>
      </div>
      <span className="rounded-md bg-or-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-or-500">
        {m.resp.my_responsibility}
      </span>
      <Link href="/ma-responsabilite/gestion" className="btn-primaire flex items-center gap-1.5 text-sm">
        <Icon path={UI_ICONS.edit} size={14} />
        {m.resp.manage}
      </Link>
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

export type { Tone };
