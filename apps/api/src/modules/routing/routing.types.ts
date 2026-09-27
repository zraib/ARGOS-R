// ============================================================================
// ARGOS — routage sûr : ce qu'on demande et ce qu'on rend (ADR 0039)
// ============================================================================

import type { LngLat } from "@/modules/routing/geo";

/** Mode de déplacement : en véhicule, ou à pied (sortie d'une zone NRBC à pied). */
export const TRAVEL_MODES = ["auto", "pedestrian"] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number];

/** Une demande d'itinéraire. */
export interface PlanInput {
  /**
   * Les étapes dans l'ordre : départ, étapes, arrivée. UN SEUL point = « sortir
   * au plus vite de la zone NRBC où je me trouve ».
   */
  points: LngLat[];
  mode?: TravelMode;
  /** Contourner les obstacles posés sur la carte (défaut : oui). */
  avoidObstacles?: boolean;
  /** Contourner les zones des panaches NRBC en cours (défaut : oui). */
  avoidNrbc?: boolean;
  /** Contourner aussi les zones de VIGILANCE (défaut : non — danger et protection seulement). */
  nrbcVigilance?: boolean;
}

/**
 * Un tronçon de l'itinéraire :
 * - `exit` : la sortie d'une zone NRBC, qui la TRAVERSE forcément ;
 * - `route` : le trajet qui contourne obstacles et zones.
 */
export interface RouteLeg {
  kind: "exit" | "route";
  coords: LngLat[];
  km: number;
  min: number;
}

/** Ce qui peut altérer un itinéraire — l'écran en fait une phrase. */
export const ROUTE_WARNINGS = [
  /** Le moteur d'itinéraire est injoignable : ligne droite, sans rien contourner. */
  "engine_unavailable",
  /** Aucun itinéraire ne contourne tout : le trajet affiché N'EST PAS SÛR. */
  "no_safe_route",
  /** Le départ est dans une zone NRBC : la sortie la plus rapide précède le trajet. */
  "origin_in_zone",
  /** Le départ est dans une zone NRBC et aucune sortie par la route n'a été trouvée. */
  "exit_not_found",
  /** Une étape ou l'arrivée est dans une zone NRBC : remplacée par le point d'approche sûr le plus rapide. */
  "point_in_zone",
  /** Une étape est dans un obstacle de surface : cet obstacle n'est pas contourné. */
  "point_in_obstacle",
  /** Le vent d'un panache est inconnu : seules ses zones omnidirectionnelles sont évitées. */
  "wind_unknown",
  /** Le moteur refuse des zones aussi vastes (limite de service, voir ADR 0039). */
  "engine_limit",
  /** Un seul point, hors de toute zone : rien à quitter. */
  "not_in_zone",
] as const;
export type RouteWarning = (typeof ROUTE_WARNINGS)[number];

/** L'itinéraire planifié. */
export interface RoutePlan {
  /** Moteur utilisé (`valhalla`), ou `direct` quand il est injoignable. */
  engine: string;
  /** Par le réseau routier (sinon : à vol d'oiseau). */
  road: boolean;
  /** Tout ce qui devait être contourné l'est. Faux : le tracé traverse un obstacle ou une zone. */
  safe: boolean;
  mode: TravelMode;
  legs: RouteLeg[];
  km: number;
  /** Durée estimée (minutes) ; null à vol d'oiseau. */
  min: number | null;
  /** L'itinéraire le plus court SANS rien contourner, quand il diffère : il mesure le détour. */
  reference: { coords: LngLat[]; km: number; min: number } | null;
  /** Sortie de zone : le point atteint, et ce que la sortie parcourt dans la zone. */
  exit: { point: LngLat; insideKm: number; insideMin: number; incidentIds: string[] } | null;
  /** Étapes remplacées par un point d'approche sûr (l'index est celui de la demande). */
  approaches: { index: number; from: LngLat; point: LngLat; incidentIds: string[] }[];
  /** Ce qui a été pris en compte. */
  avoided: { obstacles: number; zones: number; incidentIds: string[]; hours: number[] };
  warnings: RouteWarning[];
}
