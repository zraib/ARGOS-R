// ============================================================================
// ESRI MAXAR MAP — développé par Mohammed Zraib (attribution : voir AGENTS.md).
// Types publics du composant EsriMaxarMap.
// Aucune dépendance au domaine ARGOS : les marqueurs sont décrits de façon
// générique (identifiant + famille + position + rendu).
// ============================================================================

/** Position géographique [longitude, latitude] (ordre GeoJSON / MapLibre). */
export type LngLat = [number, number];

/** Forme du glyphe dessiné par le rendu de marqueur par défaut. */
export type MarkerShape = "square" | "circle" | "triangle" | "diamond" | "cross" | "dashed-circle";

/** Marqueur statique posé sur la carte. */
export interface MapMarker<T = unknown> {
  /** Identifiant unique **au sein de sa famille** (`kind`). */
  id: string;
  /** Famille du marqueur : sert au filtrage par couche et à la sélection. */
  kind: string;
  /** Position [lng, lat]. */
  ll: LngLat;
  /** Étiquette affichée sous le glyphe (facultative). */
  label?: string;
  /** Couleur du glyphe (par défaut : couleur de la famille, sinon or). */
  color?: string;
  /** Forme du glyphe. Par défaut « circle ». */
  shape?: MarkerShape;
  /** Halo pulsé (alerte en cours). */
  pulse?: boolean;
  /** HTML complet du marqueur : court-circuite entièrement le rendu par défaut. */
  html?: string;
  /** Charge utile libre, restituée telle quelle dans `onSelect`. */
  data?: T;
}

/** Marqueur mobile animé le long d'un tracé (convoi, hélicoptère, véhicule). */
export interface MovingMarker<T = unknown> extends Omit<MapMarker<T>, "ll"> {
  /** Tracé suivi, en [lng, lat]. Au moins deux points. */
  path: LngLat[];
  /** Vitesse en fraction du tracé parcourue par seconde (défaut 0.01). */
  speed?: number;
  /** Progression initiale ∈ [0,1[ (défaut 0). */
  progress?: number;
}

/** Élément sélectionné (famille + identifiant). */
export interface MapSelection {
  kind: string;
  id: string;
}

/** Visibilité des couches, par famille de marqueurs : `{ unit: true, … }`. */
export type LayerVisibility = Record<string, boolean>;

/** Fond de carte actif. */
export type Basemap = "satellite" | "plan";

/** Moteur de calcul d'itinéraire. */
export type RoutingEngine = "valhalla" | "osrm" | "none";

export interface RoutingOptions {
  /** `valhalla` (auto-hébergé), `osrm`, ou `none` pour rester à vol d'oiseau. */
  engine?: RoutingEngine;
  /** URL de base du moteur (ex. `http://localhost:8002`). */
  url?: string;
  /** Profil de coût : `auto`, `truck`, `bicycle`, `pedestrian`… (Valhalla). */
  costing?: string;
}

/** Résultat d'un calcul d'itinéraire. */
export interface RouteResult {
  /** Tracé à dessiner : géométrie routière si disponible, sinon les points. */
  coords: LngLat[];
  /** Longueur en kilomètres. */
  km: number;
  /** Durée estimée en minutes (uniquement en mode routier). */
  min: number | null;
  /** true = itinéraire par le réseau routier ; false = à vol d'oiseau. */
  road: boolean;
}
