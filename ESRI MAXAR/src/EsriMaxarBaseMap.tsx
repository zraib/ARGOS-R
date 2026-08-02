"use client";

// ============================================================================
// ESRI MAXAR — fond de carte MapLibre, rien de plus.
//
// Développé par **Mohammed Zraib**. Toute intégration doit conserver cette
// attribution (voir AGENTS.md et README.md).
//
// Sources raster Esri World Imagery (Maxar) / OpenStreetMap + surcouche
// d'étiquettes + modèle numérique de terrain pour le relief 3D. Aucun jeton
// d'API, aucune surcouche d'interface, aucun marqueur, aucun calcul.
//
// Tout le reste (marqueurs, dessin, mesures, panneaux) se construit par-dessus
// via `onReady(map)` — qui donne l'instance MapLibre — ou via `children`.
// ============================================================================

import { useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { buildMapStyle, DEFAULT_CENTER, DEFAULT_ZOOM, MODULE_CREDIT, type Basemap, type LngLat } from "./style";

export interface EsriMaxarBaseMapProps {
  /** Vue initiale. */
  center?: LngLat;
  zoom?: number;
  /** Inclinaison et orientation initiales. */
  pitch?: number;
  bearing?: number;

  /** Fond affiché. Changer la prop bascule la carte. Défaut : `satellite`. */
  basemap?: Basemap;
  /** Surcouche d'étiquettes (frontières, lieux) sur le satellite. Défaut : true. */
  labels?: boolean;
  /** Relief 3D. Changer la prop applique/retire le terrain. Défaut : false. */
  terrain3d?: boolean;
  /** Exagération du relief en mode 3D. Défaut : 1.4. */
  terrainExaggeration?: number;

  /** Gabarits de tuiles personnalisés (déploiement interne / hors-ligne). */
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

  /** Contrôle zoom/boussole natif de MapLibre. Défaut : true. */
  showNavigationControl?: boolean;
  /** Position du contrôle. Défaut : `bottom-right`. */
  navigationPosition?: "top-left" | "top-right" | "bottom-left" | "bottom-right";

  /** Instance MapLibre, une fois la carte créée (point d'extension principal). */
  onReady?: (map: maplibregl.Map) => void;
  onMapClick?: (ll: LngLat, e: maplibregl.MapMouseEvent) => void;
  onContextMenu?: (ll: LngLat, e: maplibregl.MapMouseEvent) => void;
  onMove?: (view: { center: LngLat; zoom: number; pitch: number; bearing: number }) => void;

  /** Surcouches libres rendues au-dessus de la carte. */
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function EsriMaxarBaseMap({
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  pitch = 0,
  bearing = 0,
  basemap = "satellite",
  labels = true,
  terrain3d = false,
  terrainExaggeration = 1.4,
  satelliteTiles,
  planTiles,
  labelTiles,
  demTiles,
  attribution,
  credit = MODULE_CREDIT.mapAttribution,
  showNavigationControl = true,
  navigationPosition = "bottom-right",
  onReady,
  onMapClick,
  onContextMenu,
  onMove,
  children,
  className,
  style,
}: EsriMaxarBaseMapProps) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // Props lues depuis les gestionnaires natifs, enregistrés une seule fois.
  const cbRef = useRef({ onMapClick, onContextMenu, onMove });
  cbRef.current = { onMapClick, onContextMenu, onMove };
  // Vue courante, relue quand le style (re)devient disponible : une bascule
  // demandée avant l'analyse du style est ainsi appliquée dès qu'elle est
  // possible, sans état React ni ordre de montage à gérer.
  const viewRef = useRef({ basemap, terrain3d });
  viewRef.current = { basemap, terrain3d };

  // Note : on teste la présence de la couche, pas `isStyleLoaded()` — ce dernier
  // reste faux tant que des tuiles raster sont en cours de chargement, alors que
  // le style est déjà analysé et les couches manipulables.
  const applyBase = useCallback((b: Basemap) => {
    const map = mapRef.current;
    if (!map || !map.getLayer("sat")) return;
    const sat = b === "satellite";
    map.setLayoutProperty("sat", "visibility", sat ? "visible" : "none");
    map.setLayoutProperty("plan", "visibility", sat ? "none" : "visible");
    if (map.getLayer("lbl")) map.setLayoutProperty("lbl", "visibility", sat ? "visible" : "none");
  }, []);

  const applyTerrain = useCallback(
    (on: boolean) => {
      const map = mapRef.current;
      if (!map || !map.getSource("dem")) return;
      if (on) {
        if (!map.getTerrain()) map.setTerrain({ source: "dem", exaggeration: terrainExaggeration });
      } else {
        map.setTerrain(null);
      }
    },
    [terrainExaggeration],
  );

  // --- initialisation (une fois) --------------------------------------------
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapDivRef.current,
      style: buildMapStyle({ satelliteTiles, planTiles, labelTiles, demTiles, attribution, labels }),
      center,
      zoom,
      pitch,
      bearing,
      attributionControl: { compact: true, ...(credit ? { customAttribution: credit } : {}) },
    });
    mapRef.current = map;

    if (showNavigationControl) {
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), navigationPosition);
    }

    map.on("click", (e) => cbRef.current.onMapClick?.([e.lngLat.lng, e.lngLat.lat], e));
    map.on("contextmenu", (e) => {
      if (!cbRef.current.onContextMenu) return;
      e.preventDefault();
      cbRef.current.onContextMenu([e.lngLat.lng, e.lngLat.lat], e);
    });
    map.on("moveend", () => {
      const c = map.getCenter();
      cbRef.current.onMove?.({ center: [c.lng, c.lat], zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() });
    });

    // Les bascules ont besoin du style analysé (couches présentes) ;
    // `styledata` se déclenche sans attendre les tuiles.
    const setupStyle = () => {
      if (!map.getLayer("sat")) return;
      applyBase(viewRef.current.basemap);
      applyTerrain(viewRef.current.terrain3d);
    };
    setupStyle();
    map.on("styledata", setupStyle);
    map.once("load", setupStyle);

    onReady?.(map);

    // Le conteneur peut changer de taille (plein écran, repli d'un rail) ou
    // être mesuré à zéro au montage → remesurer le canvas.
    const ro = new ResizeObserver(() => mapRef.current?.resize());
    ro.observe(mapDivRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- bascules pilotées par les props --------------------------------------
  // Sans effet si le style n'est pas encore analysé : `setupStyle` rejouera la
  // valeur courante au prochain `styledata`.
  useEffect(() => {
    applyBase(basemap);
  }, [basemap, applyBase]);

  useEffect(() => {
    applyTerrain(terrain3d);
  }, [terrain3d, applyTerrain]);

  return (
    <div className={className} style={{ position: "relative", width: "100%", height: "100%", ...style }}>
      <div ref={mapDivRef} style={{ position: "absolute", inset: 0 }} />
      {children}
    </div>
  );
}

export default EsriMaxarBaseMap;
