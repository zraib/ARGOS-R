// ============================================================================
// components/map/layers/aircraft.ts — suivi aérien : marqueurs propres et
// navigation à l'estime entre deux échos (ADR 0004).
//
// Les aéronefs ne passent PAS par la reconstruction des marqueurs : ils bougent
// en continu, alors que `syncMarkers` détruit et recrée tout. Ils ont leur
// registre, déplacé par `setLngLat`. Code déplacé verbatim depuis MapCanvas.tsx (R-7).
// ============================================================================

import maplibregl from "maplibre-gl";
import { useArgos } from "@/lib/store";
import { extrapolate } from "@/lib/map/deadReckoning";
import { acftMarkerHTML } from "@/lib/map/markers";
import { ACFT_STALE_S } from "@/lib/map/canvas/weather-render";
import { mkEl } from "./markers";

export type AircraftRegistry = Map<string, { mk: maplibregl.Marker; el: HTMLElement; html: string }>;

/** Retire tous les marqueurs d'aéronefs. */
export function dropAircraft(registry: AircraftRegistry): void {
  registry.forEach((e) => e.mk.remove());
  registry.clear();
}

/** Une image : place ou déplace chaque appareil à sa position estimée. */
export function renderAircraft(map: maplibregl.Map, registry: AircraftRegistry): void {
  const now = Date.now();
  const st = useArgos.getState();
  const sel = st.selMarker;
  const vus = new Set<string>();

  st.aircraft.forEach((a) => {
    // Sans écho, pas de position : l'appareil reste listé dans le panneau
    // mais n'est pas placé sur la carte.
    if (!a.position) return;
    const id = a.aircraft.id;
    vus.add(id);

    const est = extrapolate(a.position, now);
    let entry = registry.get(id);
    if (!entry) {
      const el = mkEl("", "acft", id);
      const mk = new maplibregl.Marker({ element: el }).setLngLat(est.ll).addTo(map);
      entry = { mk, el, html: "" };
      registry.set(id, entry);
    }

    // Le balisage n'est réécrit que s'il change réellement (cap, état,
    // sélection) : réécrire innerHTML à chaque image saccaderait le rendu.
    const html = acftMarkerHTML(
      a.aircraft.label,
      a.aircraft.role,
      a.status,
      a.position.heading,
      sel?.kind === "acft" && sel.id === id,
      est.ageSec > ACFT_STALE_S,
    );
    if (html !== entry.html) {
      entry.el.innerHTML = html;
      // `mkEl` agrandit le contenu à la création ; réécrire le balisage
      // remplace cet enfant, il faut donc réappliquer l'échelle.
      const inner = entry.el.firstElementChild as HTMLElement | null;
      if (inner) inner.style.transform = "scale(1.4)";
      entry.html = html;
    }
    entry.mk.setLngLat(est.ll);
  });

  // Appareils retirés du suivi ou ayant perdu leur écho.
  registry.forEach((entry, id) => {
    if (!vus.has(id)) {
      entry.mk.remove();
      registry.delete(id);
    }
  });
}

// --- trajectoires (ADR 0016) --------------------------------------------------
//
// La trace récente de chaque appareil, tenue par l'API pour que tous les postes
// voient la même : une ligne par appareil, dans la couleur du rôle, sous les
// marqueurs. Rejouée par `setupStyle` après un changement de fond.

const TRAILS_SRC = "aircraft-trails";
const VIDE: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

export function setupAircraftTrailLayer(map: maplibregl.Map): void {
  if (map.getSource(TRAILS_SRC)) return;
  map.addSource(TRAILS_SRC, { type: "geojson", data: VIDE });
  map.addLayer({
    id: `${TRAILS_SRC}-line`,
    type: "line",
    source: TRAILS_SRC,
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": ["get", "color"], "line-width": 2, "line-opacity": 0.85, "line-dasharray": [2, 1.5] },
  });
}

/** Couleur d'une trace : celle du rôle de l'appareil (même palette que le marqueur). */
const ROLE_COLOR: Record<string, string> = {
  waterbomber: "#dc2626",
  helicopter: "#C9A84C",
  observation: "#2563eb",
  transport: "#15803d",
  medevac: "#db2777",
};

export function applyAircraftTrails(map: maplibregl.Map | null, states: readonly { aircraft: { id: string; role: string }; position: { ll: [number, number] } | null; trail?: { ll: [number, number] }[] }[], on: boolean): void {
  const src = map?.getSource(TRAILS_SRC) as maplibregl.GeoJSONSource | undefined;
  if (!map || !src) return;
  src.setData({
    type: "FeatureCollection",
    features: on
      ? states
          .filter((s) => (s.trail?.length ?? 0) + (s.position ? 1 : 0) >= 2)
          .map((s) => ({
            type: "Feature" as const,
            geometry: { type: "LineString" as const, coordinates: [...(s.trail ?? []).map((p) => p.ll), ...(s.position ? [s.position.ll] : [])] },
            properties: { id: s.aircraft.id, color: ROLE_COLOR[s.aircraft.role] ?? "#C9A84C" },
          }))
      : [],
  });
}
