"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useArgos, useDict } from "@/lib/store";
import { Badge, type BadgeType } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { sevBadge, stBadge, typeLabel } from "@/lib/helpers";
import type { LayerState } from "@/lib/store";

const MapCanvas = dynamic(() => import("@/components/map/MapCanvas").then((m) => m.MapCanvas), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-xs text-rdia-200">Chargement de la carte…</div>
  ),
});

interface SelLine {
  k: string;
  v: string;
}
interface SelInfo {
  titre: string;
  sub: string;
  badgeType: BadgeType;
  badgeLabel: string;
  lines: SelLine[];
  action?: () => void;
}

export default function MapPage() {
  const t = useDict();
  const router = useRouter();
  const units = useArgos((s) => s.units);
  const vehRoutes = useArgos((s) => s.vehRoutes);
  const incidentTypes = useArgos((s) => s.incidentTypes);
  const lang = useArgos((s) => s.lang);
  const hospitals = useArgos((s) => s.hospitals);
  const layers = useArgos((s) => s.layers);
  const toggleLayer = useArgos((s) => s.toggleLayer);
  const selMarker = useArgos((s) => s.selMarker);
  const clearSelection = useArgos((s) => s.clearSelection);
  const map3d = useArgos((s) => s.map3d);
  const mapSat = useArgos((s) => s.mapSat);
  const setMap3d = useArgos((s) => s.setMap3d);
  const setMapSat = useArgos((s) => s.setMapSat);
  const setSelUnit = useArgos((s) => s.setSelUnit);
  const setSelHosp = useArgos((s) => s.setSelHosp);
  const incidents = useArgos((s) => s.incidents);
  const fieldHosps = useArgos((s) => s.fieldHosps);

  const layerDefs: [keyof LayerState, string][] = [
    ["units", t.lg_units],
    ["hospitals", t.lg_hosp],
    ["incidents", t.nav_inc],
    ["vehicles", t.lg_veh],
    ["field", t.field],
  ];

  // ---- données du panneau de sélection ----
  let selInfo: SelInfo | null = null;
  if (selMarker) {
    const { kind, id } = selMarker;
    if (kind === "unit") {
      const u = units.find((x) => x.id === id);
      if (u) {
        const b: Record<string, { type: BadgeType; label: string }> = {
          ready: { type: "active", label: t.u_ready },
          deployed: { type: "medium", label: t.u_deployed },
          standby: { type: "on_hold", label: t.u_standby },
        };
        selInfo = {
          titre: u.nom, sub: u.ville, badgeType: b[u.dispo].type, badgeLabel: b[u.dispo].label,
          lines: [{ k: t.commander, v: u.cmdt }, { k: t.effectif, v: String(u.eff) }, { k: t.readiness, v: `${u.readiness} %` }],
          action: () => { setSelUnit(u.id); clearSelection(); router.push("/equipes"); },
        };
      }
    } else if (kind === "hosp") {
      const h = hospitals.find((x) => x.id === id);
      if (h) {
        selInfo = {
          titre: h.nom, sub: h.ville, badgeType: "active", badgeLabel: t.op_ok,
          lines: [{ k: t.beds_free, v: `${h.lits - h.occ} / ${h.lits}` }, { k: t.icu, v: `${h.rea - h.reaOcc} / ${h.rea}` }, { k: t.med_staff, v: String(h.staff) }],
          action: () => { setSelHosp(h.id); clearSelection(); router.push("/hospinet"); },
        };
      }
    } else if (kind === "inc") {
      const i = incidents.find((x) => x.id === id);
      if (i) {
        const sb = sevBadge(i.sev, t);
        selInfo = {
          titre: i.titre, sub: i.region, badgeType: sb.type, badgeLabel: sb.label,
          lines: [{ k: t.col_id, v: i.id }, { k: t.h_typev, v: typeLabel(i.type, incidentTypes, lang) }, { k: t.col_status, v: stBadge(i.st, t).label }, { k: t.col_time, v: i.time }],
        };
      }
    } else if (kind === "veh") {
      const v = vehRoutes.find((x) => x.id === id);
      if (v) {
        selInfo = { titre: v.label, sub: v.kind, badgeType: "active", badgeLabel: t.u_deployed, lines: [{ k: t.col_status, v: "En mouvement" }] };
      }
    } else if (kind === "field") {
      const f = fieldHosps.find((x) => x.nom === id);
      if (f) {
        selInfo = {
          titre: f.nom, sub: t.field, badgeType: f.statut === "op" ? "active" : "on_hold", badgeLabel: f.statut === "op" ? t.op_ok : t.op_partial,
          lines: [{ k: t.capacity, v: `${f.cap} ${t.beds.toLowerCase()}` }, { k: t.occupancy, v: `${Math.round((f.occ / f.cap) * 100)} %` }, { k: t.since, v: f.depuis }],
        };
      }
    }
  }

  const seg = (on: boolean) => `px-3 py-1.5 text-[11px] font-bold transition-colors ${on ? "bg-or-500 text-rdia-600" : "text-rdia-100 hover:text-or-300"}`;

  return (
    <section className="grid gap-4 animate-fade-in" style={{ height: "100%", minHeight: 560, gridTemplateColumns: "280px 1fr" }}>
      {/* Rail gauche */}
      <div className="flex min-w-0 flex-col gap-4">
        <div className="carte p-4">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{t.layers}</h3>
          {layerDefs.map(([k, label]) => {
            const on = layers[k];
            return (
              <button key={k} onClick={() => toggleLayer(k)} className={`flex w-full items-center justify-between gap-2 py-1.5 text-xs transition-colors ${on ? "text-gray-700 dark:text-rdia-100" : "text-gray-400 dark:text-rdia-400"}`}>
                <span className="truncate">{label}</span>
                <span className={`relative h-4 w-8 shrink-0 rounded-full transition-colors ${on ? "bg-or-500" : "bg-gray-300 dark:bg-rdia-600"}`}>
                  <span className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all" style={{ left: on ? 18 : 2 }} />
                </span>
              </button>
            );
          })}
        </div>

        <div className="carte p-4">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{t.legend}</h3>
          <div className="flex flex-col gap-2 text-xs text-gray-600 dark:text-rdia-200">
            <div className="flex items-center gap-2"><svg width={14} height={14} viewBox="-7 -7 14 14"><rect x={-4} y={-4} width={8} height={8} fill="#C9A84C" /></svg><span>{t.lg_units}</span></div>
            <div className="flex items-center gap-2"><svg width={14} height={14} viewBox="-7 -7 14 14"><circle r={5} fill="#fff" stroke="#9CA3AF" strokeWidth={0.5} /><path d="M-2.5,0 H2.5 M0,-2.5 V2.5" stroke="#EF4444" strokeWidth={1.6} /></svg><span>{t.lg_hosp}</span></div>
            <div className="flex items-center gap-2"><svg width={14} height={14} viewBox="-7 -7 14 14"><circle r={5} fill="none" stroke="#10B981" strokeWidth={1.4} strokeDasharray="2 2" /><path d="M-2,0 H2 M0,-2 V2" stroke="#10B981" strokeWidth={1.4} /></svg><span>{t.field}</span></div>
            <div className="flex items-center gap-2"><svg width={14} height={14} viewBox="-7 -7 14 14"><path d="M0,-6 L6,5 L-6,5 Z" fill="#EF4444" /></svg><span>{t.nav_inc}</span></div>
            <div className="flex items-center gap-2"><svg width={14} height={14} viewBox="-7 -7 14 14"><path d="M0,-5 L5,0 L0,5 L-5,0 Z" fill="#3B82F6" /></svg><span>{t.lg_veh}</span></div>
          </div>
        </div>

        <div className="carte min-w-0 flex-1 p-4">
          {selInfo ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-bold leading-snug text-rdia-600 dark:text-rdia-50">{selInfo.titre}</div>
                  <div className="mt-0.5 text-xs text-gray-500 dark:text-rdia-300">{selInfo.sub}</div>
                </div>
                <button className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-or-500 dark:hover:bg-rdia-600" onClick={clearSelection}>
                  <Icon path={UI_ICONS.close} size={14} strokeWidth={2} />
                </button>
              </div>
              <div><Badge type={selInfo.badgeType} label={selInfo.badgeLabel} /></div>
              <div className="flex flex-col gap-1.5">
                {selInfo.lines.map((ln, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 border-b border-gray-100 py-1 text-xs dark:border-rdia-700/50">
                    <span className="text-gray-500 dark:text-rdia-300">{ln.k}</span>
                    <span className="text-end font-semibold text-gray-800 dark:text-rdia-50">{ln.v}</span>
                  </div>
                ))}
              </div>
              {selInfo.action && (
                <button className="btn-secondaire w-full text-xs" onClick={selInfo.action}>{t.view}</button>
              )}
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-gray-400 dark:text-rdia-400">{t.sel_none}</div>
          )}
        </div>
      </div>

      {/* Carte */}
      <div className="carte relative min-w-0 overflow-hidden" style={{ background: "#10202f", padding: 0, height: "100%", minHeight: 560 }}>
        <MapCanvas />
        <div className="absolute z-10 flex gap-2" style={{ top: 12, right: 12 }}>
          <div className="flex overflow-hidden rounded-lg shadow-md" style={{ background: "rgba(15,31,20,0.85)", backdropFilter: "blur(4px)" }}>
            <button className={seg(!map3d)} onClick={() => setMap3d(false)}>2D</button>
            <button className={seg(map3d)} onClick={() => setMap3d(true)}>3D</button>
          </div>
          <div className="flex overflow-hidden rounded-lg shadow-md" style={{ background: "rgba(15,31,20,0.85)", backdropFilter: "blur(4px)" }}>
            <button className={seg(mapSat)} onClick={() => setMapSat(true)}>{t.base_sat}</button>
            <button className={seg(!mapSat)} onClick={() => setMapSat(false)}>{t.base_plan}</button>
          </div>
        </div>
      </div>
    </section>
  );
}
