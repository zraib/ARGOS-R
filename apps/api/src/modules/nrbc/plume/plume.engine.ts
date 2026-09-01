import type { ErgDistances, PlumeZone } from "@/modules/nrbc/nrbc.types";

// ============================================================================
// ARGOS — moteur de panache chimique (fonctions PURES)
//
// Deux référentiels de gabarits, derrière la même signature (ADR 0005) :
//
// - ATP-45 (OTAN, simplifié) : gabarit de PRÉVISION DE DANGER indépendant de
//   la substance. Vent ≤ 10 km/h → le nuage peut dériver dans TOUTES les
//   directions : cercle de danger 2 km + cercle de vigilance 10 km. Vent
//   > 10 km/h → cercle de danger 2 km + triangle de protection sous le vent
//   (sommet au point de rejet, portée 10 km, demi-angle 30°).
//
// - ERG 2024 (PHMSA) : gabarit PAR SUBSTANCE de la table 1. Cercle d'isolement
//   initial (toutes directions) + zone d'action de protection sous le vent :
//   un carré qui part du point de rejet, s'étend d'une distance D en aval et
//   s'élargit de D/2 de part et d'autre de l'axe — D dépendant du jour/nuit
//   et de l'ampleur du déversement.
//
// Ce sont des GABARITS DE PLANIFICATION, pas une simulation physique de la
// dispersion (ça, c'est Gauss — phase 4). Aucune horloge, aucun aléa, aucune
// entrée/sortie : mêmes entrées → mêmes polygones, testable au millimètre.
//
// Conventions : coordonnées [lon, lat] (ordre GeoJSON), anneaux FERMÉS
// (premier point répété en dernier), `windFromDeg` = direction MÉTÉO d'où
// vient le vent — l'axe du panache est donc `windFromDeg + 180°`.
// ============================================================================

const EARTH_RADIUS_KM = 6371;
const DEG = Math.PI / 180;

/** Seuil ATP-45 : en dessous, le vent ne définit pas de direction fiable. */
export const ATP45_LOW_WIND_KMH = 10;
/** Rayon du cercle de danger immédiat ATP-45 (km). */
export const ATP45_DANGER_KM = 2;
/** Portée du gabarit ATP-45 (rayon de vigilance ou hauteur du triangle, km). */
export const ATP45_HAZARD_KM = 10;
/** Demi-angle du triangle ATP-45 de part et d'autre de l'axe aval (degrés). */
export const ATP45_HALF_ANGLE_DEG = 30;

/**
 * Point d'arrivée en suivant un cap sur `distKm` (géométrie sphérique).
 * Précision largement suffisante aux portées du panache (< 15 km).
 */
export function destination(from: [number, number], bearingDeg: number, distKm: number): [number, number] {
  const [lon, lat] = from;
  const δ = distKm / EARTH_RADIUS_KM;
  const θ = bearingDeg * DEG;
  const φ1 = lat * DEG;
  const λ1 = lon * DEG;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [round6(λ2 / DEG), round6(φ2 / DEG)];
}

/** Anneau circulaire fermé autour d'un point (64 sommets par défaut). */
export function circleRing(center: [number, number], radiusKm: number, steps = 64): [number, number][] {
  const ring: [number, number][] = [];
  for (let i = 0; i < steps; i++) ring.push(destination(center, (i / steps) * 360, radiusKm));
  ring.push(ring[0]);
  return ring;
}

/** Arrondi à 6 décimales (~11 cm) : sorties stables et compactes sur le fil. */
function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

/**
 * Gabarit ATP-45 simplifié. `windFromDeg` peut être omis quand la prévision
 * est indisponible : on rend alors le seul cercle de danger (pas de zone
 * directionnelle inventée — doctrine d'honnêteté).
 */
export function atp45Zones(
  source: [number, number],
  windSpeedKmh: number | null,
  windFromDeg: number | null,
): PlumeZone[] {
  const zones: PlumeZone[] = [
    {
      model: "atp45",
      level: "danger",
      kind: "circle",
      radiusKm: ATP45_DANGER_KM,
      ring: circleRing(source, ATP45_DANGER_KM),
    },
  ];
  if (windSpeedKmh === null || windFromDeg === null) return zones;

  if (windSpeedKmh <= ATP45_LOW_WIND_KMH) {
    // Vent faible ou variable : la dérive est possible dans toutes les
    // directions — la zone de 10 km est une VIGILANCE, pas un ordre d'évacuer.
    zones.push({
      model: "atp45",
      level: "vigilance",
      kind: "circle",
      radiusKm: ATP45_HAZARD_KM,
      ring: circleRing(source, ATP45_HAZARD_KM),
    });
    // …ET l'axe le plus probable, EN PLUS du cercle (lot N-4e).
    //
    // Le cercle reste la zone doctrinale : c'est lui qu'on pose. Mais un vent
    // de 6 km/h a une direction, et un cercle de 10 km sur une agglomération ne
    // se tasque pas. L'ouverture grandit quand le vent faiblit — de 30° au
    // seuil jusqu'à 75° par vent quasi nul : c'est la façon honnête de dire
    // « voici l'axe, et voici combien j'en doute ».
    //
    // Le rendu la distingue du gabarit doctrinal (`lowWind`), et l'opérateur
    // peut retirer le cercle s'il veut travailler sur le seul axe.
    const spread =
      ATP45_HALF_ANGLE_DEG +
      (LOW_WIND_MAX_HALF_ANGLE_DEG - ATP45_HALF_ANGLE_DEG) *
        (1 - Math.min(Math.max(windSpeedKmh, 0), ATP45_LOW_WIND_KMH) / ATP45_LOW_WIND_KMH);
    zones.push(downwindWedge(source, windFromDeg, spread, true));
    return zones;
  }

  // Vent établi : la nappe seule suffit, l'ATP-45 ne demande pas de cercle
  // omnidirectionnel au-delà du seuil.
  zones.push(downwindWedge(source, windFromDeg, ATP45_HALF_ANGLE_DEG, false));
  return zones;
}

/**
 * Demi-ouverture maximale de la nappe, par vent quasi nul (lot N-4e).
 *
 * À 75°, la nappe couvre 150° — la moitié de l'horizon aval. Au-delà elle
 * cesserait de dire quoi que ce soit d'utile, et le cercle omnidirectionnel
 * qu'elle accompagne dit déjà « partout ».
 */
export const LOW_WIND_MAX_HALF_ANGLE_DEG = 75;

/**
 * Nappe sous le vent, TANGENTE au cercle d'isolement et fermée par un arc.
 *
 * ELLE NE PART PAS D'UN POINT. Le triangle à sommet sur le rejet, employé
 * jusqu'au lot N-4b, faisait naître le danger d'une singularité : à cinquante
 * mètres du déversement sa largeur était nulle. Or le rejet occupe déjà le
 * cercle d'isolement, et la zone sous le vent s'ouvre depuis son BORD.
 *
 * La construction suit le principe du GMU 2024 (« Mode d'emploi du tableau 1 »,
 * p. 284-285) : isoler « dans TOUTES les directions », PUIS protéger sous le
 * vent à partir de cette emprise.
 */
function downwindWedge(
  source: [number, number],
  windFromDeg: number,
  halfAngleDeg: number,
  lowWind: boolean,
): PlumeZone {
  const axis = (windFromDeg + 180) % 360;
  const ring: [number, number][] = [];

  ring.push(destination(source, axis - 90, ATP45_DANGER_KM));
  ring.push(destination(source, axis - halfAngleDeg, ATP45_HAZARD_KM));
  // Arc aval : la limite de portée est à distance CONSTANTE du rejet, donc
  // courbe. Une corde droite la sous-estimerait en son milieu.
  const steps = 16;
  for (let i = 1; i < steps; i++) {
    ring.push(destination(source, axis - halfAngleDeg + (2 * halfAngleDeg * i) / steps, ATP45_HAZARD_KM));
  }
  ring.push(destination(source, axis + halfAngleDeg, ATP45_HAZARD_KM));
  ring.push(destination(source, axis + 90, ATP45_DANGER_KM));
  // Retour par l'amont en suivant le cercle d'isolement : la zone ENGLOBE le
  // rejet au lieu de s'y appuyer par une pointe.
  for (let i = 1; i < 8; i++) {
    ring.push(destination(source, axis + 90 + (180 * i) / 8, ATP45_DANGER_KM));
  }
  ring.push(ring[0]);

  return {
    model: "atp45",
    level: "protection",
    kind: "wedge",
    reachKm: ATP45_HAZARD_KM,
    ...(lowWind ? { lowWind: true } : {}),
    ring,
  };
}

/**
 * Gabarit ERG 2024 pour une substance de la table 1. Le cercle d'isolement ne
 * dépend pas du vent ; la zone d'action de protection (carré aval) n'est
 * rendue que si la direction du vent est connue.
 */
export function ergZones(
  source: [number, number],
  distances: ErgDistances,
  isDay: boolean,
  windFromDeg: number | null,
): PlumeZone[] {
  const zones: PlumeZone[] = [
    {
      model: "erg",
      level: "danger",
      kind: "circle",
      radiusKm: distances.isolationM / 1000,
      ring: circleRing(source, distances.isolationM / 1000),
    },
  ];
  if (windFromDeg === null) return zones;

  const reachKm = isDay ? distances.protectDayKm : distances.protectNightKm;
  const axis = (windFromDeg + 180) % 360;
  // Carré du guide orange : part du point de rejet, s'étend de `reachKm` en
  // aval, demi-largeur `reachKm / 2` de part et d'autre de l'axe.
  const half = reachKm / 2;
  const nearLeft = destination(source, axis - 90, half);
  const nearRight = destination(source, axis + 90, half);
  const farLeft = destination(nearLeft, axis, reachKm);
  const farRight = destination(nearRight, axis, reachKm);
  zones.push({
    model: "erg",
    level: "protection",
    kind: "square",
    reachKm,
    ring: [nearLeft, farLeft, farRight, nearRight, nearLeft],
  });
  return zones;
}
