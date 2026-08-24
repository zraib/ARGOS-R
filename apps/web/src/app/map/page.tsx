"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useArgos, useDict } from "@/lib/store";
import { TILES_AVAILABLE, TILES_MODE } from "@/lib/map/tiles";
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

import { AircraftPanel } from "@/components/map/AircraftPanel";
import { OVERLAY_STYLE, SWITCH_OFF } from "@/lib/map/overlay";
import { HOSPITAL_KINDS, hospKind, kindDef } from "@/lib/hospitals";
import { HealthGlyph } from "@/components/health/HealthGlyph";
import type { MarkerKind } from "@/lib/types";

// Surcouches neutres (ardoise sombre) : le vert du thème se confondait avec
// l'imagerie satellite et rendait les panneaux illisibles.
const GLASS = OVERLAY_STYLE;

interface SelLine { k: string; v: string }
interface SelInfo {
  titre: string; sub: string; badgeType: BadgeType; badgeLabel: string;
  lines: SelLine[]; action?: () => void;
}

// ---------------------------------------------------------------------------
// Surcouches adaptatives
//
// À partir de `lg` les panneaux flottent sur la carte comme auparavant (colonne
// gauche : couches, suivi aérien, légende ; colonne droite : contrôles et
// détail de sélection).
//
// En dessous, la carte n'a plus la place de porter 300 px de panneaux : à
// 375 px ils la recouvraient entièrement et se chevauchaient. Les mêmes
// contenus — sans rien retirer — passent donc dans une **feuille ancrée en
// bas**, ouverte par un bouton flottant et organisée en onglets. Par défaut la
// feuille est fermée : la carte occupe tout l'espace. Les contrôles (2D/3D,
// fond, plein écran) restent en haut, hors de la feuille, en cibles de 44 px ;
// les commandes natives de MapLibre (zoom, boussole, recentrage) sont remontées
// en haut par `globals.css` pour la même raison.
// ---------------------------------------------------------------------------
type SheetTab = "layers" | "aircraft" | "legend" | "selection";

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
    // Sous lg la ligne monte à 44 px : au doigt, une ligne de 20 px est
    // impossible à viser sans toucher sa voisine.
    <button
      onClick={() => select(leaf.kind, leaf.id)}
      className={`flex min-h-11 w-full items-center gap-1.5 truncate rounded px-1 py-0.5 text-start text-[14px] transition-colors lg:min-h-0 lg:text-[13px] ${
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
          className="cible-tactile flex items-center justify-center text-white/50 transition-colors hover:text-or-400 disabled:opacity-0"
          aria-label={layer.label}
        >
          <Icon path={UI_ICONS.caretDown} size={10} strokeWidth={2.5} className={`transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>
        <button onClick={toggle} className={`min-w-0 flex-1 truncate text-start text-[14px] transition-colors ${on ? "text-white/90" : "text-white/45"}`}>
          {layer.label}
          {has && <span className="ms-1 text-white/40">({layer.leaves.length})</span>}
        </button>
        <button onClick={toggle} aria-label={layer.label} className="cible-tactile flex items-center justify-center"><Switch on={on} /></button>
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
        <button onClick={() => setOpen((o) => !o)} className="cible-tactile flex items-center justify-center text-white/60 transition-colors hover:text-or-400" aria-label={family.label}>
          <Icon path={UI_ICONS.caretDown} size={11} strokeWidth={2.5} className={`transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>
        <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-white/90">{family.label}</span>
        <button onClick={() => setAll(!anyOn)} aria-label={family.label} className="cible-tactile flex items-center justify-center"><Switch on={anyOn} /></button>
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
  const aircraft = useArgos((s) => s.aircraft);
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
  /** Onglet ouvert dans la feuille du bas (sous `lg`) ; `null` = feuille fermée. */
  const [sheet, setSheet] = useState<SheetTab | null>(null);
  /**
   * Panneau ouvert dans le trio de gauche (≥ lg) : couches, suivi aérien ou
   * légende — un seul à la fois, fermé par défaut. Les boutons répliquent le
   * style des contrôles natifs MapLibre (blanc, 44 px, rayon 12). Le bouton
   * « nrbc » ne rejoint la pile que lorsqu'un panache est actif.
   */
  const [openPanel, setOpenPanel] = useState<"layers" | "air" | "legend" | "nrbc" | null>(null);

  // --- panache NRBC (ADR 0005) ---
  const plumeIncidentId = useArgos((s) => s.plumeIncidentId);
  const plumeData = useArgos((s) => s.plumeData);
  const plumeModels = useArgos((s) => s.plumeModels);
  const plumeEnvelope = useArgos((s) => s.plumeEnvelope);
  const plumeHour = useArgos((s) => s.plumeHour);
  const plumeBusy = useArgos((s) => s.plumeBusy);
  const setPlumeModels = useArgos((s) => s.setPlumeModels);
  const setPlumeEnvelope = useArgos((s) => s.setPlumeEnvelope);
  const setPlumeHour = useArgos((s) => s.setPlumeHour);
  const hidePlume = useArgos((s) => s.hidePlume);
  const showPlume = useArgos((s) => s.showPlume);
  /** Incidents chimiques actifs : rendent le bouton NRBC découvrable depuis la carte. */
  const nrbcIncidents = useMemo(
    () => incidents.filter((i) => !i.archived && i.nrbc?.family === "C"),
    [incidents],
  );

  // L'opérateur arrive depuis « Voir le panache » : le panneau s'ouvre seul
  // (et se referme si la couche est éteinte pendant qu'il est affiché).
  useEffect(() => {
    setOpenPanel((o) => (plumeIncidentId ? "nrbc" : o === "nrbc" ? null : o));
  }, [plumeIncidentId]);

  // Échap quitte le plein écran.
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  // Toucher un marqueur doit montrer son détail : la feuille s'ouvre sur
  // l'onglet Sélection, et se referme dès que la sélection est levée (sinon
  // l'opérateur garde une feuille vide en travers de la carte).
  useEffect(() => {
    if (selMarker) setSheet("selection");
    else setSheet((s) => (s === "selection" ? null : s));
  }, [selMarker]);

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
        {
          key: "hospitals",
          label: t.lg_hosp_mil,
          leaves: hospitals.filter((h) => hospKind(h) === "mil").map((h) => ({ id: h.id, label: h.nom, kind: "hosp" })),
        },
        {
          key: "hospitalsCiv",
          label: t.lg_hosp_civ,
          leaves: hospitals
            .filter((h) => hospKind(h) !== "mil")
            .map((h) => ({ id: h.id, label: `${h.nom} · ${h.ville}`, kind: "hosp" })),
        },
        { key: "field", label: t.field, leaves: fieldHosps.map((f) => ({ id: f.nom, label: f.nom, kind: "field" })) },
      ],
    },
    {
      label: t.fam_air,
      layers: [
        {
          key: "aircraft",
          label: t.lg_aircraft,
          leaves: aircraft.map((a) => ({
            id: a.aircraft.id,
            label: `${a.aircraft.label} · ${a.aircraft.code}`,
            kind: "acft" as const,
          })),
        },
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
          titre: h.nom, sub: h.region ? `${h.ville} · ${h.region}` : h.ville, badgeType: "active", badgeLabel: t.op_ok,
          lines: [
            { k: t.lg_health_kind, v: h.type ?? kindDef(hospKind(h)).long },
            { k: t.beds_free, v: `${h.lits - h.occ} / ${h.lits}` },
            { k: t.icu, v: `${h.rea - h.reaOcc} / ${h.rea}` },
            { k: t.med_staff, v: String(h.staff) },
          ],
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

  // Cibles de 44 px sous lg (§ tactile) ; densité d'origine à partir de lg.
  const seg = (on: boolean) => `min-h-11 px-4 py-2.5 text-[14px] font-bold transition-colors lg:min-h-0 ${on ? "bg-or-500 text-rdia-600" : "text-white/90 hover:text-or-400"}`;
  const legend: [ReactNode, string][] = [
    [<rect key="u" x={-4} y={-4} width={8} height={8} fill="#C9A84C" />, t.lg_units],
    [<path key="i" d="M0,-6 L6,5 L-6,5 Z" fill="#EF4444" />, t.nav_inc],
    [<path key="v" d="M0,-5 L5,0 L0,5 L-5,0 Z" fill="#3B82F6" />, t.lg_veh],
  ];

  // ---- corps des panneaux ----
  // Rendus une seule fois puis placés soit dans les panneaux flottants (≥ lg),
  // soit dans la feuille du bas (< lg) : aucune fonctionnalité n'est dupliquée
  // ni perdue d'un côté ou de l'autre du point de rupture.
  const layersBody = (
    // Pas de hauteur maximale sous lg : c'est la feuille qui défile.
    <div className="flex flex-col overflow-x-hidden lg:max-h-[36vh] lg:overflow-y-auto">
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
        <button onClick={() => setQuakesOn(!quakesOn)} aria-label={t.nav_seismic} className="cible-tactile flex items-center justify-center"><Switch on={quakesOn} /></button>
      </div>

      {/* Couches météo (grille de conditions actuelles) — superposables */}
      <div className="mt-1 border-t border-white/10 pt-1.5">
        <div className="py-0.5 text-[14px] font-bold text-white/90">{t.nav_weather}</div>
        {([["temp", fx.wx_temp], ["wind", fx.wx_wind], ["precip", fx.wx_precip]] as const).map(([k, label]) => (
          <div key={k} className="flex items-center gap-1.5 py-0.5 ps-3">
            <button onClick={() => toggleWxLayer(k)} className={`min-w-0 flex-1 truncate text-start text-[14px] transition-colors ${wxLayers[k] ? "text-white/90" : "text-white/45"}`}>
              {label}
            </button>
            <button onClick={() => toggleWxLayer(k)} aria-label={label} className="cible-tactile flex items-center justify-center"><Switch on={wxLayers[k]} /></button>
          </div>
        ))}
      </div>
    </div>
  );

  const legendBody = (
    <div className="flex flex-col gap-2 overflow-x-hidden text-[14px] text-white/80 lg:max-h-[46vh] lg:overflow-y-auto">
      {legend.map(([shape, label]) => (
        <div key={label} className="flex items-center gap-2">
          <svg width={14} height={14} viewBox="-7 -7 14 14">{shape}</svg>
          <span>{label}</span>
        </div>
      ))}
      {/* Établissements de santé : six symboles distincts —
          hexagone = militaire, cercle = civil, pointillé = campagne. */}
      <div className="mt-1 border-t border-white/12 pt-2">
        <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-white/50">{t.lg_health_net}</div>
        <div className="flex flex-col gap-1.5">
          {HOSPITAL_KINDS.map((k) => (
            <div key={k.kind} className="flex items-center gap-2">
              <HealthGlyph kind={k.kind} size={17} />
              <span>{k.long}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  /**
   * Panneau du panache NRBC : choix des référentiels (combinables), enveloppe
   * prudente, échéance H+0…H+6 et méta du vent. Le bandeau « Estimation — pas
   * une mesure » est permanent (doctrine d'honnêteté) : un gabarit de
   * planification n'est jamais présenté comme une observation.
   */
  const nrbcBody = !plumeIncidentId ? (
    // Aucun panache affiché : le panneau devient le point d'entrée — il liste
    // les incidents chimiques en cours et active le panache d'un clic (la
    // carte vole alors vers l'incident au bon zoom via showPlume).
    <div className="flex flex-col gap-2 text-[14px] text-white/80">
      <div className="text-[12px] text-white/60">
        {nrbcIncidents.length > 0 ? t.nrbc_pick : t.nrbc_none_active}
      </div>
      {nrbcIncidents.map((i) => (
        <button
          key={i.id}
          onClick={() => showPlume(i.id)}
          className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-white/12 px-2.5 py-2 text-start transition-colors hover:border-or-400/60 hover:bg-white/5 lg:min-h-0"
        >
          <Icon path={UI_ICONS.nrbc} size={15} className="shrink-0 text-or-400" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-white">{i.titre}</span>
            <span className="block text-[11px] text-white/50">{i.id} · {i.region}</span>
          </span>
        </button>
      ))}
    </div>
  ) : (
    <div className="flex flex-col gap-3 text-[14px] text-white/80">
      <div className="rounded-lg bg-or-500/20 px-2.5 py-1.5 text-[12px] font-bold uppercase tracking-wider text-or-300">
        {t.nrbc_estimate}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-semibold text-white">{plumeIncidentId}</span>
        {plumeData?.substance && (
          <span className="shrink-0 text-[12px] text-white/60">
            {plumeData.substance.labels[lang]} · UN {plumeData.substance.un}
          </span>
        )}
      </div>
      {plumeData?.substance && !plumeData.substance.ergVerified && (
        <div className="text-[11px] font-semibold text-or-300">{t.nrbc_unverified}</div>
      )}

      <div>
        <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-white/50">{t.nrbc_models}</div>
        <div className="flex flex-col gap-1.5">
          <button className="flex min-h-11 items-center justify-between gap-2 lg:min-h-0" onClick={() => setPlumeModels({ atp45: !plumeModels.atp45 })}>
            <span>{t.nrbc_model_atp45}</span>
            <Switch on={plumeModels.atp45} />
          </button>
          <button
            className="flex min-h-11 items-center justify-between gap-2 disabled:opacity-40 lg:min-h-0"
            disabled={plumeData !== null && plumeData.substance === null}
            title={plumeData && plumeData.substance === null ? t.nrbc_no_substance : undefined}
            onClick={() => setPlumeModels({ erg: !plumeModels.erg })}
          >
            <span>{t.nrbc_model_erg}</span>
            <Switch on={plumeModels.erg} />
          </button>
          <button className="flex min-h-11 items-center justify-between gap-2 lg:min-h-0" onClick={() => setPlumeEnvelope(!plumeEnvelope)}>
            <span>{t.nrbc_envelope}</span>
            <Switch on={plumeEnvelope} />
          </button>
        </div>
        {plumeData && plumeData.substance === null && (
          <div className="mt-1.5 text-[11px] text-white/50">{t.nrbc_no_substance}</div>
        )}
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[12px] font-bold uppercase tracking-wider text-white/50">{t.nrbc_hour}</span>
          <span className="font-mono text-[13px] font-bold text-or-300">H+{plumeHour}{plumeBusy ? "…" : ""}</span>
        </div>
        <input
          type="range"
          min={0}
          max={6}
          step={1}
          value={plumeHour}
          onChange={(e) => setPlumeHour(Number(e.target.value))}
          className="w-full accent-or-500"
          aria-label={t.nrbc_hour}
        />
      </div>

      {plumeData &&
        (plumeData.wind ? (
          <div className="flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-2 text-[13px]">
            {/* La flèche pointe VERS où va le vent (direction météo + 180°). */}
            <svg width={16} height={16} viewBox="0 0 24 24" className="shrink-0 text-or-300" style={{ transform: `rotate(${(plumeData.wind.fromDeg + 180) % 360}deg)` }}>
              <path d="M12 3v18 M6 9l6-6 6 6" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="min-w-0 flex-1">
              {t.nrbc_wind} {plumeData.wind.speedKmh} km/h · {plumeData.wind.fromDeg}° · {plumeData.wind.isDay ? t.nrbc_day : t.nrbc_night}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-white/45">{plumeData.wind.time.slice(11, 16)} UTC</span>
          </div>
        ) : (
          <div className="rounded-lg bg-white/5 px-2.5 py-2 text-[12px] text-white/60">{t.nrbc_wind_na}</div>
        ))}

      <div className="flex flex-col gap-1.5 border-t border-white/12 pt-2">
        {(
          [
            ["#EF4444", t.nrbc_lvl_danger],
            ["#F97316", t.nrbc_lvl_protection],
            ["#FACC15", t.nrbc_lvl_vigilance],
          ] as const
        ).map(([color, label]) => (
          <div key={label} className="flex items-center gap-2 text-[13px]">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: color, opacity: 0.75 }} />
            <span>{label}</span>
          </div>
        ))}
      </div>

      <button className="btn-secondaire min-h-11 w-full text-[14px] lg:min-h-0" onClick={hidePlume}>
        {t.flt_clear}
      </button>
    </div>
  );

  const selectionBody = selInfo && (
    <div className="flex flex-col gap-2">
      <div className="text-[14px] text-white/60">{selInfo.sub}</div>
      <div><Badge type={selInfo.badgeType} label={selInfo.badgeLabel} /></div>
      <div className="flex flex-col gap-1">
        {selInfo.lines.map((ln, i) => (
          <div key={i} className="flex items-center justify-between gap-2 border-b border-white/12 py-1 text-[14px]">
            <span className="min-w-0 text-white/60">{ln.k}</span>
            <span className="min-w-0 text-end font-semibold text-white">{ln.v}</span>
          </div>
        ))}
      </div>
      {selInfo.action && <button className="btn-secondaire min-h-11 w-full text-[14px] lg:min-h-0" onClick={selInfo.action}>{t.view}</button>}
    </div>
  );

  // Onglets de la feuille : l'onglet « sélection » n'existe que s'il y a une
  // sélection — son libellé est alors le nom de l'élément (aucune clé i18n
  // supplémentaire n'est nécessaire).
  const sheetTabs: { key: SheetTab; label: string; body: ReactNode }[] = [
    { key: "layers", label: t.layers, body: layersBody },
    { key: "aircraft", label: t.acft_panel, body: <AircraftPanel /> },
    { key: "legend", label: t.legend, body: legendBody },
  ];
  if (selInfo) sheetTabs.push({ key: "selection", label: selInfo.titre, body: selectionBody });
  const openTab = sheetTabs.find((x) => x.key === sheet) ?? null;

  // Les marges négatives annulent exactement le rembourrage de <main>
  // (`p-3 sm:p-4 lg:p-6`) : figées à `-m-6`, elles débordaient de 24 px à
  // 375 px et faisaient défiler la page horizontalement.
  const frameCls = full
    ? "fixed inset-0 z-[9999] bg-rdia-900"
    : "relative -m-3 h-[calc(100%+1.5rem)] animate-fade-in sm:-m-4 sm:h-[calc(100%+2rem)] lg:-m-6 lg:h-[calc(100%+3rem)]";

  return (
    <section
      className={`carte-page ${frameCls}`}
      style={{ background: "#10202f" }}
    >
      <MapCanvas />

      {/* Surcouches : tout est posé sur la carte, chaque panneau est repliable */}
      <div className="pointer-events-none absolute inset-0 z-20">
        {/* Colonne gauche (≥ lg) : couches (arbre) + suivi aérien + légende.
            Sous lg ces trois panneaux sont dans la feuille du bas. */}
        {/* Trio de gauche (≥ lg) : trois boutons au style des contrôles natifs ;
            le panneau choisi s'ouvre à côté avec l'animation « bulle », un seul
            à la fois. Sous lg, ces contenus restent dans la feuille du bas. */}
        <div className="absolute top-3 hidden items-start gap-2 lg:flex" style={{ insetInlineStart: 12 }}>
          <div className="pointer-events-auto flex flex-col overflow-hidden rounded-xl bg-white shadow-md">
            {(
              [
                { key: "layers" as const, icon: UI_ICONS.layers, label: t.layers },
                { key: "air" as const, icon: UI_ICONS.plane, label: t.acft_panel },
                { key: "legend" as const, icon: UI_ICONS.legend, label: t.legend },
                // Le bouton NRBC existe dès qu'un incident chimique est en cours
                // (ou qu'un panache est déjà affiché) : la capacité se découvre
                // depuis la carte, sans passer par la fiche incident.
                ...(plumeIncidentId || nrbcIncidents.length > 0
                  ? [{ key: "nrbc" as const, icon: UI_ICONS.nrbc, label: t.nrbc_panel }]
                  : []),
              ]
            ).map((b) => (
              <button
                key={b.key}
                onClick={() => setOpenPanel((o) => (o === b.key ? null : b.key))}
                aria-label={b.label}
                aria-expanded={openPanel === b.key}
                title={b.label}
                className={`flex h-11 w-11 items-center justify-center border-b border-gray-200 transition-colors last:border-0 ${
                  openPanel === b.key ? "bg-or-500/15 text-or-600" : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <Icon path={b.icon} size={22} strokeWidth={2} />
              </button>
            ))}
          </div>

          {openPanel && (
            // `key` relance l'animation bulle à chaque changement de panneau.
            <div key={openPanel} className="anim-bulle panneau-sombre pointer-events-auto w-[300px] overflow-hidden rounded-xl shadow-lg" style={GLASS}>
              <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
                <Icon
                  path={openPanel === "layers" ? UI_ICONS.layers : openPanel === "air" ? UI_ICONS.plane : openPanel === "nrbc" ? UI_ICONS.nrbc : UI_ICONS.legend}
                  size={14}
                  className="shrink-0 text-or-400"
                />
                <span className="min-w-0 flex-1 truncate text-[13px] font-bold uppercase tracking-wider text-white/85">
                  {openPanel === "layers" ? t.layers : openPanel === "air" ? t.acft_panel : openPanel === "nrbc" ? t.nrbc_panel : t.legend}
                </span>
                <button
                  onClick={() => setOpenPanel(null)}
                  aria-label={t.flt_clear}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-[16px] leading-none text-white/45 transition-colors hover:text-or-400"
                >
                  ×
                </button>
              </div>
              <div className="max-h-[62vh] overflow-y-auto px-3 pb-3 pt-2">
                {openPanel === "layers" ? layersBody : openPanel === "air" ? <AircraftPanel /> : openPanel === "nrbc" ? nrbcBody : legendBody}
              </div>
            </div>
          )}
        </div>

        {/* Origine du fond de carte (ADR 0006). Une carte servie par un
            fournisseur étranger doit se VOIR : la fuite de profil d'activité est
            invisible par nature, le bandeau la rend constatable. La production
            impose le mode souverain, ce bandeau n'y apparaît donc jamais. */}
        {(TILES_MODE === "external" || !TILES_AVAILABLE) && (
          <div
            className="pointer-events-none absolute bottom-3 z-30 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-or-300 shadow-lg"
            style={{ ...GLASS, insetInlineStart: 12 }}
          >
            <Icon path={UI_ICONS.shield} size={13} className="shrink-0" />
            <span>{TILES_AVAILABLE ? t.map_tiles_external : t.map_tiles_none}</span>
          </div>
        )}

        {/* Panache actif sous lg : la feuille ne porte pas (encore) ses réglages,
            mais le bandeau d'honnêteté et l'extinction restent accessibles. */}
        {plumeIncidentId && (
          <div className="pointer-events-auto absolute inset-x-3 top-16 z-30 flex items-center gap-2 rounded-xl px-3 py-2 shadow-lg lg:hidden" style={GLASS}>
            <Icon path={UI_ICONS.nrbc} size={16} className="shrink-0 text-or-400" />
            <span className="min-w-0 flex-1 truncate text-[12px] font-bold uppercase tracking-wider text-or-300">
              {t.nrbc_estimate}
            </span>
            <button
              onClick={hidePlume}
              aria-label={t.flt_clear}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[16px] leading-none text-white/60 transition-colors hover:text-or-400"
            >
              ×
            </button>
          </div>
        )}

        {/* Colonne droite : contrôles de carte (toutes tailles) + sélection (≥ lg) */}
        <div className="absolute top-3 flex max-w-[calc(100%-1.5rem)] flex-col items-end gap-2 lg:w-[300px]" style={{ insetInlineEnd: 12 }}>
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
              className="flex h-11 w-11 items-center justify-center rounded-lg text-white/90 shadow-md transition-colors hover:text-or-400 lg:h-[30px] lg:w-[30px]"
              style={GLASS}
            >
              <Icon path={full ? UI_ICONS.close : UI_ICONS.expand} size={15} strokeWidth={2} />
            </button>
          </div>

          {/* Bouton flottant d'ouverture de la feuille — sous lg uniquement. */}
          <button
            onClick={() => setSheet((s) => (s ? null : "layers"))}
            title={t.layers}
            aria-label={t.layers}
            aria-expanded={sheet !== null}
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-lg text-white/90 shadow-md transition-colors hover:text-or-400 lg:hidden"
            style={GLASS}
          >
            <Icon path={sheet ? UI_ICONS.close : UI_ICONS.sliders} size={18} strokeWidth={2} />
          </button>

          {selInfo && (
            <div className="hidden lg:block">
              <Panel
                title={selInfo.titre}
                width={240}
                right={
                  <button className="me-2 rounded-lg p-1 text-white/60 transition-colors hover:text-or-400" onClick={clearSelection} aria-label={t.cancel}>
                    <Icon path={UI_ICONS.close} size={13} strokeWidth={2} />
                  </button>
                }
              >
                {selectionBody}
              </Panel>
            </div>
          )}
        </div>

      </div>

      {/* Feuille ancrée en bas (< lg) : mêmes panneaux, en onglets. Elle ne
          couvre jamais plus de 62 % de la hauteur utile et laisse donc voir la
          carte pendant qu'on bascule une couche. Rendue hors de la surcouche
          `z-20` : il lui faut passer devant le bouton flottant du Copilot
          (`z-50`), sinon celui-ci se pose au milieu du contenu. */}
      {openTab && (
        <div className="panneau-sombre pointer-events-auto absolute inset-x-0 bottom-0 z-[60] flex max-h-[62dvh] flex-col overflow-hidden rounded-t-2xl shadow-2xl lg:hidden" style={GLASS}>
          <div className="flex shrink-0 items-center gap-1 border-b border-white/12 ps-1">
            {/* Onglets défilables : quatre libellés ne tiennent pas à 375 px. */}
            <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
              {sheetTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setSheet(tab.key)}
                  className={`min-h-11 max-w-[45vw] shrink-0 truncate rounded-t-lg px-3 text-[13px] font-bold uppercase tracking-wider transition-colors ${
                    tab.key === openTab.key ? "bg-white/10 text-or-400" : "text-white/60 hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setSheet(null)}
              aria-label={t.cancel}
              className="cible-tactile flex shrink-0 items-center justify-center rounded-lg text-white/70 transition-colors hover:text-or-400"
            >
              <Icon path={UI_ICONS.close} size={16} strokeWidth={2} />
            </button>
          </div>
          {/* Seule la feuille défile ; `overscroll-contain` évite d'entraîner
              la carte quand on arrive en bout de liste. */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            {openTab.body}
          </div>
        </div>
      )}
    </section>
  );
}
