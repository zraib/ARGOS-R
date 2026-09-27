import { Injectable } from "@nestjs/common";
import { decodePolyline, type LngLat } from "@/modules/routing/geo";
import { type EngineOptions, type EngineRoute, type RoutingEngine, RoutingEngineError } from "@/modules/routing/ports/routing-engine.port";
import type { TravelMode } from "@/modules/routing/routing.types";

// ============================================================================
// ARGOS — adaptateur Valhalla du moteur d'itinéraire
//
// Valhalla est AUTO-HÉBERGÉ (ADR 0001) : dans la station, le service `routing`
// de la pile, joint par le réseau interne (`ROUTING_URL=http://routing:8002`) ;
// au poste de développement, http://localhost:8002. Aucun routeur public : une
// requête d'itinéraire transporte la position réelle des opérations.
//
// Les exclusions passent telles quelles : `exclude_locations` (la route sur
// laquelle tombe chaque point est retirée) et `exclude_polygons` (aucune route
// qui traverse la surface). Leurs limites de service sont relevées au démarrage
// du conteneur (deploy/docker-compose.yml, ADR 0039).
// ============================================================================

const BASE = (process.env.ROUTING_URL ?? "http://localhost:8002").replace(/\/+$/, "");
/** Un itinéraire au Maroc se calcule en millisecondes ; au-delà, le moteur est en difficulté. */
const TIMEOUT_MS = 15_000;

/** Codes d'erreur Valhalla → nature de l'échec. */
const NO_PATH = new Set([170, 441, 442, 443]);
const NO_EDGES = new Set([171]);
const LIMIT = new Set([150, 154, 155, 156, 157, 158, 167]);

interface ValhallaError {
  error_code?: number;
  error?: string;
}

@Injectable()
export class ValhallaEngine implements RoutingEngine {
  readonly name = "valhalla";

  private options(opts: EngineOptions): Record<string, unknown> {
    return {
      costing: opts.mode,
      ...(opts.excludePoints.length > 0 ? { exclude_locations: opts.excludePoints.map(([lon, lat]) => ({ lon, lat })) } : {}),
      ...(opts.excludeRings.length > 0 ? { exclude_polygons: opts.excludeRings } : {}),
    };
  }

  private async post<T>(action: string, body: Record<string, unknown>): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${BASE}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      throw new RoutingEngineError("unavailable", `moteur d'itinéraire injoignable (${(e as Error).message})`);
    }
    if (res.ok) return (await res.json()) as T;
    if (res.status >= 500) throw new RoutingEngineError("unavailable", `moteur d'itinéraire en erreur (${res.status})`);
    const err = (await res.json().catch(() => ({}))) as ValhallaError;
    const code = err.error_code ?? 0;
    const message = `${code} ${err.error ?? res.statusText}`;
    if (NO_PATH.has(code)) throw new RoutingEngineError("no_path", message);
    if (NO_EDGES.has(code)) throw new RoutingEngineError("no_edges", message);
    if (LIMIT.has(code) || /exceed/i.test(err.error ?? "")) throw new RoutingEngineError("limit", message);
    throw new RoutingEngineError("rejected", message);
  }

  async route(points: LngLat[], opts: EngineOptions): Promise<EngineRoute> {
    const json = await this.post<{ trip?: { legs?: { shape: string }[]; summary?: { length: number; time: number } } }>("route", {
      locations: points.map(([lon, lat]) => ({ lon, lat })),
      ...this.options(opts),
      directions_options: { units: "kilometers" },
      // Le tracé suffit : pas de consignes de navigation à rédiger.
      directions_type: "none",
    });
    const trip = json.trip;
    if (!trip?.summary || !trip.legs?.length) throw new RoutingEngineError("rejected", "réponse sans itinéraire");
    return {
      coords: trip.legs.flatMap((l) => decodePolyline(l.shape)),
      km: trip.summary.length,
      min: trip.summary.time / 60,
    };
  }

  async matrix(source: LngLat, targets: LngLat[], opts: EngineOptions): Promise<(number | null)[]> {
    if (targets.length === 0) return [];
    const json = await this.post<{ sources_to_targets?: ({ time: number | null } | null)[][] }>("sources_to_targets", {
      sources: [{ lon: source[0], lat: source[1] }],
      targets: targets.map(([lon, lat]) => ({ lon, lat })),
      ...this.options(opts),
    });
    const ligne = json.sources_to_targets?.[0] ?? [];
    return targets.map((_, i) => {
      const t = ligne[i]?.time;
      return typeof t === "number" && Number.isFinite(t) ? t : null;
    });
  }

  async snap(points: LngLat[], mode: TravelMode): Promise<(LngLat | null)[]> {
    if (points.length === 0) return [];
    const json = await this.post<{ edges?: { correlated_lon: number; correlated_lat: number }[] | null }[]>("locate", {
      locations: points.map(([lon, lat]) => ({ lon, lat })),
      costing: mode,
      verbose: false,
    });
    return points.map((_, i) => {
      const e = json[i]?.edges?.[0];
      return e && Number.isFinite(e.correlated_lon) && Number.isFinite(e.correlated_lat) ? [e.correlated_lon, e.correlated_lat] : null;
    });
  }
}
