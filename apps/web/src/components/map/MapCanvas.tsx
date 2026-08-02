"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useArgos, useDict } from "@/lib/store";
import { canReportIncident } from "@/lib/roles";
import { MAP_CENTER, MAP_STYLE, MAP_ZOOM } from "@/lib/map/style";
import { routeThrough, type RouteResult } from "@/lib/map/routing";
import { OVERLAY_STYLE } from "@/lib/map/overlay";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
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

// --- Altitude : échantillonnage direct du MNT « terrarium » -----------------
// Indépendant du terrain 3D (queryTerrainElevation n'est fiable que si le mesh
// de terrain est monté). Encodage terrarium : alt = R*256 + G + B/256 - 32768.
const DEM_Z = 11;
const demCache = new Map<string, ImageData | null>();

function lngLatToTile(lng: number, lat: number, z: number) {
  const n = 2 ** z;
  const fx = ((lng + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return { xt: Math.floor(fx), yt: Math.floor(fy), px: Math.min(255, Math.floor((fx % 1) * 256)), py: Math.min(255, Math.floor((fy % 1) * 256)) };
}

async function demElevation(lng: number, lat: number): Promise<number | null> {
  const { xt, yt, px, py } = lngLatToTile(lng, lat, DEM_Z);
  const key = `${DEM_Z}/${xt}/${yt}`;
  if (!demCache.has(key)) {
    try {
      // Passer par fetch + blob : un <img crossOrigin> sur ce bucket ne résout
      // pas, alors que fetch aboutit ; le blob est same-origin donc le canvas
      // n'est pas « tainted » et getImageData reste autorisé.
      const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${DEM_Z}/${xt}/${yt}.png`);
      if (!res.ok) throw new Error(String(res.status));
      const bmp = await createImageBitmap(await res.blob());
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 256;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(bmp, 0, 0);
      demCache.set(key, ctx.getImageData(0, 0, 256, 256));
    } catch {
      demCache.set(key, null);
    }
  }
  const data = demCache.get(key);
  if (!data) return null;
  const i = (py * 256 + px) * 4;
  return data.data[i] * 256 + data.data[i + 1] + data.data[i + 2] / 256 - 32768;
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
  // Lecture position curseur : écriture directe dans le DOM (pas de state →
  // pas de re-rendu React à chaque mouvement de souris).
  const latRef = useRef<HTMLSpanElement | null>(null);
  const lngRef = useRef<HTMLSpanElement | null>(null);
  const altRef = useRef<HTMLSpanElement | null>(null);
  const altSeqRef = useRef(0);
  // Outil de mesure multi-points.
  const [measureOn, setMeasureOn] = useState(false);
  const [pts, setPts] = useState<[number, number][]>([]);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const measureOnRef = useRef(false);
  measureOnRef.current = measureOn;

  // abonnements qui doivent déclencher une re-synchro des marqueurs
  const layers = useArgos((s) => s.layers);
  const selMarker = useArgos((s) => s.selMarker);
  const incidents = useArgos((s) => s.incidents);
  const fieldHosps = useArgos((s) => s.fieldHosps);
  const map3d = useArgos((s) => s.map3d);
  const mapSat = useArgos((s) => s.mapSat);
  const t = useDict();

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

    // Lecture continue de la position du curseur (+ altitude via le MNT).
    map.on("mousemove", (e) => {
      if (latRef.current) latRef.current.textContent = `${e.lngLat.lat.toFixed(5)}°`;
      if (lngRef.current) lngRef.current.textContent = `${e.lngLat.lng.toFixed(5)}°`;
      // Altitude : échantillon MNT (asynchrone, tuiles mises en cache).
      const seq = ++altSeqRef.current;
      void demElevation(e.lngLat.lng, e.lngLat.lat).then((alt) => {
        if (seq !== altSeqRef.current || !altRef.current) return; // résultat périmé
        altRef.current.textContent = alt == null ? "—" : `${Math.round(alt)} m`;
      });
    });

    // Mesure : chaque clic ajoute un point à la polyligne.
    map.on("click", (e) => {
      if (!measureOnRef.current) return;
      setPts((prev) => [...prev, [e.lngLat.lng, e.lngLat.lat]]);
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
      // Couche de mesure (polyligne + sommets).
      if (!map.getSource("measure")) {
        map.addSource("measure", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({
          id: "measure-line",
          type: "line",
          source: "measure",
          filter: ["==", "$type", "LineString"],
          paint: { "line-color": "#38BDF8", "line-width": 2.5, "line-dasharray": [1.5, 1] },
        });
        map.addLayer({
          id: "measure-pt",
          type: "circle",
          source: "measure",
          filter: ["==", "$type", "Point"],
          paint: { "circle-radius": 4, "circle-color": "#38BDF8", "circle-stroke-color": "#0f1f14", "circle-stroke-width": 1.5 },
        });
      }
      const st = useArgos.getState();
      map.setLayoutProperty("routes-line", "visibility", st.layers.vehicles ? "visible" : "none");
      applyBase(st.mapSat);
      // Terrain toujours posé (exagération nulle en 2D) → altitude interrogeable.
      apply3d(st.map3d);
    };
    if (map.isStyleLoaded()) setupStyle();
    else {
      map.on("styledata", setupStyle);
      map.once("load", setupStyle);
    }

    // Le conteneur change de taille (plein écran, repli du rail) → resize du canvas.
    const ro = new ResizeObserver(() => mapRef.current?.resize());
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
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

  // --- recentrage/zoom sur l'élément sélectionné (ex. « voir sur la carte ») ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selMarker) return;
    const st = useArgos.getState();
    const ll =
      selMarker.kind === "inc" ? st.incidents.find((i) => i.id === selMarker.id)?.ll
      : selMarker.kind === "unit" ? st.units.find((u) => u.id === selMarker.id)?.ll
      : selMarker.kind === "hosp" ? st.hospitals.find((h) => h.id === selMarker.id)?.ll
      : undefined;
    if (ll) map.flyTo({ center: ll, zoom: Math.max(map.getZoom(), 10.5), duration: 1200 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selMarker]);

  // --- bascule terrain 3D ---
  const apply3d = (on: boolean) => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    // Relief 3D uniquement en mode 3D (l'altitude sous le curseur est lue
    // séparément via un échantillonnage direct du MNT, cf. demElevation).
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

  // --- calcul d'itinéraire (réseau routier) à chaque changement de points ---
  useEffect(() => {
    if (pts.length < 2) { setRoute(null); return; }
    let cancelled = false;
    void routeThrough(pts).then((r) => { if (!cancelled) setRoute(r); });
    return () => { cancelled = true; };
  }, [pts]);

  // --- couche de mesure : tracé de l'itinéraire + sommets saisis ---
  useEffect(() => {
    const src = mapRef.current?.getSource("measure") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const line = route?.coords ?? pts;
    src.setData({
      type: "FeatureCollection",
      features: [
        ...(line.length > 1
          ? [{ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: line } }]
          : []),
        ...pts.map((p) => ({ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: p } })),
      ],
    });
  }, [pts, route]);

  // Curseur en croix tant que la mesure est active.
  useEffect(() => {
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = measureOn ? "crosshair" : "";
  }, [measureOn]);

  const panel = "rounded-lg px-2.5 py-1.5 text-[11px] shadow-lg";
  const movePt = (i: number, d: number) =>
    setPts((p) => {
      const j = i + d;
      if (j < 0 || j >= p.length) return p;
      const n = [...p];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const removePt = (i: number) => setPts((p) => p.filter((_, k) => k !== i));
  const stepBtn = "rounded p-0.5 text-white/60 transition-colors hover:text-or-400 disabled:opacity-25";

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      {/* Points de mesure : réordonner (↑/↓) et supprimer (✕) */}
      {pts.length > 0 && (
        <div className="absolute z-10 flex w-[220px] flex-col gap-1 rounded-lg p-2 shadow-lg" style={{ ...OVERLAY_STYLE, bottom: 84, insetInlineStart: 8 }}>
          <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-white/60">{t.map_points}</div>
          {pts.map((p, i) => (
            <div key={`${p[0]},${p[1]},${i}`} className="flex items-center gap-1 text-[10px] text-white/90">
              <span className="w-3 shrink-0 font-bold text-or-400">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-mono">{p[1].toFixed(4)}, {p[0].toFixed(4)}</span>
              <button onClick={() => movePt(i, -1)} disabled={i === 0} className={stepBtn} aria-label={t.map_points}>
                <Icon path={UI_ICONS.caretDown} size={11} strokeWidth={2.5} className="rotate-180" />
              </button>
              <button onClick={() => movePt(i, 1)} disabled={i === pts.length - 1} className={stepBtn} aria-label={t.map_points}>
                <Icon path={UI_ICONS.caretDown} size={11} strokeWidth={2.5} />
              </button>
              <button onClick={() => removePt(i)} className="rounded p-0.5 text-danger-400 transition-colors hover:text-danger-300" aria-label={t.flt_clear}>
                <Icon path={UI_ICONS.close} size={11} strokeWidth={2.5} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Outil de mesure (multi-points, itinéraire routier) */}
      <div className="absolute z-10 flex items-center gap-1.5" style={{ bottom: 46, insetInlineStart: 8 }}>
        <button
          onClick={() => setMeasureOn((o) => !o)}
          className={`${panel} font-bold transition-colors ${measureOn ? "bg-or-500 text-rdia-600" : "text-white/90 hover:text-or-400"}`}
          style={measureOn ? undefined : OVERLAY_STYLE}
        >
          {t.map_measure}
        </button>
        {route && (
          <span className={`${panel} font-mono text-white/90`} style={OVERLAY_STYLE}>
            {route.km.toFixed(1)} km
            {route.min != null ? ` · ${route.min} min` : ""}
            <span className={route.road ? "text-or-400" : "text-white/50"}> · {route.road ? t.map_route : t.map_direct}</span>
          </span>
        )}
        {pts.length > 0 && (
          <button onClick={() => { setPts([]); setRoute(null); }} className={`${panel} font-semibold text-danger-400 hover:text-danger-300`} style={OVERLAY_STYLE}>
            {t.flt_clear}
          </button>
        )}
        {measureOn && pts.length === 0 && (
          <span className={`${panel} text-white/70`} style={OVERLAY_STYLE}>{t.map_measure_hint}</span>
        )}
      </div>

      {/* Position du curseur : latitude / longitude / altitude */}
      <div
        className={`pointer-events-none absolute z-10 flex items-center gap-3 font-mono text-white/90 ${panel}`}
        style={{ ...OVERLAY_STYLE, bottom: 8, insetInlineStart: 8 }}
      >
        <span className="flex gap-1"><span className="text-or-400">{t.wz_lat}</span><span ref={latRef}>—</span></span>
        <span className="flex gap-1"><span className="text-or-400">{t.wz_lng}</span><span ref={lngRef}>—</span></span>
        <span className="flex gap-1"><span className="text-or-400">{t.map_alt}</span><span ref={altRef}>—</span></span>
      </div>
    </div>
  );
}
