// ============================================================================
// Calcul d'itinéraire par le réseau routier.
// Deux moteurs supportés :
//   • "valhalla" — moteur AUTO-HÉBERGÉ (POST /route). Cible des déploiements
//                  souverains : aucun appel sortant.
//   • "osrm"     — service compatible OSRM (GET /route/v1/driving/…).
// En cas d'échec (hors ligne, moteur non démarré) on retombe sur la distance
// orthodromique : l'outil de mesure reste utilisable.
// ============================================================================

import type { LngLat, RouteResult, RoutingOptions } from "./types";

/** Distance géodésique (haversine) en km entre deux points [lng, lat]. */
export function haversineKm(a: LngLat, b: LngLat): number {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const la1 = (a[1] * Math.PI) / 180;
  const la2 = (b[1] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Longueur cumulée d'une polyligne (km). */
export function pathKm(p: LngLat[]): number {
  let d = 0;
  for (let i = 1; i < p.length; i++) d += haversineKm(p[i - 1], p[i]);
  return d;
}

/** Décodage d'une polyligne encodée (Valhalla utilise la précision 6). */
export function decodePolyline(str: string, precision = 6): LngLat[] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const out: LngLat[] = [];
  const factor = 10 ** precision;
  while (index < str.length) {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0;
    shift = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    out.push([lng / factor, lat / factor]);
  }
  return out;
}

async function viaOsrm(pts: LngLat[], url: string): Promise<RouteResult | null> {
  const coords = pts.map((p) => `${p[0]},${p[1]}`).join(";");
  const res = await fetch(`${url}/route/v1/driving/${coords}?overview=full&geometries=geojson`);
  if (!res.ok) return null;
  const json = (await res.json()) as {
    code?: string;
    routes?: { distance: number; duration: number; geometry: { coordinates: LngLat[] } }[];
  };
  const route = json.routes?.[0];
  if (json.code !== "Ok" || !route) return null;
  return {
    coords: route.geometry.coordinates,
    km: route.distance / 1000,
    min: Math.round(route.duration / 60),
    road: true,
  };
}

async function viaValhalla(pts: LngLat[], url: string, costing: string): Promise<RouteResult | null> {
  const res = await fetch(`${url}/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      locations: pts.map((p) => ({ lon: p[0], lat: p[1] })),
      costing,
      directions_options: { units: "kilometers" },
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    trip?: { legs?: { shape: string }[]; summary?: { length: number; time: number } };
  };
  const trip = json.trip;
  if (!trip?.summary || !trip.legs?.length) return null;
  return {
    coords: trip.legs.flatMap((l) => decodePolyline(l.shape)),
    km: trip.summary.length,
    min: Math.round(trip.summary.time / 60),
    road: true,
  };
}

/** URL par défaut selon le moteur. */
export function defaultRouterUrl(engine: RoutingOptions["engine"]): string {
  return engine === "valhalla" ? "http://localhost:8002" : "https://router.project-osrm.org";
}

/**
 * Itinéraire passant par tous les points, **dans l'ordre fourni**.
 * Retombe sur la distance orthodromique si le moteur n'est pas joignable ou si
 * `engine` vaut `none`.
 */
export async function routeThrough(pts: LngLat[], opts: RoutingOptions = {}): Promise<RouteResult> {
  const direct: RouteResult = { coords: pts, km: pathKm(pts), min: null, road: false };
  if (pts.length < 2) return direct;
  const engine = opts.engine ?? "osrm";
  if (engine === "none") return direct;
  const url = (opts.url ?? defaultRouterUrl(engine)).replace(/\/$/, "");
  try {
    const r = engine === "valhalla" ? await viaValhalla(pts, url, opts.costing ?? "auto") : await viaOsrm(pts, url);
    return r ?? direct;
  } catch {
    return direct;
  }
}
