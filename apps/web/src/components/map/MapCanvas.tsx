"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useArgos, useDict } from "@/lib/store";
import { FLUX } from "@/lib/i18n/flux";
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

/** Heure locale compacte pour le bandeau séisme. */
function qLocalTime(iso: string, lang: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const locale = lang === "ar" ? "ar-MA" : lang === "en" ? "en-GB" : "fr-FR";
  return d.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

/** Échappe le texte externe (EMSC) avant injection HTML dans la popup. */
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));
}

/** Couleur hex du bandeau selon la magnitude. */
function qMagHex(m: number): { bg: string; fg: string } {
  if (m >= 5) return { bg: "#ef4444", fg: "#ffffff" };
  if (m >= 4) return { bg: "#C9A84C", fg: "#12210f" };
  if (m >= 3) return { bg: "#fbbf24", fg: "#3a2f0a" };
  return { bg: "#9ca3af", fg: "#1f2937" };
}

// Style de la couche sismique (partagé setupStyle / animation de pulsation).
const QUAKE_COLOR: maplibregl.DataDrivenPropertyValueSpecification<string> =
  ["step", ["get", "mag"], "#94a3b8", 3, "#fbbf24", 4, "#f59e0b", 5, "#ef4444"];
const QUAKE_HALO_R: maplibregl.DataDrivenPropertyValueSpecification<number> =
  ["interpolate", ["linear"], ["get", "mag"], 3, 12, 5, 30, 7, 52];
const QUAKE_DOT_R: maplibregl.DataDrivenPropertyValueSpecification<number> =
  ["interpolate", ["linear"], ["get", "mag"], 2, 5, 5, 13, 7, 22];

// --- couches météo (grille de conditions actuelles servie par l'API) --------
// Trois couches superposables et lisibles ensemble : la température est un
// champ coloré diffus, les précipitations des taches bleues (uniquement là où
// il pleut), le vent des anneaux ajourés dont le rayon suit la vitesse.
const WX_TEMP_COLOR: maplibregl.DataDrivenPropertyValueSpecification<string> =
  ["interpolate", ["linear"], ["get", "temp"], 0, "#3b82f6", 12, "#22c55e", 24, "#f59e0b", 34, "#ef4444", 44, "#7f1d1d"];
const WX_FIELD_R: maplibregl.DataDrivenPropertyValueSpecification<number> =
  ["interpolate", ["linear"], ["zoom"], 4, 34, 8, 90];

/** Carte opérationnelle MapLibre : marqueurs en direct, convois animés, bascule 2D/3D + fond. */
export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const vehMarkersRef = useRef<VehMarker[]>([]);
  const vehProgRef = useRef<number[]>([0.1, 0.45, 0.7]);
  const rafRef = useRef<number>(0);
  const readyRef = useRef(false);
  const quakeBound = useRef(false); // handlers hover/clic de la couche séismes posés une fois
  const quakePopupRef = useRef<maplibregl.Popup | null>(null); // bandeau collé au séisme
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
  // Couche sismique (EMSC) : points colorés/dimensionnés par magnitude.
  const quakes = useArgos((s) => s.quakes);
  const quakesOn = useArgos((s) => s.quakesOn);
  const quakeFocus = useArgos((s) => s.quakeFocus);
  const focusQuake = useArgos((s) => s.focusQuake);
  const quakeSelected = useArgos((s) => s.quakeSelected);
  const wxGrid = useArgos((s) => s.wxGrid);
  const wxLayers = useArgos((s) => s.wxLayers);
  const lang = useArgos((s) => s.lang);
  const t = useDict();

  const mkEl = (html: string, kind: MarkerKind, id: string) => {
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
    let lastPulse = 0;
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      vehMarkersRef.current.forEach(({ mk, routeIndex }) => {
        const v = useArgos.getState().vehRoutes[routeIndex];
        vehProgRef.current[routeIndex] = (vehProgRef.current[routeIndex] + v.speed * dt) % 1;
        mk.setLngLat(vehPos(v.route, vehProgRef.current[routeIndex]));
      });
      // Pulsation « ping sonar » de la couche sismique (throttle ~15 fps).
      if (now - lastPulse > 66) {
        lastPulse = now;
        const map = mapRef.current;
        if (map && map.getLayer("quakes-pulse")) {
          const tt = (now % 1800) / 1800; // 0 → 1
          map.setPaintProperty("quakes-pulse", "circle-radius", ["*", 1 + tt * 1.6, QUAKE_HALO_R]);
          map.setPaintProperty("quakes-pulse", "circle-opacity", 0.4 * (1 - tt));
        }
      }
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

    // Bouton « recentrer » ajouté sous la boussole (revient au cadrage national).
    const centerCtrl: maplibregl.IControl = {
      onAdd() {
        const div = document.createElement("div");
        div.className = "maplibregl-ctrl maplibregl-ctrl-group";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.title = "Recentrer";
        btn.setAttribute("aria-label", "Recentrer");
        btn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin:auto"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><path d="M12 1.5v3 M12 19.5v3 M1.5 12h3 M19.5 12h3"/></svg>`;
        btn.addEventListener("click", () => map.easeTo({ center: MAP_CENTER, zoom: MAP_ZOOM, pitch: 0, bearing: 0, duration: 900 }));
        div.appendChild(btn);
        return div;
      },
      onRemove() {},
    };
    map.addControl(centerCtrl, "bottom-right");

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

    // Clic sur la carte : en mode mesure → ajoute un point ; sinon → sélectionne
    // un séisme si le clic tombe sur un marqueur (bandeau de détail).
    map.on("click", (e) => {
      if (measureOnRef.current) {
        setPts((prev) => [...prev, [e.lngLat.lng, e.lngLat.lat]]);
        return;
      }
      if (!map.getLayer("quakes-circle")) return;
      const hit = map.queryRenderedFeatures(e.point, { layers: ["quakes-circle"] })[0];
      const id = hit?.properties?.id;
      if (typeof id === "string") {
        const q = useArgos.getState().quakes.find((x) => x.id === id);
        if (q) useArgos.getState().selectQuake(q);
      }
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
          paint: { "line-color": "#C9A84C", "line-width": 4.5, "line-dasharray": [2, 2], "line-opacity": 0.95 },
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
          paint: { "line-color": "#38BDF8", "line-width": 4, "line-dasharray": [1.5, 1] },
        });
        map.addLayer({
          id: "measure-pt",
          type: "circle",
          source: "measure",
          filter: ["==", "$type", "Point"],
          paint: { "circle-radius": 6, "circle-color": "#38BDF8", "circle-stroke-color": "#0f1f14", "circle-stroke-width": 2.5 },
        });
      }
      // Couches météo : posées AVANT la couche sismique pour rester en dessous.
      if (!map.getSource("wx")) {
        map.addSource("wx", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        // Température : champ coloré diffus.
        map.addLayer({
          id: "wx-temp",
          type: "circle",
          source: "wx",
          layout: { visibility: "none" },
          paint: { "circle-radius": WX_FIELD_R, "circle-color": WX_TEMP_COLOR, "circle-blur": 0.6, "circle-opacity": 0.7 },
        });
        // Précipitations : taches bleues uniquement là où il pleut.
        map.addLayer({
          id: "wx-precip",
          type: "circle",
          source: "wx",
          filter: [">", ["get", "precip"], 0],
          layout: { visibility: "none" },
          paint: {
            "circle-radius": WX_FIELD_R,
            "circle-color": ["interpolate", ["linear"], ["get", "precip"], 0, "#93c5fd", 3, "#3b82f6", 12, "#1d4ed8"],
            "circle-blur": 0.75,
            "circle-opacity": ["interpolate", ["linear"], ["get", "precip"], 0, 0.25, 5, 0.7],
          },
        });
        // Vent : anneaux ajourés (rayon = vitesse) lisibles par-dessus le champ.
        map.addLayer({
          id: "wx-wind",
          type: "circle",
          source: "wx",
          layout: { visibility: "none" },
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["get", "wind"], 0, 5, 30, 16, 70, 30],
            "circle-color": "rgba(0,0,0,0)",
            "circle-stroke-width": 2.5,
            "circle-stroke-color": ["interpolate", ["linear"], ["get", "wind"], 0, "#a7f3d0", 20, "#34d399", 40, "#fbbf24", 65, "#ef4444"],
            "circle-stroke-opacity": 0.95,
          },
        });
      }
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
        if (!quakeBound.current) {
          map.on("mouseenter", "quakes-circle", () => { map.getCanvas().style.cursor = "pointer"; });
          map.on("mouseleave", "quakes-circle", () => { map.getCanvas().style.cursor = measureOnRef.current ? "crosshair" : ""; });
          quakeBound.current = true;
        }
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
    // La bascule 2D/3D ne fait qu'INCLINER la vue : le centre, le zoom et le cap
    // sont conservés, on reste donc exactement là où l'opérateur regardait.
    if (on) {
      if (!map.getTerrain()) map.setTerrain({ source: "dem", exaggeration: 1.4 });
      map.easeTo({ pitch: 60, duration: 900 });
    } else {
      map.setTerrain(null);
      map.easeTo({ pitch: 0, duration: 700 });
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

  // --- couche sismique : mise à jour des données + visibilité ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const src = map.getSource("quakes") as maplibregl.GeoJSONSource | undefined;
    if (!src) return; // source posée par setupStyle (populée à ce moment-là)
    src.setData({
      type: "FeatureCollection",
      features: quakes.map((q) => ({ type: "Feature" as const, properties: { mag: q.mag, id: q.id }, geometry: { type: "Point" as const, coordinates: q.ll } })),
    });
    const vis = quakesOn ? "visible" : "none";
    if (map.getLayer("quakes-circle")) map.setLayoutProperty("quakes-circle", "visibility", vis);
    if (map.getLayer("quakes-pulse")) map.setLayoutProperty("quakes-pulse", "visibility", vis);
  }, [quakes, quakesOn]);

  // --- couches météo : alimentation de la grille + visibilité par couche ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const src = map.getSource("wx") as maplibregl.GeoJSONSource | undefined;
    if (!src) return; // source posée par setupStyle
    src.setData({
      type: "FeatureCollection",
      features: wxGrid.map((p) => ({
        type: "Feature" as const,
        properties: { temp: p.temp, wind: p.wind, precip: p.precip },
        geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
      })),
    });
    ([["wx-temp", wxLayers.temp], ["wx-wind", wxLayers.wind], ["wx-precip", wxLayers.precip]] as const)
      .forEach(([id, on]) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
      });
  }, [wxGrid, wxLayers]);

  // --- centrage sur un séisme (« voir sur la carte ») puis purge du focus ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !quakeFocus) return;
    map.flyTo({ center: quakeFocus.ll, zoom: Math.max(map.getZoom(), 6.5), duration: 1400 });
    focusQuake(null);
  }, [quakeFocus, focusQuake]);

  // --- bandeau de détail COLLÉ au séisme sélectionné (popup ancrée au point) ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    quakePopupRef.current?.remove();
    quakePopupRef.current = null;
    if (!quakeSelected) return;
    const q = quakeSelected;
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
    quakePopupRef.current = popup;
    return () => { popup.remove(); };
  }, [quakeSelected, lang]);

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
