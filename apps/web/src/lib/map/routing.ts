// ============================================================================
// ARGOS — itinéraires routiers, planifiés par l'API (ADR 0039)
//
// Le navigateur ne parle plus au moteur d'itinéraire : il demande un PLAN à
// l'API (`POST /api/routing/plan`), qui y contourne les obstacles posés sur la
// carte et les zones des panaches NRBC en cours — de TOUS les incidents
// chimiques actifs, affichés ou non : la sécurité d'un trajet ne dépend pas de
// l'écran. Le moteur (Valhalla) reste auto-hébergé, joint par l'API sur le
// réseau interne de la station (ADR 0001) ; une requête d'itinéraire transporte
// la position réelle des opérations, elle ne sort jamais du système.
//
// API injoignable : la ligne droite, marquée comme telle — l'outil reste
// utilisable pour mesurer, sans rien prétendre contourner.
// ============================================================================

import { api } from "@/lib/api";
import type { RoutePlan, TravelMode } from "@/lib/types";

type LL = [number, number];

/** Distance géodésique (haversine) en km entre deux points [lng, lat]. */
export function haversineKm(a: LL, b: LL): number {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const la1 = (a[1] * Math.PI) / 180;
  const la2 = (b[1] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Longueur cumulée d'une polyligne (km). */
export function pathKm(p: LL[]): number {
  let d = 0;
  for (let i = 1; i < p.length; i++) d += haversineKm(p[i - 1], p[i]);
  return d;
}

/** Ce que l'itinéraire contourne, et comment on se déplace. */
export interface PlanOptions {
  mode: TravelMode;
  avoidObstacles: boolean;
  avoidNrbc: boolean;
  nrbcVigilance: boolean;
}

export const DEFAULT_PLAN_OPTIONS: PlanOptions = { mode: "auto", avoidObstacles: true, avoidNrbc: true, nrbcVigilance: false };

/** La ligne droite, quand l'API ne répond pas : rien n'est contourné, et c'est dit. */
export function straightPlan(pts: LL[], mode: TravelMode): RoutePlan {
  const km = Math.round(pathKm(pts) * 10) / 10;
  return {
    engine: "direct",
    road: false,
    safe: false,
    mode,
    legs: pts.length > 1 ? [{ kind: "route", coords: pts, km, min: 0 }] : [],
    km,
    min: null,
    reference: null,
    exit: null,
    approaches: [],
    avoided: { obstacles: 0, zones: 0, incidentIds: [], hours: [] },
    warnings: ["engine_unavailable"],
  };
}

/** Une réponse de l'API qui a bien la forme d'un plan. */
function isPlan(v: unknown): v is RoutePlan {
  const p = v as Partial<RoutePlan> | null;
  return !!p && Array.isArray(p.legs) && Array.isArray(p.warnings) && typeof p.km === "number";
}

/**
 * Itinéraire par les étapes données, dans l'ordre. Un seul point : la sortie la
 * plus rapide de la zone NRBC où il se trouve (rien s'il n'est dans aucune).
 */
export async function planRoute(pts: LL[], opts: PlanOptions): Promise<RoutePlan> {
  if (pts.length === 0) return straightPlan([], opts.mode);
  try {
    const res = await api.planRoute({ points: pts, ...opts });
    const data: unknown = res.data;
    if (isPlan(data)) return data;
  } catch {
    // réseau : la ligne droite ci-dessous
  }
  return straightPlan(pts, opts.mode);
}
