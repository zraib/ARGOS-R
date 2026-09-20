// ============================================================================
// lib/map/drawings.ts — géométrie PURE des croquis (mode dessin) : cercle en
// polygone, centre d'une forme, distance, GeoJSON pour les couches MapLibre.
// ============================================================================

import type { Drawing } from "@/lib/types";

/** Qui modifie ou retire un croquis : son auteur, ou le Super Administrateur — ce que l'API applique. */
export function canEditDrawing(d: Pick<Drawing, "createdBy">, role: string, matricule: string | undefined): boolean {
  return role === "superadmin" || (!!matricule && d.createdBy.toLowerCase() === matricule.toLowerCase());
}

/** Couleurs proposées pour un croquis — les tons de la charte (or, danger, bleu, vert, orange, blanc). */
export const DRAWING_COLORS = ["#C9A84C", "#EF4444", "#3B82F6", "#22C55E", "#F97316", "#F8FAFC"] as const;
export const DEFAULT_DRAWING_COLOR = DRAWING_COLORS[0];

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Distance en mètres entre deux points [lng, lat] (haversine). */
export function distanceM(a: [number, number], b: [number, number]): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Le point à `distM` mètres du centre dans la direction `bearingDeg` (0 = nord). */
export function destination(center: [number, number], distM: number, bearingDeg: number): [number, number] {
  const lat1 = rad(center[1]);
  const lng1 = rad(center[0]);
  const br = rad(bearingDeg);
  const d = distM / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br));
  const lng2 = lng1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI];
}

/** Un cercle géodésique approché par un polygone de `n` sommets (anneau fermé). */
export function circleRing(center: [number, number], radiusM: number, n = 64): [number, number][] {
  const ring: [number, number][] = [];
  for (let i = 0; i < n; i += 1) ring.push(destination(center, radiusM, (360 * i) / n));
  ring.push(ring[0]);
  return ring;
}

/** L'anneau fermé d'un polygone (le premier sommet répété à la fin). */
export function closedRing(coords: readonly [number, number][]): [number, number][] {
  const ring = coords.map((c) => [c[0], c[1]] as [number, number]);
  if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) ring.push(ring[0]);
  return ring;
}

/** Le centre d'une forme : le point, le centre du cercle, le barycentre des sommets du polygone. */
export function centerOf(d: Pick<Drawing, "kind" | "coords">): [number, number] {
  if (d.kind !== "polygon" || d.coords.length === 0) return d.coords[0] ?? [0, 0];
  const n = d.coords.length;
  return [d.coords.reduce((s, c) => s + c[0], 0) / n, d.coords.reduce((s, c) => s + c[1], 0) / n];
}

/** Où l'étiquette s'affiche : à l'emplacement choisi, sinon au centre de la forme. */
export function labelPosition(d: Pick<Drawing, "kind" | "coords" | "labelLL">): [number, number] {
  return d.labelLL ?? centerOf(d);
}

/** Les rayons proposés quand un cercle se dessine au clavier (mètres). */
export function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1)} km` : `${Math.round(m)} m`;
}

export type DrawingFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.Point, { id: string; kind: Drawing["kind"]; color: string; selected: 0 | 1 }>;

/** Les croquis en GeoJSON : polygones (cercles compris) et points, avec leur couleur et leur sélection. */
export function drawingsToGeoJSON(drawings: readonly Drawing[], selectedId: string | null): GeoJSON.FeatureCollection {
  const features: DrawingFeature[] = [];
  for (const d of drawings) {
    const props = { id: d.id, kind: d.kind, color: d.color ?? DEFAULT_DRAWING_COLOR, selected: d.id === selectedId ? (1 as const) : (0 as const) };
    if (d.kind === "point") {
      if (d.coords[0]) features.push({ type: "Feature", properties: props, geometry: { type: "Point", coordinates: d.coords[0] } });
    } else if (d.kind === "circle") {
      if (d.coords[0] && d.radiusM) features.push({ type: "Feature", properties: props, geometry: { type: "Polygon", coordinates: [circleRing(d.coords[0], d.radiusM)] } });
    } else if (d.coords.length >= 3) {
      features.push({ type: "Feature", properties: props, geometry: { type: "Polygon", coordinates: [closedRing(d.coords)] } });
    }
  }
  return { type: "FeatureCollection", features };
}

/** Les poignées d'édition d'un croquis sélectionné : ses sommets (polygone), son centre et son bord (cercle), le point. */
export function handlesOf(d: Drawing | null): GeoJSON.FeatureCollection {
  if (!d) return { type: "FeatureCollection", features: [] };
  const pts: { ll: [number, number]; role: string; index: number }[] = [];
  if (d.kind === "polygon") d.coords.forEach((c, i) => pts.push({ ll: c, role: "vertex", index: i }));
  if (d.kind === "circle" && d.coords[0] && d.radiusM) {
    pts.push({ ll: d.coords[0], role: "center", index: 0 });
    pts.push({ ll: destination(d.coords[0], d.radiusM, 90), role: "radius", index: 0 });
  }
  if (d.kind === "point" && d.coords[0]) pts.push({ ll: d.coords[0], role: "center", index: 0 });
  return { type: "FeatureCollection", features: pts.map((p) => ({ type: "Feature", properties: { id: d.id, role: p.role, index: p.index }, geometry: { type: "Point", coordinates: p.ll } })) };
}

/** Le brouillon en cours de dessin : sommets déjà posés et ligne vers le curseur ; cercle en cours de tracé. */
export function draftToGeoJSON(kind: Drawing["kind"] | null, coords: readonly [number, number][], cursor: [number, number] | null): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  if (!kind || coords.length === 0) return { type: "FeatureCollection", features };
  if (kind === "circle") {
    const r = cursor ? distanceM(coords[0], cursor) : 0;
    if (r > 0) features.push({ type: "Feature", properties: { draft: 1 }, geometry: { type: "Polygon", coordinates: [circleRing(coords[0], r)] } });
    features.push({ type: "Feature", properties: { draft: 1, vertex: 1 }, geometry: { type: "Point", coordinates: coords[0] } });
    return { type: "FeatureCollection", features };
  }
  const line = cursor ? [...coords, cursor] : [...coords];
  if (line.length >= 2) features.push({ type: "Feature", properties: { draft: 1 }, geometry: { type: "LineString", coordinates: line } });
  if (kind === "polygon" && coords.length >= 2 && cursor) features.push({ type: "Feature", properties: { draft: 1, closing: 1 }, geometry: { type: "LineString", coordinates: [cursor, coords[0]] } });
  for (const c of coords) features.push({ type: "Feature", properties: { draft: 1, vertex: 1 }, geometry: { type: "Point", coordinates: c } });
  return { type: "FeatureCollection", features };
}
