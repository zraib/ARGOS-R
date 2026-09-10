// ============================================================================
// ARGOS — géographie de référence : régions, provinces, villes, et le point
//
// UN SEUL ENDROIT pour la cascade région → province → ville et pour la lecture
// inverse d'un point (« ce point est dans quelle province, près de quelle
// ville ? »). Le wizard d'incident, les modales d'unité, d'hôpital et d'abri et
// le rattachement des comptes lisent tous ici. Avant, chaque écran refaisait
// ses filtres, et deux d'entre eux filtraient les villes par RÉGION là où il
// fallait la province.
//
// Les données viennent de l'API (`/reference`) via le magasin ; ce module ne
// porte aucune liste, seulement les règles.
// ============================================================================

import { svgToLL } from "@/lib/helpers";
import type { City, Province } from "@/lib/types";

/** Les régions, dérivées des provinces — dans l'ordre du référentiel (trié). */
export function regionsOf(provinces: readonly Province[]): string[] {
  return [...new Set(provinces.map((p) => p.region))].sort((a, b) => a.localeCompare(b, "fr"));
}

/** Les provinces d'une région ; toutes si aucune région n'est choisie. */
export function provincesOf(provinces: readonly Province[], region: string | undefined): Province[] {
  return region ? provinces.filter((p) => p.region === region) : [...provinces];
}

/**
 * Les villes d'une province — de la PROVINCE, pas de sa région. Sans province
 * choisie mais avec une région, celles de la région ; sinon toutes.
 */
export function citiesOf(cities: readonly City[], province: string | undefined, region?: string): City[] {
  if (province) return cities.filter((c) => c.province === province);
  if (region) return cities.filter((c) => c.region === region);
  return [...cities];
}

/** Coordonnées d'une province : son chef-lieu, sinon la conversion SVG. */
export function provinceLL(p: Province): [number, number] {
  return p.ll ?? svgToLL(p.x, p.y);
}

/** Distance en km entre deux points [lng, lat] (équirectangulaire — suffisant au pays). */
export function distKm(a: [number, number], b: [number, number]): number {
  const dLat = (a[1] - b[1]) * 111;
  const dLng = (a[0] - b[0]) * 111 * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.round(Math.sqrt(dLat * dLat + dLng * dLng));
}

function nearest<T>(items: readonly T[], at: (x: T) => [number, number], ll: [number, number]): T | undefined {
  let best: T | undefined;
  let bestD = Infinity;
  for (const it of items) {
    const p = at(it);
    const d = (p[0] - ll[0]) ** 2 + (p[1] - ll[1]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = it;
    }
  }
  return best;
}

/** Province la plus proche d'un point (par son chef-lieu). */
export function nearestProvince(ll: [number, number], provinces: readonly Province[]): Province | undefined {
  return nearest(provinces, provinceLL, ll);
}

/**
 * Ville la plus proche d'un point, dans un rayon donné. Au-delà, aucune : un
 * point en plein Atlas n'est « près » d'aucune ville, et l'inscrire quand même
 * inventerait une localité.
 */
export function nearestCity(ll: [number, number], cities: readonly City[], maxKm = 25): City | undefined {
  const c = nearest(cities, (x) => x.ll, ll);
  return c && distKm(c.ll, ll) <= maxKm ? c : undefined;
}

/** Ce qu'un point dit de lui-même : sa province (donc sa région) et, s'il y en a une assez près, sa ville. */
export interface ResolvedPlace {
  region: string | undefined;
  province: string | undefined;
  city: string | undefined;
}

export function resolvePoint(ll: [number, number], provinces: readonly City[] | readonly Province[] | { provinces: readonly Province[]; cities: readonly City[] }, cities?: readonly City[]): ResolvedPlace {
  const ctx = "provinces" in provinces ? provinces : { provinces: provinces as readonly Province[], cities: cities ?? [] };
  const city = nearestCity(ll, ctx.cities);
  // La ville, quand il y en a une, fait foi pour la province : elle est
  // rattachée administrativement, là où le chef-lieu le plus proche peut être
  // celui de la province voisine.
  const province = city ? ctx.provinces.find((p) => p.v === city.province) : nearestProvince(ll, ctx.provinces);
  return { region: province?.region, province: province?.v, city: city?.v };
}
