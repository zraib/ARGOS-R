// ============================================================================
// components/map/layers/plume.ts — le panache NRBC sur la carte (ADR 0005)
//
// Zones remplies et contours, référentiel primaire / secondaires, enveloppe
// prudente, nappe volumique inclinée, nappe de fumée (lot N-4), lecture animée
// des échéances. L'état entre deux images tient dans `PlumeRuntime`.
// Code déplacé verbatim depuis MapCanvas.tsx (R-7).
// ============================================================================

import maplibregl from "maplibre-gl";
import { useArgos } from "@/lib/store";
import { SmokeLayer } from "@/lib/map/smoke";
import { interpolatePlume, PLUME_LEVEL_COLOR } from "@/lib/map/canvas/plume";
import type { NrbcPlume } from "@/lib/types";

export class PlumeRuntime {
  smoke: SmokeLayer | null = null;
  /** Identifiant de l'incident déjà cadré : on ne recadre qu'une fois par panache. */
  fitFor: string | null = null;
  /** Échéance fractionnaire pendant la lecture (ex. 2,4) ; null hors lecture. */
  frame: number | null = null;
  raf = 0;
}

/**
 * Applique l'état courant du panache NRBC : données, style de combinaison
 * (référentiel primaire rempli, secondaires en contour tireté) et enveloppe
 * prudente (tout rouge, remplissage intégral). Appelée par setupStyle (le
 * changement de fond repose le style) et par l'effet plumeData/plumeModels.
 */
export function applyPlume(rt: PlumeRuntime, map: maplibregl.Map | null) {
  if (!map) return;
  const src = map.getSource("nrbc-plume") as maplibregl.GeoJSONSource | undefined;
  if (!src || !map.getLayer("nrbc-plume-fill")) return;
  const { plumeData, plumeModels, plumeEnvelope, plumeIncidentId, plumeSteps, plume3d } = useArgos.getState();
  const empty = { type: "FeatureCollection" as const, features: [] };

  // Pendant la lecture, la géométrie est INTERPOLÉE entre deux échéances :
  // le triangle pivote avec le vent au lieu de sauter d'heure en heure.
  // `plumeFrameRef` porte l'échéance fractionnaire courante (ex. 2,4).
  const frame = rt.frame;
  const interpolated = frame !== null ? interpolatePlume(plumeSteps, frame) : null;
  const data = interpolated ?? (plumeIncidentId && plumeData ? (plumeData.fc as GeoJSON.FeatureCollection) : empty);
  src.setData(data);

  // Cadrage sur l'emprise RÉELLE des zones, une seule fois par panache : à
  // l'échelle nationale un panache de quelques kilomètres est un point
  // invisible. On ne recadre pas aux changements d'échéance ou de
  // référentiel — l'opérateur garde la main sur sa caméra ensuite.
  if (plumeIncidentId && plumeData && rt.fitFor !== plumeIncidentId) {
    const rings = plumeData.fc.features.flatMap((f) => f.geometry.coordinates[0]);
    if (rings.length > 0) {
      const lons = rings.map((p) => p[0]);
      const lats = rings.map((p) => p[1]);
      map.fitBounds(
        [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ],
        // Marge à gauche : le panneau NRBC (300 px) recouvre la carte au-delà de `lg`.
        { padding: { top: 80, bottom: 80, left: map.getContainer().clientWidth >= 1024 ? 380 : 60, right: 60 }, duration: 900, maxZoom: 13 },
      );
      rt.fitFor = plumeIncidentId;
    }
  }
  if (!plumeIncidentId) rt.fitFor = null;
  // Primaire = premier référentiel actif (ordre de l'ADR : ATP-45 puis ERG).
  const primary = plumeModels.atp45 ? "atp45" : "erg";

  // --- nappe d'AXE sous le seuil de vent (lot N-4e) -------------------------
  // Elle dit la direction la plus probable, PAS un périmètre à poser. Elle est
  // donc tracée en tireté et sans remplissage propre : la distinguer du
  // gabarit doctrinal n'est pas une coquetterie, c'est ce qui empêche de
  // l'utiliser comme une limite d'évacuation.
  const isLowWindWedge: maplibregl.ExpressionSpecification = ["==", ["get", "lowWind"], true];
  const notLowWindWedge: maplibregl.ExpressionSpecification = ["!=", ["get", "lowWind"], true];

  // --- zone de VIGILANCE, affichable ou non (lot N-4d) ---------------------
  // Le grand cercle jaune de l'ATP-45 couvre 10 km dans toutes les directions
  // quand le vent est trop faible ou trop variable pour désigner un secteur. À
  // l'échelle d'une ville il recouvre tout le reste, et le commandement qui
  // travaille sur la zone d'isolement veut pouvoir le retirer.
  //
  // La bascule porte sur la ZONE ENTIÈRE — contour, remplissage ET fumée.
  // Masquer le tracé en laissant le nuage aurait montré une diffusion sans
  // périmètre : exactement l'affirmation sans garde-fou que ce module refuse.
  const { plumeVigilance } = useArgos.getState();
  const notVigilance: maplibregl.ExpressionSpecification = ["!=", ["get", "level"], "vigilance"];
  const withVigilance = (
    base: maplibregl.ExpressionSpecification | null,
  ): maplibregl.ExpressionSpecification | null =>
    plumeVigilance ? base : base ? ["all", base, notVigilance] : notVigilance;

  if (plumeEnvelope) {
    // Enveloppe prudente : directive de STYLE, pas d'union géométrique —
    // toutes les zones remplies de la même teinte, plus de hiérarchie.
    map.setPaintProperty("nrbc-plume-fill", "fill-color", "#EF4444");
    map.setPaintProperty("nrbc-plume-line", "line-color", "#EF4444");
    map.setFilter("nrbc-plume-fill", withVigilance(null));
    map.setFilter("nrbc-plume-line", withVigilance(null));
    map.setFilter("nrbc-plume-line-2", ["==", ["get", "model"], "__none__"]);
  } else {
    map.setPaintProperty("nrbc-plume-fill", "fill-color", PLUME_LEVEL_COLOR);
    map.setPaintProperty("nrbc-plume-line", "line-color", PLUME_LEVEL_COLOR);
    map.setFilter("nrbc-plume-fill", withVigilance(["all", ["==", ["get", "model"], primary], notLowWindWedge]));
    map.setFilter("nrbc-plume-line", withVigilance(["all", ["==", ["get", "model"], primary], notLowWindWedge]));
    // La couche tiretée porte les référentiels secondaires ET la nappe d'axe.
    map.setFilter("nrbc-plume-line-2", withVigilance(["any", ["!=", ["get", "model"], primary], isLowWindWedge]));
  }

  // --- nappe de fumée (lots N-4 et N-4b) -----------------------------------
  const { plumeSmoke } = useArgos.getState();
  const smokeOn = plumeSmoke && !!plumeIncidentId && !!plumeData;
  if (rt.smoke) {
    // UN SEUL POLYGONE : celui de DIFFUSION — la zone qui dépend du vent.
    // Le cercle d'ISOLEMENT reste vide : c'est un rayon qu'on POSE autour du
    // rejet, pas un nuage qu'on observe. Remplir les deux ferait de la fumée
    // une décoration au lieu d'une information.
    const diffusion = data.features.find(
      (f) =>
        f.properties?.model === primary &&
        (f.properties?.level === "protection" ||
          // Vigilance masquée : pas de fumée non plus. Un nuage sans son
          // périmètre serait une diffusion que rien ne borne à l'écran.
          (plumeVigilance && f.properties?.level === "vigilance")),
    );
    const ring = (diffusion?.geometry as GeoJSON.Polygon | undefined)?.coordinates?.[0] as
      | [number, number][]
      | undefined;
    // La source du rejet est la position de l'incident : le panache n'en
    // transporte pas de copie, et en inventer une décalerait le nuage.
    const inc = useArgos.getState().incidents.find((i) => i.id === plumeIncidentId);
    // Teintes PRINCIPALE et DÉRIVÉE. Le cœur porte la gravité de la zone, la
    // traîne dit la dilution — même information que le gabarit, rendue
    // continue par le nuanceur.
    const level = diffusion?.properties?.level === "vigilance" ? "vigilance" : "protection";
    const core = plumeEnvelope ? "#DC2626" : level === "vigilance" ? "#EAB308" : "#F97316";
    const tail = plumeEnvelope ? "#FCA5A5" : level === "vigilance" ? "#FEF3C7" : "#FED7AA";
    rt.smoke.set({
      ring: smokeOn ? (ring ?? null) : null,
      source: (inc?.ll as [number, number] | undefined) ?? null,
      windFromDeg: plumeData?.wind?.fromDeg ?? null,
      windSpeedKmh: plumeData?.wind?.speedKmh ?? null,
      core,
      tail,
      opacity: smokeOn ? 0.30 : 0,
      // Le cercle de VIGILANCE signifie « dérive possible dans toutes les
      // directions » : la fumée s'y étend en nappe au lieu de partir d'un
      // côté, sans quoi la lecture contredirait le gabarit qu'elle habite.
      omnidirectional: level === "vigilance",
    });
  }
  // Remplissages ATTÉNUÉS : le gabarit doit se deviner sous le nuage sans le
  // concurrencer. Une teinte plate trop dense écrasait le mouvement, et c'est
  // le mouvement qui porte l'information.
  map.setPaintProperty("nrbc-plume-fill", "fill-opacity", smokeOn ? 0.05 : 0.18);

  // La nappe volumique n'apparaît qu'inclinée : à plat elle n'ajouterait
  // rien et masquerait les remplissages.
  if (map.getLayer("nrbc-plume-3d")) {
    const tilted = map.getPitch() > 30;
    map.setLayoutProperty("nrbc-plume-3d", "visibility", plume3d && tilted && plumeIncidentId ? "visible" : "none");
    map.setFilter("nrbc-plume-3d", withVigilance(plumeEnvelope ? null : ["==", ["get", "model"], primary]));
    map.setPaintProperty("nrbc-plume-3d", "fill-extrusion-color", plumeEnvelope ? "#EF4444" : PLUME_LEVEL_COLOR);
    // Les deux se complètent : la nappe volumique donne la HAUTEUR du nuage —
    // un gaz dense rampe, un gaz léger monte — que des bouffées à plat ne
    // peuvent pas rendre. Elle est seulement retenue sous la fumée pour ne pas
    // l'écraser, pas effacée : à 0,14 on ne la voyait plus du tout.
    map.setPaintProperty("nrbc-plume-3d", "fill-extrusion-opacity", smokeOn ? 0.32 : 0.45);
  }
}

/** Pose les couches du panache (appelée par setupStyle ; idempotente). */
export function setupPlumeLayers(rt: PlumeRuntime, map: maplibregl.Map): void {
    // Panache NRBC (ADR 0005) : zones remplies + contours. Le référentiel
    // « primaire » est rempli, les secondaires en contour tireté — l'effet
    // d'alimentation (plumeData) pilote données, filtres et opacités.
    if (!map.getSource("nrbc-plume")) {
      map.addSource("nrbc-plume", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "nrbc-plume-fill",
        type: "fill",
        source: "nrbc-plume",
        paint: { "fill-color": PLUME_LEVEL_COLOR, "fill-opacity": 0.25 },
      });
      map.addLayer({
        id: "nrbc-plume-line",
        type: "line",
        source: "nrbc-plume",
        paint: { "line-color": PLUME_LEVEL_COLOR, "line-width": 1.5, "line-opacity": 0.9 },
      });
      // Référentiels secondaires : contour tireté, sans remplissage (le
      // dasharray ne pouvant pas être piloté par feature, couche séparée).
      map.addLayer({
        id: "nrbc-plume-line-2",
        type: "line",
        source: "nrbc-plume",
        filter: ["==", ["get", "model"], "__none__"],
        paint: { "line-color": PLUME_LEVEL_COLOR, "line-width": 2, "line-dasharray": [2, 2], "line-opacity": 0.9 },
      });
      // NAPPE VOLUMIQUE (lot V2) : jumelle 3D des couches plates, visible
      // quand la carte est inclinée. `fill-extrusion` est natif MapLibre —
      // aucune dépendance, et la hauteur porte du SENS : un gaz dense comme
      // le chlore rampe, sa nappe est basse.
      map.addLayer({
        id: "nrbc-plume-3d",
        type: "fill-extrusion",
        source: "nrbc-plume",
        layout: { visibility: "none" },
        paint: {
          "fill-extrusion-color": PLUME_LEVEL_COLOR,
          // Le danger immédiat monte plus haut que la vigilance : la
          // silhouette se lit avant la couleur.
          "fill-extrusion-height": [
            "match", ["get", "level"],
            "danger", 420,
            "protection", 240,
            120,
          ],
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.45,
        },
      });
      // NAPPE DE FUMÉE (lot N-4) : couche WebGL native, posée AU-DESSUS des
      // remplissages et SOUS les contours — la ligne du gabarit doit rester
      // lisible à travers le nuage, c'est sur elle qu'on pose un barrage.
      if (!map.getLayer("nrbc-smoke")) {
        if (!rt.smoke) rt.smoke = new SmokeLayer(() => map.triggerRepaint());
        map.addLayer(rt.smoke, "nrbc-plume-line");
      }
      applyPlume(rt, map); // un panache déjà actif survit au changement de fond de carte
    }
}

/**
 * Lecture animée du panache (lot V1) : caméra de théâtre puis échéances
 * interpolées. Rend la fonction d'arrêt, ou `undefined` s'il n'y a rien à lire.
 */
export function playPlume(rt: PlumeRuntime, map: maplibregl.Map, playing: boolean, plumeSteps: (NrbcPlume | null)[]): (() => void) | undefined {

  if (!playing) {
    cancelAnimationFrame(rt.raf);
    rt.frame = null;
    applyPlume(rt, map);
    return;
  }
  if (plumeSteps.length === 0) return;

  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  // Caméra de théâtre : on incline et on serre sur la zone de rejet.
  const first = plumeSteps.find(Boolean);
  const anchor = first?.fc.features[0]?.geometry.coordinates[0]?.[0];
  if (anchor) {
    map.easeTo({ center: anchor as [number, number], zoom: Math.max(map.getZoom(), 11.5), pitch: 60, duration: 1200 });
  }

  const SEC_PER_STEP = 1.4;
  const last = plumeSteps.length - 1;
  let t0 = 0;
  const tick = (t: number) => {
    if (t0 === 0) t0 = t;
    const elapsed = (t - t0) / 1000;
    const raw = Math.min(elapsed / SEC_PER_STEP, last);
    rt.frame = reduced ? Math.floor(raw) : raw;
    applyPlume(rt, map);
    // L'échéance affichée par le panneau suit la lecture.
    useArgos.setState({ plumeHour: Math.round(rt.frame) });
    if (raw >= last) {
      useArgos.getState().setPlumePlaying(false);
      return;
    }
    rt.raf = requestAnimationFrame(tick);
  };
  rt.raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(rt.raf);
}
