// ============================================================================
// components/map/layers/measure.ts — le tracé de l'outil d'itinéraire (ADR 0039)
//
// Ce que la carte montre d'un plan, chaque rôle avec son trait :
//   • route     — le trajet qui contourne obstacles et zones (bleu, plein) ;
//   • exit      — la sortie d'une zone NRBC, qui la traverse (orange, plein) ;
//   • unsafe    — aucun trajet ne contourne tout : le plus court, NON SÛR (rouge, tirets) ;
//   • direct    — moteur injoignable : la ligne droite (bleu, tirets) ;
//   • reference — le plus court sans rien contourner, pour mesurer le détour (gris, tirets).
// Et les points : étapes (bleu), étape prise dans une zone (rouge), point de
// sortie et points d'approche sûrs (vert).
// ============================================================================

import type maplibregl from "maplibre-gl";
import type { RoutePlan } from "@/lib/types";

type LL = [number, number];
type Role = "route" | "exit" | "unsafe" | "direct" | "reference" | "waypoint" | "in_zone" | "exit_point" | "approach";

const COULEUR: Record<Role, string> = {
  route: "#38BDF8",
  exit: "#F97316",
  unsafe: "#EF4444",
  direct: "#38BDF8",
  reference: "#94A3B8",
  waypoint: "#38BDF8",
  in_zone: "#EF4444",
  exit_point: "#22C55E",
  approach: "#22C55E",
};
const couleur = ["match", ["get", "role"], ...Object.entries(COULEUR).flat(), "#38BDF8"] as unknown as maplibregl.ExpressionSpecification;

/** Pose les couches (appelée par setupStyle ; idempotente). */
export function setupMeasureLayer(map: maplibregl.Map): void {
  if (map.getSource("measure")) return;
  map.addSource("measure", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "measure-ref",
    type: "line",
    source: "measure",
    filter: ["==", ["get", "role"], "reference"],
    layout: { "line-cap": "round" },
    paint: { "line-color": couleur, "line-width": 3, "line-dasharray": [2, 2], "line-opacity": 0.9 },
  });
  map.addLayer({
    id: "measure-casing",
    type: "line",
    source: "measure",
    filter: ["in", ["get", "role"], ["literal", ["route", "exit", "unsafe", "direct"]]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#0f1f14", "line-width": 8, "line-opacity": 0.55 },
  });
  map.addLayer({
    id: "measure-line",
    type: "line",
    source: "measure",
    filter: ["in", ["get", "role"], ["literal", ["route", "exit"]]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": couleur, "line-width": 5 },
  });
  map.addLayer({
    id: "measure-dashed",
    type: "line",
    source: "measure",
    filter: ["in", ["get", "role"], ["literal", ["unsafe", "direct"]]],
    layout: { "line-join": "round" },
    paint: { "line-color": couleur, "line-width": 4, "line-dasharray": [1.5, 1] },
  });
  map.addLayer({
    id: "measure-pt",
    type: "circle",
    source: "measure",
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": ["match", ["get", "role"], ["exit_point", "approach"], 7, 6],
      "circle-color": couleur,
      "circle-stroke-color": "#0f1f14",
      "circle-stroke-width": 2.5,
    },
  });
}

/**
 * Les tracés d'itinéraire passent AU-DESSUS de tout le reste (panache, zones,
 * séismes) : la sortie d'une zone NRBC se lit justement dans la zone, là où la
 * fumée du panache la cachait. Appelée à la fin de l'installation du style.
 */
export function raiseMeasureLayers(map: maplibregl.Map): void {
  for (const id of ["measure-ref", "measure-casing", "measure-line", "measure-dashed", "measure-pt"]) {
    if (map.getLayer(id)) map.moveLayer(id);
  }
}

/** Les entités GeoJSON d'un plan (et des étapes saisies) — pures, testées. */
export function routeFeatures(pts: readonly LL[], plan: RoutePlan | null): GeoJSON.Feature[] {
  const ligne = (role: Role, coords: LL[]): GeoJSON.Feature => ({ type: "Feature", properties: { role }, geometry: { type: "LineString", coordinates: coords } });
  const point = (role: Role, ll: LL): GeoJSON.Feature => ({ type: "Feature", properties: { role }, geometry: { type: "Point", coordinates: ll } });
  const out: GeoJSON.Feature[] = [];
  if (plan?.reference && plan.reference.coords.length > 1) out.push(ligne("reference", plan.reference.coords));
  for (const leg of plan?.legs ?? []) {
    if (leg.coords.length < 2) continue;
    const role: Role = !plan!.road ? "direct" : leg.kind === "exit" ? "exit" : plan!.safe ? "route" : "unsafe";
    out.push(ligne(role, leg.coords));
  }
  // Sans plan (calcul en cours) : la ligne droite entre les étapes, en attendant.
  if (!plan && pts.length > 1) out.push(ligne("direct", [...pts]));
  const remplacees = new Set((plan?.approaches ?? []).map((a) => a.index));
  pts.forEach((p, i) => out.push(point(remplacees.has(i) || (i === 0 && plan?.exit) ? "in_zone" : "waypoint", p)));
  if (plan?.exit) out.push(point("exit_point", plan.exit.point));
  for (const a of plan?.approaches ?? []) out.push(point("approach", a.point));
  return out;
}

/** Trace le plan (ou, en attendant, la ligne droite) et les étapes. */
export function drawMeasure(map: maplibregl.Map, pts: readonly LL[], plan: RoutePlan | null): void {
  const src = map.getSource("measure") as maplibregl.GeoJSONSource | undefined;
  src?.setData({ type: "FeatureCollection", features: routeFeatures(pts, plan) });
}
