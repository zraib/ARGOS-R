"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useArgos, useDict } from "@/lib/store";
import { Badge, type BadgeType } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { sevBadge, stBadge, typeLabel } from "@/lib/helpers";
import { FLUX } from "@/lib/i18n/flux";
import type { LayerState } from "@/lib/store";

const MapCanvas = dynamic(() => import("@/components/map/MapCanvas").then((m) => m.MapCanvas), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-xs text-rdia-200">Chargement de la carte…</div>
  ),
});

import { OVERLAY_STYLE, SWITCH_OFF } from "@/lib/map/overlay";
import type { MarkerKind } from "@/lib/types";

// Surcouches neutres (ardoise sombre) : le vert du thème se confondait avec
// l'imagerie satellite et rendait les panneaux illisibles.
const GLASS = OVERLAY_STYLE;

interface SelLine { k: string; v: string }
interface SelInfo {
  titre: string; sub: string; badgeType: BadgeType; badgeLabel: string;
  lines: SelLine[]; action?: () => void;
}

/** Interrupteur on/off compact. */
function Switch({ on }: { on: boolean }) {
  return (
    // inline-block obligatoire : un <span> inline ignore h-4/w-8 (largeur nulle).
    <span className={`relative inline-block h-5 w-10 shrink-0 rounded-full transition-colors ${on ? "bg-or-500" : SWITCH_OFF}`}>
      <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all" style={{ left: on ? 22 : 2 }} />
    </span>
  );
}

/** Panneau flottant repliable posé sur la carte. */
function Panel({
  title, children, defaultOpen = true, width, right,
}: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; width?: number; right?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="pointer-events-auto overflow-hidden rounded-xl shadow-lg" style={{ ...GLASS, width }}>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-2 text-[13px] font-bold uppercase tracking-wider text-white/80 transition-colors hover:text-or-400"
        >
          <span className="truncate">{title}</span>
          <Icon path={UI_ICONS.caretDown} size={12} strokeWidth={2.5} className={`shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>
        {right}
      </div>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

/** Élément réel de la carte, listé sous sa couche. */
interface TreeLeaf { id: string; label: string; kind: MarkerKind }
/** Couche cartographique : interrupteur + éléments qu'elle contient. */
interface TreeLayer { key: keyof LayerState; label: string; leaves: TreeLeaf[] }
interface TreeFamily { label: string; layers: TreeLayer[] }

/** Ligne d'un élément : cliquer sélectionne le marqueur et recentre la carte. */
function LeafRow({ leaf, sel, select }: { leaf: TreeLeaf; sel: boolean; select: (k: MarkerKind, id: string) => void }) {
  return (
    <button
      onClick={() => select(leaf.kind, leaf.id)}
      className={`flex w-full items-center gap-1.5 truncate rounded px-1 py-0.5 text-start text-[13px] transition-colors ${
        sel ? "bg-or-500/20 text-or-300" : "text-white/70 hover:bg-white/10 hover:text-white"
      }`}
    >
      <span className={`h-1 w-1 shrink-0 rounded-full ${sel ? "bg-or-400" : "bg-white/40"}`} />
      <span className="truncate">{leaf.label}</span>
    </button>
  );
}

/** Nœud « couche » : interrupteur d'affichage + liste repliable des éléments. */
function LayerNode({
  layer, on, toggle, selMarker, select,
}: {
  layer: TreeLayer; on: boolean; toggle: () => void;
  selMarker: { kind: MarkerKind; id: string } | null; select: (k: MarkerKind, id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const has = layer.leaves.length > 0;
  return (
    <div>
      <div className="flex items-center gap-1 py-0.5">
        <button
          onClick={() => setOpen((o) => !o)}
          disabled={!has}
          className="text-white/50 transition-colors hover:text-or-400 disabled:opacity-0"
          aria-label={layer.label}
        >
          <Icon path={UI_ICONS.caretDown} size={10} strokeWidth={2.5} className={`transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>
        <button onClick={toggle} className={`min-w-0 flex-1 truncate text-start text-[14px] transition-colors ${on ? "text-white/90" : "text-white/45"}`}>
          {layer.label}
          {has && <span className="ms-1 text-white/40">({layer.leaves.length})</span>}
        </button>
        <button onClick={toggle} aria-label={layer.label}><Switch on={on} /></button>
      </div>
      {open && has && (
        <div className="ms-2 flex max-h-40 flex-col overflow-y-auto overflow-x-hidden border-s border-white/15 ps-1.5">
          {layer.leaves.map((l) => (
            <LeafRow key={`${l.kind}-${l.id}`} leaf={l} select={select} sel={selMarker?.kind === l.kind && selMarker.id === l.id} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Nœud « famille » de l'arbre des couches : repliable + interrupteur global. */
function FamilyNode({
  family, layers, toggleLayer, selMarker, select,
}: {
  family: TreeFamily; layers: LayerState; toggleLayer: (k: keyof LayerState) => void;
  selMarker: { kind: MarkerKind; id: string } | null; select: (k: MarkerKind, id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const anyOn = family.layers.some((l) => layers[l.key]);
  const setAll = (v: boolean) => family.layers.forEach((l) => { if (layers[l.key] !== v) toggleLayer(l.key); });
  return (
    <div>
      <div className="flex items-center gap-1.5 py-1">
        <button onClick={() => setOpen((o) => !o)} className="text-white/60 transition-colors hover:text-or-400" aria-label={family.label}>
          <Icon path={UI_ICONS.caretDown} size={11} strokeWidth={2.5} className={`transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>
        <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-white/90">{family.label}</span>
        <button onClick={() => setAll(!anyOn)} aria-label={family.label}><Switch on={anyOn} /></button>
      </div>
      {open && (
        <div className="ms-2 flex flex-col border-s border-white/15 ps-1.5">
          {family.layers.map((l) => (
            <LayerNode
              key={l.key}
              layer={l}
              on={layers[l.key]}
              toggle={() => toggleLayer(l.key)}
              selMarker={selMarker}
              select={select}
            />
          ))}
        </div>
      )}
    </div>
  );
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
  const quakes = useArgos((s) => s.quakes);
  const quakesOn = useArgos((s) => s.quakesOn);
  const setQuakesOn = useArgos((s) => s.setQuakesOn);
  const wxLayers = useArgos((s) => s.wxLayers);
  const toggleWxLayer = useArgos((s) => s.toggleWxLayer);
  const fx = FLUX[lang];
  const setSelUnit = useArgos((s) => s.setSelUnit);
  const setSelHosp = useArgos((s) => s.setSelHosp);
  const incidents = useArgos((s) => s.incidents);
  const fieldHosps = useArgos((s) => s.fieldHosps);
  const select = useArgos((s) => s.select);
  const [full, setFull] = useState(false);

  // Échap quitte le plein écran.
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  // Arbre : famille → couche (interrupteur) → éléments réellement créés.
  const families: TreeFamily[] = [
    {
      label: t.fam_forces,
      layers: [
        { key: "units", label: t.lg_units, leaves: units.map((u) => ({ id: u.id, label: u.nom, kind: "unit" })) },
        { key: "vehicles", label: t.lg_veh, leaves: vehRoutes.map((v) => ({ id: v.id, label: `${v.label} · ${v.kind}`, kind: "veh" })) },
      ],
    },
    {
      label: t.fam_health,
      layers: [
        { key: "hospitals", label: t.lg_hosp, leaves: hospitals.map((h) => ({ id: h.id, label: h.nom, kind: "hosp" })) },
        { key: "field", label: t.field, leaves: fieldHosps.map((f) => ({ id: f.nom, label: f.nom, kind: "field" })) },
      ],
    },
    {
      label: t.nav_inc,
      layers: [
        {
          key: "incidents",
          label: t.nav_inc,
          leaves: incidents.filter((i) => !i.archived).map((i) => ({ id: i.id, label: `${i.id} · ${i.titre}`, kind: "inc" })),
        },
      ],
    },
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
      if (v) selInfo = { titre: v.label, sub: v.kind, badgeType: "active", badgeLabel: t.u_deployed, lines: [{ k: t.col_status, v: "—" }] };
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

  const seg = (on: boolean) => `px-4 py-2.5 text-[14px] font-bold transition-colors ${on ? "bg-or-500 text-rdia-600" : "text-white/90 hover:text-or-400"}`;
  const legend: [ReactNode, string][] = [
    [<rect key="u" x={-4} y={-4} width={8} height={8} fill="#C9A84C" />, t.lg_units],
    [<g key="h"><circle r={5} fill="#fff" stroke="#9CA3AF" strokeWidth={0.5} /><path d="M-2.5,0 H2.5 M0,-2.5 V2.5" stroke="#EF4444" strokeWidth={1.6} /></g>, t.lg_hosp],
    [<g key="f"><circle r={5} fill="none" stroke="#10B981" strokeWidth={1.4} strokeDasharray="2 2" /><path d="M-2,0 H2 M0,-2 V2" stroke="#10B981" strokeWidth={1.4} /></g>, t.field],
    [<path key="i" d="M0,-6 L6,5 L-6,5 Z" fill="#EF4444" />, t.nav_inc],
    [<path key="v" d="M0,-5 L5,0 L0,5 L-5,0 Z" fill="#3B82F6" />, t.lg_veh],
  ];

  return (
    <section
      className={full ? "fixed inset-0 z-[9999] bg-rdia-900" : "relative -m-6 h-[calc(100%+3rem)] animate-fade-in"}
      style={{ background: "#10202f" }}
    >
      <MapCanvas />

      {/* Surcouches : tout est posé sur la carte, chaque panneau est repliable */}
      <div className="pointer-events-none absolute inset-0 z-20">
        {/* Colonne gauche : couches (arbre) + légende */}
        <div className="absolute flex w-[300px] flex-col gap-2" style={{ top: 12, insetInlineStart: 12 }}>
          <Panel title={t.layers} width={300}>
            <div className="flex max-h-[52vh] flex-col overflow-y-auto overflow-x-hidden">
              {families.map((f) => (
                <FamilyNode
                  key={f.label}
                  family={f}
                  layers={layers}
                  toggleLayer={toggleLayer}
                  selMarker={selMarker}
                  select={select}
                />
              ))}
              {/* Couche sismique (EMSC) — indépendante de LayerState (flux externe) */}
              <div className="mt-1 flex items-center gap-1.5 border-t border-white/10 py-0.5 pt-1.5">
                <span className="w-[10px]" />
                <button onClick={() => setQuakesOn(!quakesOn)} className={`min-w-0 flex-1 truncate text-start text-[14px] transition-colors ${quakesOn ? "text-white/90" : "text-white/45"}`}>
                  {t.nav_seismic}
                  <span className="ms-1 text-white/40">({quakes.length})</span>
                </button>
                <button onClick={() => setQuakesOn(!quakesOn)} aria-label={t.nav_seismic}><Switch on={quakesOn} /></button>
              </div>

              {/* Couches météo (grille de conditions actuelles) — superposables */}
              <div className="mt-1 border-t border-white/10 pt-1.5">
                <div className="py-0.5 text-[14px] font-bold text-white/90">{t.nav_weather}</div>
                {([["temp", fx.wx_temp], ["wind", fx.wx_wind], ["precip", fx.wx_precip]] as const).map(([k, label]) => (
                  <div key={k} className="flex items-center gap-1.5 py-0.5 ps-3">
                    <button onClick={() => toggleWxLayer(k)} className={`min-w-0 flex-1 truncate text-start text-[14px] transition-colors ${wxLayers[k] ? "text-white/90" : "text-white/45"}`}>
                      {label}
                    </button>
                    <button onClick={() => toggleWxLayer(k)} aria-label={label}><Switch on={wxLayers[k]} /></button>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
          <Panel title={t.legend} width={300} defaultOpen={false}>
            <div className="flex flex-col gap-2 text-[14px] text-white/80">
              {legend.map(([shape, label]) => (
                <div key={label} className="flex items-center gap-2">
                  <svg width={14} height={14} viewBox="-7 -7 14 14">{shape}</svg>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* Colonne droite : contrôles + sélection */}
        <div className="absolute flex w-[300px] flex-col items-end gap-2" style={{ top: 12, insetInlineEnd: 12 }}>
          <div className="pointer-events-auto flex flex-wrap justify-end gap-2">
            <div className="flex overflow-hidden rounded-lg shadow-md" style={GLASS}>
              <button className={seg(!map3d)} onClick={() => setMap3d(false)}>2D</button>
              <button className={seg(map3d)} onClick={() => setMap3d(true)}>3D</button>
            </div>
            <div className="flex overflow-hidden rounded-lg shadow-md" style={GLASS}>
              <button className={seg(mapSat)} onClick={() => setMapSat(true)}>{t.base_sat}</button>
              <button className={seg(!mapSat)} onClick={() => setMapSat(false)}>{t.base_plan}</button>
            </div>
            <button
              onClick={() => setFull((f) => !f)}
              title={full ? t.wz_exit_full : t.wz_fullscreen}
              aria-label={full ? t.wz_exit_full : t.wz_fullscreen}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-lg text-white/90 shadow-md transition-colors hover:text-or-400"
              style={GLASS}
            >
              <Icon path={full ? UI_ICONS.close : UI_ICONS.expand} size={15} strokeWidth={2} />
            </button>
          </div>

          {selInfo && (
            <Panel
              title={selInfo.titre}
              width={240}
              right={
                <button className="me-2 rounded-lg p-1 text-white/60 transition-colors hover:text-or-400" onClick={clearSelection} aria-label={t.cancel}>
                  <Icon path={UI_ICONS.close} size={13} strokeWidth={2} />
                </button>
              }
            >
              <div className="flex flex-col gap-2">
                <div className="text-[14px] text-white/60">{selInfo.sub}</div>
                <div><Badge type={selInfo.badgeType} label={selInfo.badgeLabel} /></div>
                <div className="flex flex-col gap-1">
                  {selInfo.lines.map((ln, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 border-b border-white/12 py-1 text-[14px]">
                      <span className="text-white/60">{ln.k}</span>
                      <span className="text-end font-semibold text-white">{ln.v}</span>
                    </div>
                  ))}
                </div>
                {selInfo.action && <button className="btn-secondaire w-full text-[14px]" onClick={selInfo.action}>{t.view}</button>}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </section>
  );
}
