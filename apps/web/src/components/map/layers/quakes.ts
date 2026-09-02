// ============================================================================
// components/map/layers/quakes.ts — la couche sismique (EMSC) : anneau pulsé,
// point plein, bandeau collé au séisme sélectionné.
// Code déplacé verbatim depuis MapCanvas.tsx (R-7).
// ============================================================================

import maplibregl from "maplibre-gl";
import { useArgos } from "@/lib/store";
import { FLUX } from "@/lib/i18n/flux";
import { qLocalTime, esc, qMagHex, QUAKE_COLOR, QUAKE_HALO_R, QUAKE_DOT_R } from "@/lib/map/canvas/quakes";
import type { Lang } from "@/lib/types";
import type { ArgosState } from "@/lib/store";

type Quake = ArgosState["quakes"][number];

/** Pose la couche (appelée par setupStyle ; idempotente). `bound` évite de doubler les gestionnaires de survol. */
export function setupQuakeLayers(map: maplibregl.Map, isMeasuring: () => boolean, bound: { current: boolean }): void {
    // Couche sismique (EMSC) : marqueur distinct — anneau pulsé (ping sonar)
    // + point plein bordé, couleur/rayon pilotés par la magnitude.
    if (!map.getSource("quakes")) {
      map.addSource("quakes", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      // Anneau de pulsation (rayon/opacité animés dans la boucle rAF).
      map.addLayer({
        id: "quakes-pulse",
        type: "circle",
        source: "quakes",
        paint: {
          "circle-radius": QUAKE_HALO_R,
          "circle-color": QUAKE_COLOR,
          "circle-opacity": 0.3,
        },
      });
      // Point plein bordé de blanc (plus gros qu'avant).
      map.addLayer({
        id: "quakes-circle",
        type: "circle",
        source: "quakes",
        paint: {
          "circle-radius": QUAKE_DOT_R,
          "circle-color": QUAKE_COLOR,
          "circle-opacity": 0.95,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
      // Alimentation initiale (les séismes peuvent déjà être chargés).
      const qs = useArgos.getState();
      (map.getSource("quakes") as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: qs.quakes.map((q) => ({ type: "Feature" as const, properties: { mag: q.mag, id: q.id }, geometry: { type: "Point" as const, coordinates: q.ll } })),
      });
      const qvis = qs.quakesOn ? "visible" : "none";
      map.setLayoutProperty("quakes-pulse", "visibility", qvis);
      map.setLayoutProperty("quakes-circle", "visibility", qvis);
      // Curseur main au survol d'un séisme (indique qu'il est cliquable).
      if (!bound.current) {
        map.on("mouseenter", "quakes-circle", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "quakes-circle", () => { map.getCanvas().style.cursor = isMeasuring() ? "crosshair" : ""; });
        bound.current = true;
      }
    }
}

/** Données + visibilité de la couche. */
export function syncQuakes(map: maplibregl.Map, quakes: Quake[], quakesOn: boolean): void {
  const src = map.getSource("quakes") as maplibregl.GeoJSONSource | undefined;
  if (!src) return; // source posée par setupStyle (populée à ce moment-là)
  src.setData({
    type: "FeatureCollection",
    features: quakes.map((q) => ({ type: "Feature" as const, properties: { mag: q.mag, id: q.id }, geometry: { type: "Point" as const, coordinates: q.ll } })),
  });
  const vis = quakesOn ? "visible" : "none";
  if (map.getLayer("quakes-circle")) map.setLayoutProperty("quakes-circle", "visibility", vis);
  if (map.getLayer("quakes-pulse")) map.setLayoutProperty("quakes-pulse", "visibility", vis);
}

/** Pulsation « ping sonar » (throttle ~15 im/s dans la boucle rAF). */
export function pulseQuakes(map: maplibregl.Map, now: number): void {
  if (!map.getLayer("quakes-pulse")) return;
  const tt = (now % 1800) / 1800; // 0 → 1
  map.setPaintProperty("quakes-pulse", "circle-radius", ["*", 1 + tt * 1.6, QUAKE_HALO_R]);
  map.setPaintProperty("quakes-pulse", "circle-opacity", 0.4 * (1 - tt));
}

/** Bandeau de détail COLLÉ au séisme (popup ancrée au point). L'appelant le retire. */
export function quakePopup(map: maplibregl.Map, q: Quake, lang: Lang): maplibregl.Popup {

  const fx = FLUX[lang];
  const mc = qMagHex(q.mag);
  const el = document.createElement("div");
  el.style.width = "300px";
  el.innerHTML = `
    <div style="display:flex;gap:10px;align-items:flex-start;padding:12px">
      <span style="display:inline-flex;min-width:44px;justify-content:center;align-items:center;border-radius:8px;padding:4px 8px;font-weight:700;font-family:monospace;background:${mc.bg};color:${mc.fg}">${q.mag.toFixed(1)}</span>
      <div style="min-width:0;flex:1;color:#fff">
        <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(q.region)}</div>
        <div style="margin-top:6px;font-family:monospace;font-size:11px;line-height:1.6;color:rgba(255,255,255,.72)">
          ${fx.seis_col_depth}: ${Math.round(Math.abs(q.depth))} ${fx.seis_km} · ${fx.seis_agency}: ${esc(q.agency)}<br/>
          ${fx.seis_local}: ${qLocalTime(q.time, lang)}<br/>
          ${q.lat.toFixed(3)}, ${q.lon.toFixed(3)}
        </div>
      </div>
      <button data-close aria-label="fermer" style="background:none;border:none;color:rgba(255,255,255,.6);cursor:pointer;padding:2px;font-size:15px;line-height:1">&#10005;</button>
    </div>`;
  el.querySelector("[data-close]")?.addEventListener("click", () => useArgos.getState().selectQuake(null));
  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 20, maxWidth: "320px", className: "quake-popup" })
    .setLngLat(q.ll)
    .setDOMContent(el)
    .addTo(map);
  return popup;
}
