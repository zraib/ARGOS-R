import type { LngLat } from "@/modules/routing/geo";
import type { TravelMode } from "@/modules/routing/routing.types";

// ============================================================================
// ARGOS — port « moteur d'itinéraire »
//
// Le planificateur de routage sûr dépend de CETTE interface, jamais de Valhalla :
// un autre moteur auto-hébergé s'écrirait comme un nouvel adaptateur, sans
// toucher au service. Le moteur ne connaît ni les obstacles ni les panaches —
// il reçoit seulement des points et des surfaces à ÉVITER (ADR 0039).
// ============================================================================

/** Ce qu'une requête exclut, et comment on se déplace. */
export interface EngineOptions {
  mode: TravelMode;
  /** Points à éviter : la route sur laquelle chacun tombe est retirée (pont détruit, route coupée). */
  excludePoints: LngLat[];
  /** Surfaces à éviter (anneaux fermés) : aucune route qui les traverse. */
  excludeRings: LngLat[][];
}

export interface EngineRoute {
  coords: LngLat[];
  km: number;
  min: number;
}

/**
 * Une erreur du moteur, qualifiée :
 * - `unavailable` — injoignable (arrêté, réseau) ;
 * - `no_path` — aucun chemin ne respecte les exclusions ;
 * - `no_edges` — un point est trop loin de toute route ;
 * - `limit` — les exclusions dépassent une limite de service ;
 * - `rejected` — toute autre réponse refusée.
 */
export class RoutingEngineError extends Error {
  constructor(
    readonly code: "unavailable" | "no_path" | "no_edges" | "limit" | "rejected",
    message: string,
  ) {
    super(message);
  }
}

export interface RoutingEngine {
  /** Nom du moteur, rendu à l'écran. */
  readonly name: string;
  /** Itinéraire passant par tous les points, dans l'ordre. Lève `RoutingEngineError`. */
  route(points: LngLat[], opts: EngineOptions): Promise<EngineRoute>;
  /** Durée (secondes) de `source` à chaque cible ; null quand une cible est injoignable. */
  matrix(source: LngLat, targets: LngLat[], opts: EngineOptions): Promise<(number | null)[]>;
  /** Le point de route le plus proche de chacun (null : aucune route trouvée). */
  snap(points: LngLat[], mode: TravelMode): Promise<(LngLat | null)[]>;
}

/** Jeton d'injection Nest (une interface TypeScript n'existe pas à l'exécution). */
export const ROUTING_ENGINE = Symbol("ROUTING_ENGINE");
