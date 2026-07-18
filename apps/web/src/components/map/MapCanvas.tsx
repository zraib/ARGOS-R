"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useArgos } from "@/lib/store";
import { canReportIncident } from "@/lib/roles";
import { MAP_CENTER, MAP_STYLE, MAP_ZOOM } from "@/lib/map/style";
import {
  fieldLL,
  fieldMarkerHTML,
  hospMarkerHTML,
  incMarkerHTML,
  unitMarkerHTML,
  vehMarkerHTML,
  vehPos,
} from "@/lib/map/markers";
import type { MarkerKind } from "@/lib/types";

interface VehMarker {
  mk: maplibregl.Marker;
  routeIndex: number;
}

/** Carte opérationnelle MapLibre : marqueurs en direct, convois animés, bascule 2D/3D + fond. */
export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const vehMarkersRef = useRef<VehMarker[]>([]);
  const vehProgRef = useRef<number[]>([0.1, 0.45, 0.7]);
  const rafRef = useRef<number>(0);
  const readyRef = useRef(false);

  // abonnements qui doivent déclencher une re-synchro des marqueurs
  const layers = useArgos((s) => s.layers);
  const selMarker = useArgos((s) => s.selMarker);
  const incidents = useArgos((s) => s.incidents);
  const fieldHosps = useArgos((s) => s.fieldHosps);
  const map3d = useArgos((s) => s.map3d);
  const mapSat = useArgos((s) => s.mapSat);

  const mkEl = (html: string, kind: MarkerKind, id: string) => {
    const el = document.createElement("div");
    el.innerHTML = html;
    el.style.cursor = "pointer";
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      useArgos.getState().select(kind, id);
    });
    return el;
  };

  const syncMarkers = () => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const state = useArgos.getState();
    const L = state.layers;
    const sm = state.selMarker;
    const isSel = (kind: MarkerKind, id: string) => !!sm && sm.kind === kind && sm.id === id;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    vehMarkersRef.current.forEach((v) => v.mk.remove());
    vehMarkersRef.current = [];

    const add = (ll: [number, number], el: HTMLElement) => {
      const mk = new maplibregl.Marker({ element: el }).setLngLat(ll).addTo(map);
      markersRef.current.push(mk);
    };

    if (L.units) useArgos.getState().units.forEach((u) => add(u.ll, mkEl(unitMarkerHTML(u, isSel("unit", u.id)), "unit", u.id)));
    if (L.hospitals) useArgos.getState().hospitals.forEach((h) => add(h.ll, mkEl(hospMarkerHTML(h, isSel("hosp", h.id)), "hosp", h.id)));
    if (L.field) state.fieldHosps.forEach((f) => add(fieldLL(f), mkEl(fieldMarkerHTML(isSel("field", f.nom)), "field", f.nom)));
    if (L.incidents) state.incidents.forEach((i) => add(i.ll, mkEl(incMarkerHTML(i, isSel("inc", i.id)), "inc", i.id)));

    if (L.vehicles) {
      useArgos.getState().vehRoutes.forEach((v, routeIndex) => {
        const el = mkEl(vehMarkerHTML(v, isSel("veh", v.id)), "veh", v.id);
        const start = vehPos(v.route, vehProgRef.current[routeIndex]);
        const mk = new maplibregl.Marker({ element: el }).setLngLat(start).addTo(map);
        vehMarkersRef.current.push({ mk, routeIndex });
      });
    }

    if (map.getLayer("routes-line")) {
      map.setLayoutProperty("routes-line", "visibility", L.vehicles ? "visible" : "none");
    }
  };

  const startVehAnim = () => {
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      vehMarkersRef.current.forEach(({ mk, routeIndex }) => {
        const v = useArgos.getState().vehRoutes[routeIndex];
        vehProgRef.current[routeIndex] = (vehProgRef.current[routeIndex] + v.speed * dt) % 1;
        mk.setLngLat(vehPos(v.route, vehProgRef.current[routeIndex]));
      });
      rafRef.current = requestAnimationFrame(step);
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
  };

  // --- initialisation de la carte (une fois) ---
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: MAP_CENTER,
      zoom: MAP_ZOOM,
      pitch: 0,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");

    // Shift + clic droit : déclarer un incident à l'endroit cliqué — le wizard
    // s'ouvre pré-rempli avec les coordonnées (si le rôle y est autorisé).
    map.on("contextmenu", (e) => {
      if (!e.originalEvent.shiftKey) return;
      e.preventDefault();
      const st = useArgos.getState();
      if (!canReportIncident(st.role)) return;
      st.openWizard([e.lngLat.lng, e.lngLat.lat]);
    });

    // Les marqueurs sont des surcouches DOM indépendantes du chargement des
    // tuiles : on les ajoute tout de suite — la carte reste utilisable même là où
    // les tuiles de fond externes sont lentes ou injoignables (air-gap, réseaux restreints).
    readyRef.current = true;
    syncMarkers();
    startVehAnim();

    // La ligne d'itinéraires + terrain + bascules de fond ont besoin du style
    // analysé. On s'accroche au premier signal de disponibilité (`styledata` se
    // déclenche sans tuiles).
    const setupStyle = () => {
      if (!map.getStyle() || !map.isStyleLoaded()) return;
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
          paint: { "line-color": "#C9A84C", "line-width": 2.5, "line-dasharray": [2, 2], "line-opacity": 0.9 },
        });
      }
      const st = useArgos.getState();
      map.setLayoutProperty("routes-line", "visibility", st.layers.vehicles ? "visible" : "none");
      applyBase(st.mapSat);
      if (st.map3d) apply3d(true);
    };
    if (map.isStyleLoaded()) setupStyle();
    else {
      map.on("styledata", setupStyle);
      map.once("load", setupStyle);
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
      markersRef.current = [];
      vehMarkersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- re-synchro des marqueurs si données / sélection / couche changent ---
  useEffect(() => {
    syncMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, selMarker, incidents, fieldHosps]);

  // --- bascule terrain 3D ---
  const apply3d = (on: boolean) => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (on) {
      if (!map.getTerrain()) map.setTerrain({ source: "dem", exaggeration: 1.4 });
      map.easeTo({ pitch: 62, zoom: Math.max(map.getZoom(), 8.5), center: [-8.3, 31.15], bearing: -18, duration: 1600 });
    } else {
      map.setTerrain(null);
      map.easeTo({ pitch: 0, bearing: 0, duration: 1200 });
    }
  };
  useEffect(() => {
    if (readyRef.current) apply3d(map3d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map3d]);

  // --- bascule du fond (satellite / plan) ---
  const applyBase = (sat: boolean) => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    map.setLayoutProperty("sat", "visibility", sat ? "visible" : "none");
    map.setLayoutProperty("plan", "visibility", sat ? "none" : "visible");
    map.setLayoutProperty("lbl", "visibility", sat ? "visible" : "none");
  };
  useEffect(() => {
    if (readyRef.current) applyBase(mapSat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapSat]);

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
}
