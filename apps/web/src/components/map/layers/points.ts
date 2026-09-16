// ============================================================================
// components/map/layers/points.ts — une couche de POINTS nommés, générique
//
// Un cercle par entité, une couleur par état, le nom au survol, la fiche au
// clic. Pas de couche « symbol » : le style de la carte n'a pas de serveur de
// glyphes (ni en fond externe, ni sans les polices du mode souverain) et
// MapLibre rejetterait la couche — une infobulle DOM suffit et marche partout.
//
// Les sites mortuaires, les abris et les traceurs sont trois habillages de la
// même mécanique : une source GeoJSON, un halo, un cercle, une infobulle, un
// clic. Idempotent : `setupStyle` rejoue tout après un changement de fond.
// ============================================================================

import maplibregl from "maplibre-gl";
import { useArgos } from "@/lib/store";
import type { MarkerKind } from "@/lib/types";

const VIDE: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/** Ce qu'une entité doit fournir pour être posée : où, quel nom, quelle couleur. */
export interface PointFeature {
  id: string;
  label: string;
  ll: [number, number];
  color: string;
}

export interface PointLayerOptions {
  /** Rayon du cercle en pixels (7 par défaut). */
  radius?: number;
  /** Rayon du halo (13 par défaut) ; 0 pour aucun halo. */
  halo?: number;
  /** Trait du cercle (blanc, 2 px par défaut). */
  stroke?: string;
}

/** Crée la source et les couches `<id>-halo` / `<id>-circle`, avec infobulle et clic vers `select(kind, …)`. */
export function setupPointLayers(map: maplibregl.Map, id: string, kind: MarkerKind, opt: PointLayerOptions = {}): void {
  if (map.getSource(id)) return;
  const radius = opt.radius ?? 7;
  const halo = opt.halo ?? 13;
  map.addSource(id, { type: "geojson", data: VIDE });
  if (halo > 0) {
    map.addLayer({
      id: `${id}-halo`,
      type: "circle",
      source: id,
      paint: { "circle-radius": halo, "circle-color": ["get", "color"], "circle-opacity": 0.22 },
    });
  }
  map.addLayer({
    id: `${id}-circle`,
    type: "circle",
    source: id,
    paint: { "circle-radius": radius, "circle-color": ["get", "color"], "circle-stroke-color": opt.stroke ?? "#ffffff", "circle-stroke-width": 2 },
  });
  const bulle = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: `${id}-bulle` });
  map.on("mouseenter", `${id}-circle`, (e) => {
    map.getCanvas().style.cursor = "pointer";
    const f = e.features?.[0];
    const label = f?.properties?.label;
    const geom = f?.geometry;
    if (typeof label !== "string" || geom?.type !== "Point") return;
    bulle.setLngLat(geom.coordinates as [number, number]).setText(label).addTo(map);
  });
  map.on("mouseleave", `${id}-circle`, () => {
    map.getCanvas().style.cursor = "";
    bulle.remove();
  });
  map.on("click", `${id}-circle`, (e) => {
    const entityId = e.features?.[0]?.properties?.id;
    if (typeof entityId === "string") useArgos.getState().select(kind, entityId);
  });
}

/** Remplace le contenu de la couche ; `on` à faux la vide sans la détruire. */
export function applyPoints(map: maplibregl.Map | null, id: string, points: readonly PointFeature[], on: boolean): void {
  const src = map?.getSource(id) as maplibregl.GeoJSONSource | undefined;
  if (!map || !src) return;
  src.setData({
    type: "FeatureCollection",
    features: on
      ? points.map((p) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: p.ll },
          properties: { id: p.id, label: p.label, color: p.color },
        }))
      : [],
  });
}

/** Vrai si l'entité porte une position exploitable. */
export function hasLL<T extends { ll?: [number, number] | null }>(x: T): x is T & { ll: [number, number] } {
  return Array.isArray(x.ll) && x.ll.length === 2 && Number.isFinite(x.ll[0]) && Number.isFinite(x.ll[1]);
}
