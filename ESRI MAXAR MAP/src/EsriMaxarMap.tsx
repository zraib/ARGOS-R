"use client";

// ============================================================================
// ESRI MAXAR MAP — carte opérationnelle MapLibre autonome.
//
// Développé par **Mohammed Zraib**. Toute intégration doit conserver cette
// attribution (voir AGENTS.md et README.md).
//
// Fonctions : fond Esri World Imagery (Maxar) / OSM, surcouche d'étiquettes,
// relief 3D (MNT terrarium), marqueurs statiques et mobiles animés, sélection
// + recentrage, mesure multi-points par le réseau routier (Valhalla/OSRM) avec
// réordonnancement et suppression des points, lecture latitude/longitude/
// altitude sous le curseur, plein écran.
//
// Aucune dépendance en dehors de react et maplibre-gl.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { buildMapStyle, DEFAULT_CENTER, DEFAULT_TILES, DEFAULT_ZOOM, MODULE_CREDIT } from "./style";
import { injectKeyframes, markerHTML, pointAlong } from "./markers";
import { demElevation } from "./elevation";
import { routeThrough } from "./routing";
import { DEFAULT_LABELS, type MapLabels } from "./labels";
import { ACCENT_TEXT, BTN, BTN_ON, DANGER_TEXT, MEASURE_COLOR, MONO, MUTED_TEXT, OVERLAY, PANEL } from "./theme";
import type {
  Basemap,
  LayerVisibility,
  LngLat,
  MapMarker,
  MapSelection,
  MovingMarker,
  RouteResult,
  RoutingOptions,
} from "./types";

export interface EsriMaxarMapProps {
  /** Marqueurs statiques (unités, hôpitaux, incidents, sites…). */
  markers?: MapMarker[];
  /** Marqueurs mobiles animés le long de leur tracé (convois, hélicoptères…). */
  movingMarkers?: MovingMarker[];
  /** Dessiner les tracés des marqueurs mobiles. Défaut : true. */
  showPaths?: boolean;
  /** Couleur des tracés. */
  pathColor?: string;

  /** Visibilité par famille : `{ unit: true, hospital: false }`. Absent = visible. */
  layers?: LayerVisibility;

  /** Élément sélectionné (contrôlé). */
  selected?: MapSelection | null;
  /** Clic sur un marqueur. */
  onSelect?: (sel: MapSelection, marker: MapMarker | MovingMarker) => void;
  /** Recentrer/zoomer sur l'élément sélectionné. Défaut : true. */
  flyToSelected?: boolean;

  /** Vue initiale. */
  center?: LngLat;
  zoom?: number;
  /** Relief 3D (contrôlé si fourni, sinon piloté par le bouton interne). */
  terrain3d?: boolean;
  onTerrain3dChange?: (on: boolean) => void;
  /** Fond de carte (contrôlé si fourni). */
  basemap?: Basemap;
  onBasemapChange?: (b: Basemap) => void;

  /** Gabarits de tuiles personnalisés (déploiement souverain / hors-ligne). */
  satelliteTiles?: string;
  planTiles?: string;
  labelTiles?: string;
  demTiles?: string;
  attribution?: string;
  /**
   * Crédit du développeur affiché dans le contrôle d'attribution de la carte.
   * Défaut : « Carte : Mohammed Zraib ». Passer `false` retire la mention de la
   * carte — l'attribution reste alors due dans la documentation du projet
   * intégrateur (voir AGENTS.md).
   */
  credit?: string | false;

  /** Moteur d'itinéraire de l'outil de mesure. */
  routing?: RoutingOptions;

  /** Surcouches affichées. */
  showMeasureTool?: boolean;
  showCursorReadout?: boolean;
  showBasemapSwitch?: boolean;
  show3dSwitch?: boolean;
  showFullscreenButton?: boolean;
  showNavigationControl?: boolean;

  /** Clic simple sur la carte (hors mode mesure). */
  onMapClick?: (ll: LngLat, e: maplibregl.MapMouseEvent) => void;
  /** Clic droit sur la carte (ex. « déclarer ici »). */
  onContextMenu?: (ll: LngLat, e: maplibregl.MapMouseEvent) => void;
  /** Points de mesure modifiés (ajout, réordonnancement, suppression). */
  onMeasureChange?: (pts: LngLat[], route: RouteResult | null) => void;
  /** Instance MapLibre, une fois la carte créée. */
  onReady?: (map: maplibregl.Map) => void;

  /** Traductions partielles des libellés. */
  labels?: Partial<MapLabels>;
  /** Surcouches libres rendues au-dessus de la carte (légende, panneaux…). */
  children?: ReactNode;

  className?: string;
  style?: CSSProperties;
}

const box = (extra: CSSProperties): CSSProperties => ({ position: "absolute", zIndex: 10, ...extra });

/** Chevron « v » : sert aux boutons monter/descendre (retourné pour monter). */
function Caret({ up = false }: { up?: boolean }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ transform: up ? "rotate(180deg)" : undefined }}>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Cross({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function Expand() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function EsriMaxarMap({
  markers = [],
  movingMarkers = [],
  showPaths = true,
  pathColor = "#C9A84C",
  layers,
  selected = null,
  onSelect,
  flyToSelected = true,
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  terrain3d,
  onTerrain3dChange,
  basemap,
  onBasemapChange,
  satelliteTiles,
  planTiles,
  labelTiles,
  demTiles,
  attribution,
  credit = MODULE_CREDIT.mapAttribution,
  routing,
  showMeasureTool = true,
  showCursorReadout = true,
  showBasemapSwitch = true,
  show3dSwitch = true,
  showFullscreenButton = true,
  showNavigationControl = true,
  onMapClick,
  onContextMenu,
  onMeasureChange,
  onReady,
  labels,
  children,
  className,
  style,
}: EsriMaxarMapProps) {
  const t = useMemo<MapLabels>(() => ({ ...DEFAULT_LABELS, ...labels }), [labels]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);

  const staticMkRef = useRef<maplibregl.Marker[]>([]);
  const movingMkRef = useRef<{ mk: maplibregl.Marker; index: number }[]>([]);
  const progressRef = useRef<number[]>([]);
  const rafRef = useRef(0);

  // Lecture de la position du curseur : écriture directe dans le DOM, donc
  // aucun re-rendu React à chaque mouvement de souris.
  const latRef = useRef<HTMLSpanElement | null>(null);
  const lngRef = useRef<HTMLSpanElement | null>(null);
  const altRef = useRef<HTMLSpanElement | null>(null);
  const altSeqRef = useRef(0);

  // Props lues depuis les gestionnaires natifs MapLibre (enregistrés une fois).
  const propsRef = useRef({ onMapClick, onContextMenu, onSelect, markers, movingMarkers, layers, demTiles });
  propsRef.current = { onMapClick, onContextMenu, onSelect, markers, movingMarkers, layers, demTiles };

  const [measureOn, setMeasureOn] = useState(false);
  const measureOnRef = useRef(false);
  measureOnRef.current = measureOn;
  const [pts, setPts] = useState<LngLat[]>([]);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [full, setFull] = useState(false);

  // Fond de carte et relief : contrôlés si la prop est fournie, sinon internes.
  const [satState, setSatState] = useState(basemap !== "plan");
  const [d3State, setD3State] = useState(!!terrain3d);
  const sat = basemap === undefined ? satState : basemap === "satellite";
  const d3 = terrain3d === undefined ? d3State : terrain3d;
  // Vue courante relue par `setupStyle` au (re)chargement du style.
  const viewRef = useRef({ sat, d3 });
  viewRef.current = { sat, d3 };

  const visible = useCallback(
    (kind: string) => (propsRef.current.layers ? propsRef.current.layers[kind] !== false : true),
    [],
  );

  // --- bascules appliquées à la carte ---------------------------------------
  // On teste la présence de la couche, pas `isStyleLoaded()` : ce dernier reste
  // faux tant que des tuiles raster chargent, alors que le style est déjà
  // analysé — une bascule demandée pendant ce laps de temps serait perdue.
  const applyBase = useCallback((on: boolean) => {
    const map = mapRef.current;
    if (!map || !map.getLayer("sat")) return;
    map.setLayoutProperty("sat", "visibility", on ? "visible" : "none");
    map.setLayoutProperty("plan", "visibility", on ? "none" : "visible");
    map.setLayoutProperty("lbl", "visibility", on ? "visible" : "none");
  }, []);

  const apply3d = useCallback((on: boolean) => {
    const map = mapRef.current;
    if (!map || !map.getSource("dem")) return;
    if (on) {
      if (!map.getTerrain()) map.setTerrain({ source: "dem", exaggeration: 1.4 });
      map.easeTo({ pitch: 62, zoom: Math.max(map.getZoom(), 8.5), bearing: -18, duration: 1600 });
    } else {
      map.setTerrain(null);
      map.easeTo({ pitch: 0, bearing: 0, duration: 1200 });
    }
  }, []);

  // --- synchronisation des marqueurs ----------------------------------------
  const syncMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const { markers: ms, movingMarkers: mv } = propsRef.current;
    const isSel = (kind: string, id: string) => !!selected && selected.kind === kind && selected.id === id;

    staticMkRef.current.forEach((m) => m.remove());
    staticMkRef.current = [];
    movingMkRef.current.forEach((m) => m.mk.remove());
    movingMkRef.current = [];

    const element = (m: MapMarker | MovingMarker, sel: boolean) => {
      const el = document.createElement("div");
      el.innerHTML = markerHTML(m, sel);
      el.style.cursor = "pointer";
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        propsRef.current.onSelect?.({ kind: m.kind, id: m.id }, m);
      });
      return el;
    };

    ms.forEach((m) => {
      if (!visible(m.kind)) return;
      staticMkRef.current.push(
        new maplibregl.Marker({ element: element(m, isSel(m.kind, m.id)) }).setLngLat(m.ll).addTo(map),
      );
    });

    mv.forEach((m, index) => {
      if (!visible(m.kind)) return;
      if (progressRef.current[index] === undefined) progressRef.current[index] = m.progress ?? 0;
      const mk = new maplibregl.Marker({ element: element(m, isSel(m.kind, m.id)) })
        .setLngLat(pointAlong(m.path, progressRef.current[index]))
        .addTo(map);
      movingMkRef.current.push({ mk, index });
    });

    if (map.getLayer("emm-paths-line")) {
      const anyVisible = showPaths && mv.some((m) => visible(m.kind));
      map.setLayoutProperty("emm-paths-line", "visibility", anyVisible ? "visible" : "none");
    }
  }, [selected, showPaths, visible]);

  // --- animation des marqueurs mobiles --------------------------------------
  const startAnim = useCallback(() => {
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      movingMkRef.current.forEach(({ mk, index }) => {
        const m = propsRef.current.movingMarkers[index];
        if (!m) return;
        progressRef.current[index] = (progressRef.current[index] + (m.speed ?? 0.01) * dt) % 1;
        mk.setLngLat(pointAlong(m.path, progressRef.current[index]));
      });
      rafRef.current = requestAnimationFrame(step);
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
  }, []);

  // --- initialisation (une fois) --------------------------------------------
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    injectKeyframes();

    const map = new maplibregl.Map({
      container: mapDivRef.current,
      style: buildMapStyle({ satelliteTiles, planTiles, labelTiles, demTiles, attribution }),
      center,
      zoom,
      pitch: 0,
      attributionControl: { compact: true, ...(credit ? { customAttribution: credit } : {}) },
    });
    mapRef.current = map;
    if (showNavigationControl) map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");

    map.on("contextmenu", (e) => {
      if (!propsRef.current.onContextMenu) return;
      e.preventDefault();
      propsRef.current.onContextMenu([e.lngLat.lng, e.lngLat.lat], e);
    });

    map.on("mousemove", (e) => {
      if (latRef.current) latRef.current.textContent = `${e.lngLat.lat.toFixed(5)}°`;
      if (lngRef.current) lngRef.current.textContent = `${e.lngLat.lng.toFixed(5)}°`;
      const seq = ++altSeqRef.current;
      void demElevation(e.lngLat.lng, e.lngLat.lat, propsRef.current.demTiles ?? DEFAULT_TILES.dem).then((alt) => {
        if (seq !== altSeqRef.current || !altRef.current) return; // résultat périmé
        altRef.current.textContent = alt == null ? "—" : `${Math.round(alt)} m`;
      });
    });

    map.on("click", (e) => {
      const ll: LngLat = [e.lngLat.lng, e.lngLat.lat];
      if (measureOnRef.current) {
        setPts((prev) => [...prev, ll]);
        return;
      }
      propsRef.current.onMapClick?.(ll, e);
    });

    // Les marqueurs sont des surcouches DOM indépendantes du chargement des
    // tuiles : la carte reste exploitable même là où le fond est lent ou
    // injoignable (réseau restreint, air-gap).
    readyRef.current = true;
    syncMarkers();
    startAnim();

    // Les sources/couches nécessitent le style analysé ; `styledata` se
    // déclenche sans attendre les tuiles.
    const setupStyle = () => {
      if (!map.getLayer("sat")) return;
      if (!map.getSource("emm-paths")) {
        map.addSource("emm-paths", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({
          id: "emm-paths-line",
          type: "line",
          source: "emm-paths",
          paint: { "line-color": pathColor, "line-width": 2.5, "line-dasharray": [2, 2], "line-opacity": 0.9 },
        });
      }
      if (!map.getSource("emm-measure")) {
        map.addSource("emm-measure", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({
          id: "emm-measure-line",
          type: "line",
          source: "emm-measure",
          filter: ["==", "$type", "LineString"],
          paint: { "line-color": MEASURE_COLOR, "line-width": 2.5, "line-dasharray": [1.5, 1] },
        });
        map.addLayer({
          id: "emm-measure-pt",
          type: "circle",
          source: "emm-measure",
          filter: ["==", "$type", "Point"],
          paint: {
            "circle-radius": 4,
            "circle-color": MEASURE_COLOR,
            "circle-stroke-color": "#0f1720",
            "circle-stroke-width": 1.5,
          },
        });
      }
      // Valeurs relues dans la ref : une bascule demandée avant l'analyse du
      // style est appliquée ici, et non écrasée par les valeurs initiales.
      applyBase(viewRef.current.sat);
      apply3d(viewRef.current.d3);
      syncMarkers();
    };
    setupStyle();
    map.on("styledata", setupStyle);
    map.once("load", setupStyle);

    onReady?.(map);

    // Le conteneur change de taille (plein écran, repli d'un rail) → resize.
    const ro = new ResizeObserver(() => mapRef.current?.resize());
    if (mapDivRef.current) ro.observe(mapDivRef.current);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
      staticMkRef.current = [];
      movingMkRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- re-synchro des marqueurs ---------------------------------------------
  useEffect(() => {
    syncMarkers();
  }, [markers, movingMarkers, layers, selected, syncMarkers]);

  // --- tracés des marqueurs mobiles -----------------------------------------
  useEffect(() => {
    const src = mapRef.current?.getSource("emm-paths") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData({
      type: "FeatureCollection",
      features: movingMarkers
        .filter((m) => visible(m.kind) && m.path.length > 1)
        .map((m) => ({
          type: "Feature" as const,
          properties: { id: m.id },
          geometry: { type: "LineString" as const, coordinates: m.path },
        })),
    });
  }, [movingMarkers, layers, visible]);

  // --- recentrage sur l'élément sélectionné ---------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selected || !flyToSelected) return;
    const stat = markers.find((m) => m.kind === selected.kind && m.id === selected.id);
    const ll = stat?.ll ?? (() => {
      const i = movingMarkers.findIndex((m) => m.kind === selected.kind && m.id === selected.id);
      return i >= 0 ? pointAlong(movingMarkers[i].path, progressRef.current[i] ?? 0) : undefined;
    })();
    if (ll) map.flyTo({ center: ll, zoom: Math.max(map.getZoom(), 10.5), duration: 1200 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // --- bascules -------------------------------------------------------------
  // Sans effet si le style n'est pas encore analysé : `setupStyle` rejouera la
  // valeur courante au prochain `styledata`.
  useEffect(() => {
    applyBase(sat);
  }, [sat, applyBase]);
  useEffect(() => {
    apply3d(d3);
  }, [d3, apply3d]);

  // --- itinéraire à chaque changement de points -----------------------------
  useEffect(() => {
    if (pts.length < 2) {
      setRoute(null);
      return;
    }
    let cancelled = false;
    void routeThrough(pts, routing).then((r) => {
      if (!cancelled) setRoute(r);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts, routing?.engine, routing?.url, routing?.costing]);

  // --- couche de mesure : itinéraire + sommets saisis ------------------------
  useEffect(() => {
    const src = mapRef.current?.getSource("emm-measure") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const line = route?.coords ?? pts;
    src.setData({
      type: "FeatureCollection",
      features: [
        ...(line.length > 1
          ? [{ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: line } }]
          : []),
        ...pts.map((p) => ({
          type: "Feature" as const,
          properties: {},
          geometry: { type: "Point" as const, coordinates: p },
        })),
      ],
    });
    onMeasureChange?.(pts, route);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts, route]);

  // Curseur en croix tant que la mesure est active.
  useEffect(() => {
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = measureOn ? "crosshair" : "";
  }, [measureOn]);

  // Échap quitte le plein écran.
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFull(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  // Le conteneur passe en plein écran → MapLibre doit remesurer son canvas.
  useEffect(() => {
    const id = window.setTimeout(() => mapRef.current?.resize(), 60);
    return () => window.clearTimeout(id);
  }, [full]);

  // --- édition des points ---------------------------------------------------
  const movePt = (i: number, d: number) =>
    setPts((p) => {
      const j = i + d;
      if (j < 0 || j >= p.length) return p;
      const n = [...p];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const removePt = (i: number) => setPts((p) => p.filter((_, k) => k !== i));

  const setSat = (v: boolean) => {
    if (basemap === undefined) setSatState(v);
    onBasemapChange?.(v ? "satellite" : "plan");
  };
  const set3d = (v: boolean) => {
    if (terrain3d === undefined) setD3State(v);
    onTerrain3dChange?.(v);
  };

  const stepBtn: CSSProperties = {
    background: "none",
    border: "none",
    padding: 2,
    cursor: "pointer",
    color: "rgba(255,255,255,0.6)",
    display: "flex",
  };

  const shell: CSSProperties = full
    ? { position: "fixed", inset: 0, zIndex: 9999, background: "#0b0f14" }
    : { position: "relative", width: "100%", height: "100%", ...style };

  return (
    <div ref={containerRef} className={className} style={shell}>
      <div ref={mapDivRef} style={{ position: "absolute", inset: 0 }} />

      {/* Contrôles haut-droite : fond, 2D/3D, plein écran */}
      {(showBasemapSwitch || show3dSwitch || showFullscreenButton) && (
        <div style={box({ top: 12, insetInlineEnd: 12, display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" })}>
          {show3dSwitch && (
            <div style={{ ...OVERLAY, display: "flex", overflow: "hidden", padding: 0 }}>
              <button onClick={() => set3d(false)} style={{ ...(d3 ? BTN : BTN_ON), borderRadius: 0, border: "none" }}>2D</button>
              <button onClick={() => set3d(true)} style={{ ...(d3 ? BTN_ON : BTN), borderRadius: 0, border: "none" }}>3D</button>
            </div>
          )}
          {showBasemapSwitch && (
            <div style={{ ...OVERLAY, display: "flex", overflow: "hidden", padding: 0 }}>
              <button onClick={() => setSat(true)} style={{ ...(sat ? BTN_ON : BTN), borderRadius: 0, border: "none" }}>{t.satellite}</button>
              <button onClick={() => setSat(false)} style={{ ...(sat ? BTN : BTN_ON), borderRadius: 0, border: "none" }}>{t.plan}</button>
            </div>
          )}
          {showFullscreenButton && (
            <button
              onClick={() => setFull((f) => !f)}
              title={full ? t.exitFullscreen : t.fullscreen}
              aria-label={full ? t.exitFullscreen : t.fullscreen}
              style={{ ...BTN, display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, padding: 0 }}
            >
              {full ? <Cross size={15} /> : <Expand />}
            </button>
          )}
        </div>
      )}

      {/* Points de mesure : réordonner (↑/↓) et supprimer (✕) */}
      {showMeasureTool && pts.length > 0 && (
        <div style={box({ bottom: 84, insetInlineStart: 8, width: 220, ...OVERLAY, padding: 8 })}>
          <div style={{ ...MUTED_TEXT, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>
            {t.points}
          </div>
          {pts.map((p, i) => (
            <div key={`${p[0]},${p[1]},${i}`} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, padding: "1px 0" }}>
              <span style={{ ...ACCENT_TEXT, width: 12, fontWeight: 700 }}>{i + 1}</span>
              <span style={{ ...MONO, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p[1].toFixed(4)}, {p[0].toFixed(4)}
              </span>
              <button onClick={() => movePt(i, -1)} disabled={i === 0} style={{ ...stepBtn, opacity: i === 0 ? 0.25 : 1 }} aria-label={t.moveUp}>
                <Caret up />
              </button>
              <button
                onClick={() => movePt(i, 1)}
                disabled={i === pts.length - 1}
                style={{ ...stepBtn, opacity: i === pts.length - 1 ? 0.25 : 1 }}
                aria-label={t.moveDown}
              >
                <Caret />
              </button>
              <button onClick={() => removePt(i)} style={{ ...stepBtn, ...DANGER_TEXT }} aria-label={t.remove}>
                <Cross />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Outil de mesure (multi-points, itinéraire routier) */}
      {showMeasureTool && (
        <div style={box({ bottom: 46, insetInlineStart: 8, display: "flex", alignItems: "center", gap: 6 })}>
          <button onClick={() => setMeasureOn((o) => !o)} style={measureOn ? BTN_ON : BTN}>
            {t.measure}
          </button>
          {route && (
            <span style={{ ...PANEL, ...MONO }}>
              {route.km.toFixed(1)} km
              {route.min != null ? ` · ${route.min} min` : ""}
              <span style={route.road ? ACCENT_TEXT : MUTED_TEXT}> · {route.road ? t.road : t.direct}</span>
            </span>
          )}
          {pts.length > 0 && (
            <button
              onClick={() => {
                setPts([]);
                setRoute(null);
              }}
              style={{ ...BTN, ...DANGER_TEXT }}
            >
              {t.clear}
            </button>
          )}
          {measureOn && pts.length === 0 && <span style={{ ...PANEL, color: "rgba(255,255,255,0.7)" }}>{t.measureHint}</span>}
        </div>
      )}

      {/* Position du curseur : latitude / longitude / altitude */}
      {showCursorReadout && (
        <div
          style={box({
            bottom: 8,
            insetInlineStart: 8,
            ...PANEL,
            ...MONO,
            display: "flex",
            alignItems: "center",
            gap: 12,
            pointerEvents: "none",
          })}
        >
          <span style={{ display: "flex", gap: 4 }}>
            <span style={ACCENT_TEXT}>{t.lat}</span>
            <span ref={latRef}>—</span>
          </span>
          <span style={{ display: "flex", gap: 4 }}>
            <span style={ACCENT_TEXT}>{t.lng}</span>
            <span ref={lngRef}>—</span>
          </span>
          <span style={{ display: "flex", gap: 4 }}>
            <span style={ACCENT_TEXT}>{t.alt}</span>
            <span ref={altRef}>—</span>
          </span>
        </div>
      )}

      {children}
    </div>
  );
}

export default EsriMaxarMap;
