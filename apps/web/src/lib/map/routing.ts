// ============================================================================
// ARGOS — calcul d'itinéraire (réseau routier)
// Deux moteurs supportés, sélectionnés par NEXT_PUBLIC_ROUTING_ENGINE :
//   • "valhalla" — moteur AUTO-HÉBERGÉ (MASTER_PLAN §4.2, infra/compose).
//                  C'est la cible de production : aucun appel sortant.
//                  NEXT_PUBLIC_ROUTING_URL=http://localhost:8002
//   • "osrm"     — service OSRM (compatible /route/v1). Par défaut en dev, il
//                  pointe sur la démo publique pour que la carte fonctionne
//                  sans Docker. À NE PAS utiliser en production (souveraineté).
// En cas d'échec (hors ligne, air-gap, moteur non démarré) on retombe sur la
// distance orthodromique : l'outil de mesure reste utilisable.
// ============================================================================

type Engine = "valhalla" | "osrm";

const ENGINE: Engine = (process.env.NEXT_PUBLIC_ROUTING_ENGINE as Engine) ?? "osrm";
const ROUTER_URL =
  process.env.NEXT_PUBLIC_ROUTING_URL ?? (ENGINE === "valhalla" ? "http://localhost:8002" : "https://router.project-osrm.org");

/** Distance géodésique (haversine) en km entre deux points [lng, lat]. */
export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const la1 = (a[1] * Math.PI) / 180;
  const la2 = (b[1] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Longueur cumulée d'une polyligne (km). */
export function pathKm(p: [number, number][]): number {
  let d = 0;
  for (let i = 1; i < p.length; i++) d += haversineKm(p[i - 1], p[i]);
  return d;
}

/** Décodage d'une polyligne encodée (Valhalla utilise la précision 6). */
function decodePolyline(str: string, precision = 6): [number, number][] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const out: [number, number][] = [];
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

export interface RouteResult {
  /** Tracé à dessiner : géométrie routière si disponible, sinon les points. */
  coords: [number, number][];
  km: number;
  /** Durée estimée en minutes (uniquement en mode routier). */
  min: number | null;
  /** true = itinéraire par le réseau routier ; false = à vol d'oiseau. */
  road: boolean;
}

async function viaOsrm(pts: [number, number][]): Promise<RouteResult | null> {
  const coords = pts.map((p) => `${p[0]},${p[1]}`).join(";");
  const res = await fetch(`${ROUTER_URL}/route/v1/driving/${coords}?overview=full&geometries=geojson`);
  if (!res.ok) return null;
  const json = (await res.json()) as {
    code?: string;
    routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
  };
  const route = json.routes?.[0];
  if (json.code !== "Ok" || !route) return null;
  return { coords: route.geometry.coordinates, km: route.distance / 1000, min: Math.round(route.duration / 60), road: true };
}

async function viaValhalla(pts: [number, number][]): Promise<RouteResult | null> {
  const res = await fetch(`${ROUTER_URL}/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      locations: pts.map((p) => ({ lon: p[0], lat: p[1] })),
      costing: "auto",
      directions_options: { units: "kilometers" },
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    trip?: { legs?: { shape: string }[]; summary?: { length: number; time: number } };
  };
  const trip = json.trip;
  if (!trip?.summary || !trip.legs?.length) return null;
  const coords = trip.legs.flatMap((l) => decodePolyline(l.shape));
  return { coords, km: trip.summary.length, min: Math.round(trip.summary.time / 60), road: true };
}

/**
 * Itinéraire passant par tous les points, dans l'ordre fourni.
 * Retombe sur la distance orthodromique si le moteur n'est pas joignable.
 */
export async function routeThrough(pts: [number, number][]): Promise<RouteResult> {
  const direct: RouteResult = { coords: pts, km: pathKm(pts), min: null, road: false };
  if (pts.length < 2) return direct;
  try {
    const r = ENGINE === "valhalla" ? await viaValhalla(pts) : await viaOsrm(pts);
    return r ?? direct;
  } catch {
    return direct;
  }
}
