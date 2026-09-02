// ============================================================================
// components/map/layers/markers.ts — marqueurs DOM (unités, hôpitaux, hôpitaux
// de campagne, incidents, véhicules) et itinéraires d'animation des convois.
//
// Les marqueurs sont reconstruits en bloc à chaque changement de données ou de
// couche ; les véhicules avancent le long de leur route dans la boucle rAF.
// Code déplacé verbatim depuis MapCanvas.tsx (R-7).
// ============================================================================

import maplibregl from "maplibre-gl";
import { useArgos } from "@/lib/store";
import { hospKind } from "@/lib/hospitals";
import { fieldLL, fieldMarkerHTML, hospMarkerHTML, incMarkerHTML, unitMarkerHTML, vehMarkerHTML, vehPos } from "@/lib/map/markers";
import type { MarkerKind } from "@/lib/types";

export interface VehMarker {
  mk: maplibregl.Marker;
  routeIndex: number;
}

export class MarkersRuntime {
  markers: maplibregl.Marker[] = [];
  veh: VehMarker[] = [];
  /** Progression [0,1[ de chaque convoi sur sa route. */
  vehProg: number[] = [0.1, 0.45, 0.7];
}

export function mkEl(html: string, kind: MarkerKind, id: string) {
  const el = document.createElement("div");
  el.innerHTML = html;
  el.style.cursor = "pointer";
  // Marqueurs agrandis (lisibilité console/terrain) sans casser l'ancrage :
  // on met à l'échelle le contenu, pas l'élément positionné par MapLibre.
  const inner = el.firstElementChild as HTMLElement | null;
  if (inner) inner.style.transform = "scale(1.4)";
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    useArgos.getState().select(kind, id);
  });
  return el;
}

export function syncMarkers(rt: MarkersRuntime, map: maplibregl.Map | null) {
  if (!map) return;
  const state = useArgos.getState();
  const L = state.layers;
  const sm = state.selMarker;
  const isSel = (kind: MarkerKind, id: string) => !!sm && sm.kind === kind && sm.id === id;

  rt.markers.forEach((m) => m.remove());
  rt.markers = [];
  rt.veh.forEach((v) => v.mk.remove());
  rt.veh = [];

  const add = (ll: [number, number], el: HTMLElement) => {
    const mk = new maplibregl.Marker({ element: el }).setLngLat(ll).addTo(map);
    rt.markers.push(mk);
  };

  if (L.units) useArgos.getState().units.forEach((u) => add(u.ll, mkEl(unitMarkerHTML(u, isSel("unit", u.id)), "unit", u.id)));
  // Santé : deux couches distinctes (militaire / civil) — le réseau civil
  // compte plus de cent établissements et se masque d'un seul interrupteur.
  // Le civil est posé d'abord pour que les hôpitaux militaires, réseau de
  // commandement, restent au-dessus dans les villes où les deux coexistent.
  const hosps = useArgos.getState().hospitals;
  const addHosp = (h: (typeof hosps)[number]) => add(h.ll, mkEl(hospMarkerHTML(h, isSel("hosp", h.id)), "hosp", h.id));
  if (L.hospitalsCiv) hosps.filter((h) => hospKind(h) !== "mil").forEach(addHosp);
  if (L.hospitals) hosps.filter((h) => hospKind(h) === "mil").forEach(addHosp);
  if (L.field) state.fieldHosps.forEach((f) => add(fieldLL(f), mkEl(fieldMarkerHTML(f, isSel("field", f.nom)), "field", f.nom)));
  if (L.incidents) state.incidents.forEach((i) => add(i.ll, mkEl(incMarkerHTML(i, isSel("inc", i.id)), "inc", i.id)));

  if (L.vehicles) {
    useArgos.getState().vehRoutes.forEach((v, routeIndex) => {
      const el = mkEl(vehMarkerHTML(v, isSel("veh", v.id)), "veh", v.id);
      const start = vehPos(v.route, rt.vehProg[routeIndex]);
      const mk = new maplibregl.Marker({ element: el }).setLngLat(start).addTo(map);
      rt.veh.push({ mk, routeIndex });
    });
  }

  // Les aéronefs ne passent PAS par cette reconstruction : ils bougent en
  // continu, alors que `syncMarkers` détruit et recrée l'intégralité des
  // marqueurs (unités, centaines d'hôpitaux, incidents). Les rebâtir à chaque
  // rafraîchissement de position ferait clignoter toute la carte. Ils ont leur
  // propre registre, déplacé par `setLngLat`. Voir l'effet « suivi aérien ».

  if (map.getLayer("routes-line")) {
    map.setLayoutProperty("routes-line", "visibility", L.vehicles ? "visible" : "none");
  }
}

/** Avance chaque convoi le long de sa route (appelé à chaque image). */
export function animateVehicles(rt: MarkersRuntime, dt: number): void {
  rt.veh.forEach(({ mk, routeIndex }) => {
    const v = useArgos.getState().vehRoutes[routeIndex];
    rt.vehProg[routeIndex] = (rt.vehProg[routeIndex] + v.speed * dt) % 1;
    mk.setLngLat(vehPos(v.route, rt.vehProg[routeIndex]));
  });
}

/** Ligne des itinéraires de convois (appelée par setupStyle ; idempotente). */
export function setupRoutesLayer(map: maplibregl.Map): void {
    if (!map.getSource("routes")) {
      map.addSource("routes", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: useArgos.getState().vehRoutes.map((v) => ({
            type: "Feature" as const,
            properties: { id: v.id },
            geometry: { type: "LineString" as const, coordinates: v.route },
          })),
        },
      });
      map.addLayer({
        id: "routes-line",
        type: "line",
        source: "routes",
        paint: { "line-color": "#C9A84C", "line-width": 4.5, "line-dasharray": [2, 2], "line-opacity": 0.95 },
      });
    }
}
