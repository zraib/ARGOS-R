import type { AircraftPosition, TrackedAircraft, TrackingStatus } from "@/modules/aviation/aircraft.types";
import { normalizeCode } from "@/modules/aviation/aircraft.types";

// ============================================================================
// ARGOS — appariement « appareil inscrit » ↔ « écho du flux »
//
// Fichier PUR : aucune dépendance Nest, réseau ou base. C'est la seule règle
// métier délicate du module, donc elle est isolée pour être testable seule.
// ============================================================================

/**
 * Un écho ADS-B correspond-il à l'appareil inscrit ?
 *
 * Chaque nature de code a sa clé d'appariement :
 *
 * - `icao24` — comparaison directe sur l'adresse 24 bits. Sans ambiguïté.
 * - `squawk` — code Mode 3A / IFF affiché par l'équipage. Attention : un squawk
 *   n'est unique que localement et il est réattribué d'un vol à l'autre ; on ne
 *   l'apparie donc que si l'appareil n'a pas d'adresse OACI connue.
 * - `callsign` — indicatif émis, comparé après normalisation (le flux bourre le
 *   champ d'espaces à droite).
 * - `registration` — l'ADS-B ne transmet PAS l'immatriculation. Mais en
 *   aviation d'État et générale, l'équipage émet très souvent son
 *   immatriculation comme indicatif (« CNTZS »). On tente donc l'indicatif, et
 *   l'adresse OACI dès qu'un opérateur l'a renseignée.
 */
export function matches(aircraft: TrackedAircraft, pos: AircraftPosition): boolean {
  // Un lien OACI explicite, quand il existe, prime sur toute heuristique.
  if (aircraft.icao24 && aircraft.icao24.toLowerCase() === pos.icao24.toLowerCase()) return true;

  const code = aircraft.code;
  const callsign = pos.callsign ? normalizeCode(pos.callsign) : null;

  switch (aircraft.codeKind) {
    case "icao24":
      return pos.icao24.toUpperCase() === code;
    case "squawk":
      // Réservé aux appareils sans adresse OACI connue (voir en-tête).
      return !aircraft.icao24 && pos.squawk !== null && pos.squawk === code;
    case "callsign":
    case "registration":
      return callsign !== null && callsign === code;
  }
}

/** Statut de suivi déduit de la présence et de la nature de l'écho. */
export function statusOf(pos: AircraftPosition | null): TrackingStatus {
  if (!pos) return "no_signal";
  return pos.onGround ? "ground" : "airborne";
}

/**
 * Apparie une liste d'inscrits aux échos du flux.
 *
 * Quand plusieurs échos correspondent (indicatif réutilisé, squawk partagé), on
 * retient le **contact le plus récent** : sur un feu, la position fraîche est la
 * seule qui engage une décision.
 */
export function resolvePositions(
  fleet: readonly TrackedAircraft[],
  states: readonly AircraftPosition[],
): Map<string, AircraftPosition> {
  const out = new Map<string, AircraftPosition>();
  for (const aircraft of fleet) {
    for (const pos of states) {
      if (!matches(aircraft, pos)) continue;
      const kept = out.get(aircraft.id);
      if (!kept || pos.lastContact > kept.lastContact) out.set(aircraft.id, pos);
    }
  }
  return out;
}
