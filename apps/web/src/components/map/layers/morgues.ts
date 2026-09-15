// ============================================================================
// components/map/layers/morgues.ts — les sites mortuaires sur la carte
//
// Un point par site : ardoise pour un site fixe, ambre pour une morgue mobile
// déployée (un site repliée ne se montre pas), avec son nom dès que la carte
// est assez proche. Un clic ouvre sa fiche dans le panneau de sélection.
// Idempotent : `setupStyle` rejoue tout après un changement de fond.
// ============================================================================

import maplibregl from "maplibre-gl";
import { useArgos } from "@/lib/store";
import type { MorgueSite } from "@/lib/types";

const VIDE: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

export function setupMorgueLayers(map: maplibregl.Map): void {
  if (map.getSource("morgues")) return;
  map.addSource("morgues", { type: "geojson", data: VIDE });
  map.addLayer({
    id: "morgues-halo",
    type: "circle",
    source: "morgues",
    paint: { "circle-radius": 13, "circle-color": ["get", "color"], "circle-opacity": 0.22 },
  });
  map.addLayer({
    id: "morgues-circle",
    type: "circle",
    source: "morgues",
    paint: { "circle-radius": 7, "circle-color": ["get", "color"], "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
  });
  map.addLayer({
    id: "morgues-label",
    type: "symbol",
    source: "morgues",
    minzoom: 8,
    layout: { "text-field": ["get", "label"], "text-size": 11, "text-offset": [0, 1.4], "text-anchor": "top", "text-font": ["Noto Sans Bold"] },
    paint: { "text-color": "#ffffff", "text-halo-color": "#1f2937", "text-halo-width": 1.4 },
  });
  map.on("mouseenter", "morgues-circle", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "morgues-circle", () => {
    map.getCanvas().style.cursor = "";
  });
  map.on("click", "morgues-circle", (e) => {
    const id = e.features?.[0]?.properties?.id;
    if (typeof id === "string") useArgos.getState().select("morgue", id);
  });
}

/** Les sites à montrer : ceux de la couche, mobiles repliées exclues. */
export function applyMorgues(map: maplibregl.Map | null, morgues: readonly MorgueSite[], on: boolean): void {
  const src = map?.getSource("morgues") as maplibregl.GeoJSONSource | undefined;
  if (!map || !src) return;
  src.setData({
    type: "FeatureCollection",
    features: on
      ? morgues
          .filter((m): m is MorgueSite & { ll: [number, number] } => Array.isArray(m.ll) && !(m.kind === "mobile" && !m.deployment))
          .map((m) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: m.ll },
            properties: { id: m.id, label: m.nom, color: m.kind === "mobile" ? "#d97706" : "#475569" },
          }))
      : [],
  });
}
