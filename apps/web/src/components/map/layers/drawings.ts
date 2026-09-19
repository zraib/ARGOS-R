// ============================================================================
// components/map/layers/drawings.ts — les croquis (mode dessin) sur la carte :
// formes (polygones, cercles, points), poignées d'édition du croquis
// sélectionné, brouillon en cours de tracé, et étiquettes DÉPLAÇABLES.
//
// Les étiquettes sont des marqueurs DOM (comme celles des unités et des
// postes) : elles n'ont besoin d'aucune police de carte — donc marchent en mode
// externe comme en souverain — et MapLibre sait les faire glisser. Le nom d'un
// point se lit à côté du point ; celui d'un cercle ou d'un polygone à
// l'intérieur, là où l'opérateur l'a posé (`labelLL`).
// ============================================================================

import maplibregl from "maplibre-gl";
import type { Drawing } from "@/lib/types";
import { DEFAULT_DRAWING_COLOR, draftToGeoJSON, drawingsToGeoJSON, handlesOf, labelPosition } from "@/lib/map/drawings";

export const DRAW_SRC = "drawings";
export const DRAW_HANDLES_SRC = "drawings-handles";
export const DRAW_DRAFT_SRC = "drawings-draft";
export const DRAW_FILL = "drawings-fill";
export const DRAW_LINE = "drawings-line";
export const DRAW_POINT = "drawings-point";
export const DRAW_HANDLE = "drawings-handle";

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/** Pose les sources et couches (appelée par setupStyle ; idempotente). */
export function setupDrawingLayers(map: maplibregl.Map): void {
  if (map.getSource(DRAW_SRC)) return;
  map.addSource(DRAW_SRC, { type: "geojson", data: EMPTY });
  map.addSource(DRAW_HANDLES_SRC, { type: "geojson", data: EMPTY });
  map.addSource(DRAW_DRAFT_SRC, { type: "geojson", data: EMPTY });
  map.addLayer({
    id: DRAW_FILL,
    type: "fill",
    source: DRAW_SRC,
    filter: ["==", "$type", "Polygon"],
    paint: { "fill-color": ["get", "color"], "fill-opacity": ["case", ["==", ["get", "selected"], 1], 0.32, 0.18] },
  });
  map.addLayer({
    id: DRAW_LINE,
    type: "line",
    source: DRAW_SRC,
    filter: ["==", "$type", "Polygon"],
    paint: { "line-color": ["get", "color"], "line-width": ["case", ["==", ["get", "selected"], 1], 3.5, 2.5] },
  });
  map.addLayer({
    id: DRAW_POINT,
    type: "circle",
    source: DRAW_SRC,
    filter: ["==", "$type", "Point"],
    paint: {
      "circle-radius": ["case", ["==", ["get", "selected"], 1], 9, 7],
      "circle-color": ["get", "color"],
      "circle-stroke-color": "#0f1f14",
      "circle-stroke-width": 2.5,
    },
  });
  // Brouillon : la ligne en cours, la fermeture du polygone, le cercle qui s'étire, les sommets posés.
  map.addLayer({
    id: "drawings-draft-fill",
    type: "fill",
    source: DRAW_DRAFT_SRC,
    filter: ["==", "$type", "Polygon"],
    paint: { "fill-color": DEFAULT_DRAWING_COLOR, "fill-opacity": 0.15 },
  });
  map.addLayer({
    id: "drawings-draft-line",
    type: "line",
    source: DRAW_DRAFT_SRC,
    filter: ["any", ["==", "$type", "LineString"], ["==", "$type", "Polygon"]],
    paint: { "line-color": DEFAULT_DRAWING_COLOR, "line-width": 2.5, "line-dasharray": [1.5, 1] },
  });
  map.addLayer({
    id: "drawings-draft-pt",
    type: "circle",
    source: DRAW_DRAFT_SRC,
    filter: ["==", "$type", "Point"],
    paint: { "circle-radius": 5, "circle-color": "#fff", "circle-stroke-color": DEFAULT_DRAWING_COLOR, "circle-stroke-width": 2.5 },
  });
  // Poignées du croquis sélectionné : sommets, centre, bord du cercle.
  map.addLayer({
    id: DRAW_HANDLE,
    type: "circle",
    source: DRAW_HANDLES_SRC,
    paint: {
      "circle-radius": 6.5,
      "circle-color": "#fff",
      "circle-stroke-color": ["match", ["get", "role"], "radius", "#3B82F6", "#0f1f14"],
      "circle-stroke-width": 2.5,
    },
  });
}

/** Les formes et les poignées du croquis sélectionné. */
export function applyDrawings(map: maplibregl.Map | null, drawings: readonly Drawing[], selectedId: string | null, editable: boolean): void {
  const src = map?.getSource(DRAW_SRC) as maplibregl.GeoJSONSource | undefined;
  if (!map || !src) return;
  src.setData(drawingsToGeoJSON(drawings, selectedId));
  const handles = map.getSource(DRAW_HANDLES_SRC) as maplibregl.GeoJSONSource | undefined;
  handles?.setData(editable ? handlesOf(drawings.find((d) => d.id === selectedId) ?? null) : EMPTY);
}

/** Le brouillon en cours de tracé (vide pour l'effacer). */
export function applyDraft(map: maplibregl.Map | null, kind: Drawing["kind"] | null, coords: readonly [number, number][], cursor: [number, number] | null): void {
  const src = map?.getSource(DRAW_DRAFT_SRC) as maplibregl.GeoJSONSource | undefined;
  src?.setData(draftToGeoJSON(kind, coords, cursor));
}

// --- étiquettes ---------------------------------------------------------------

export interface DrawingLabelsRuntime {
  markers: Map<string, { mk: maplibregl.Marker; el: HTMLDivElement; text: string; color: string; kind: Drawing["kind"]; selected: boolean }>;
}

export function createDrawingLabelsRuntime(): DrawingLabelsRuntime {
  return { markers: new Map() };
}

function styleLabel(el: HTMLDivElement, d: Drawing, selected: boolean, draggable: boolean): void {
  const color = d.color ?? DEFAULT_DRAWING_COLOR;
  el.textContent = d.label || "—";
  el.className = `croquis-etiquette${d.kind === "point" ? " croquis-etiquette-point" : ""}${selected ? " croquis-etiquette-active" : ""}`;
  el.style.borderColor = color;
  el.style.cursor = draggable ? "move" : "pointer";
  el.title = d.note ? `${d.label}\n${d.note}` : d.label;
}

/**
 * Synchronise les étiquettes avec les croquis : une par croquis, au bon
 * endroit, déplaçable quand l'opérateur édite (`onMove` reçoit la nouvelle
 * position ; pour un point, c'est le point lui-même qui bouge). Un clic
 * sélectionne le croquis.
 */
export function syncDrawingLabels(
  rt: DrawingLabelsRuntime,
  map: maplibregl.Map | null,
  drawings: readonly Drawing[],
  selectedId: string | null,
  editable: boolean,
  onSelect: (id: string) => void,
  onMove: (d: Drawing, ll: [number, number]) => void,
): void {
  if (!map) return;
  const seen = new Set<string>();
  for (const d of drawings) {
    seen.add(d.id);
    const pos = labelPosition(d);
    const selected = d.id === selectedId;
    const draggable = editable && selected;
    let entry = rt.markers.get(d.id);
    if (!entry) {
      const el = document.createElement("div");
      styleLabel(el, d, selected, draggable);
      const mk = new maplibregl.Marker({ element: el, anchor: d.kind === "point" ? "left" : "center", offset: d.kind === "point" ? [12, 0] : [0, 0], draggable })
        .setLngLat(pos)
        .addTo(map);
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onSelect(d.id);
      });
      mk.on("dragend", () => {
        const ll = mk.getLngLat();
        const current = rt.markers.get(d.id);
        if (current) onMove(dFrom(current, d), [ll.lng, ll.lat]);
      });
      entry = { mk, el, text: d.label, color: d.color ?? DEFAULT_DRAWING_COLOR, kind: d.kind, selected };
      rt.markers.set(d.id, entry);
    } else {
      styleLabel(entry.el, d, selected, draggable);
      entry.mk.setDraggable(draggable);
      // Pas de recentrage pendant un glisser : la position suivra `dragend`.
      const cur = entry.mk.getLngLat();
      if (Math.abs(cur.lng - pos[0]) > 1e-9 || Math.abs(cur.lat - pos[1]) > 1e-9) entry.mk.setLngLat(pos);
      entry.text = d.label;
      entry.selected = selected;
    }
    // Le croquis courant est celui de la liste (le marqueur garde l'identifiant, pas l'objet).
    (entry.el as HTMLDivElement & { __drawing?: Drawing }).__drawing = d;
  }
  for (const [id, entry] of rt.markers) {
    if (!seen.has(id)) {
      entry.mk.remove();
      rt.markers.delete(id);
    }
  }
}

/** Le croquis attaché au marqueur (mis à jour à chaque synchronisation), sinon celui d'origine. */
function dFrom(entry: DrawingLabelsRuntime["markers"] extends Map<string, infer V> ? V : never, fallback: Drawing): Drawing {
  return (entry.el as HTMLDivElement & { __drawing?: Drawing }).__drawing ?? fallback;
}

export function clearDrawingLabels(rt: DrawingLabelsRuntime): void {
  for (const entry of rt.markers.values()) entry.mk.remove();
  rt.markers.clear();
}
