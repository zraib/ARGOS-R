import { Injectable } from "@nestjs/common";
import type { AircraftPosition, BoundingBox } from "@/modules/aviation/aircraft.types";
import type { FlightFeed } from "@/modules/aviation/ports/flight-feed.port";

// ============================================================================
// ARGOS — adaptateur « exercice » du port FlightFeed
//
// Flux synthétique pour l'instruction et la démonstration : il simule une
// noria de bombardiers d'eau sur les zones de feu du Rif, sans aucun appel
// réseau. Sert aussi de preuve que le port tient : le service applicatif est
// rigoureusement identique, seul l'adaptateur change (`AVIATION_FEED=exercise`).
//
// N'invente AUCUNE donnée quand le flux réel est actif : les deux adaptateurs
// sont exclusifs, et l'API annonce lequel est en service (champ `feed`) pour
// qu'un opérateur ne prenne jamais un vol d'exercice pour un vol réel.
// ============================================================================

/**
 * Flotte d'exercice. Indicatifs et immatriculations plausibles mais fictifs :
 * on ne prétend pas refléter la flotte réelle.
 */
const EXERCISE_FLEET = [
  { icao24: "02a101", callsign: "CNTZA", squawk: "7001", base: [-5.27, 35.17] as const, radius: 0.14 },
  { icao24: "02a102", callsign: "CNTZB", squawk: "7002", base: [-5.27, 35.17] as const, radius: 0.1 },
  { icao24: "02a103", callsign: "CNTZC", squawk: "7003", base: [-6.15, 35.19] as const, radius: 0.12 },
  { icao24: "02a201", callsign: "GRM01", squawk: "7101", base: [-4.01, 34.21] as const, radius: 0.08 },
  { icao24: "02a202", callsign: "GRM02", squawk: "7102", base: [-3.93, 35.25] as const, radius: 0.09 },
  { icao24: "02a301", callsign: "FRA101", squawk: "7201", base: [-5.6, 34.9] as const, radius: 0.3 },
] as const;

/** Durée d'un tour de noria, en millisecondes. */
const ORBIT_MS = 90_000;

@Injectable()
export class ExerciseFeed implements FlightFeed {
  readonly name = "Exercice (flux simulé)";

  async statesInBox(box: BoundingBox): Promise<AircraftPosition[]> {
    const now = Date.now();

    return EXERCISE_FLEET.map((a, i) => {
      // Chaque appareil parcourt son orbite avec un décalage de phase, pour que
      // la noria ne soit pas synchrone.
      const phase = ((now + i * 14_000) % ORBIT_MS) / ORBIT_MS;
      const angle = phase * Math.PI * 2;
      const lon = a.base[0] + Math.cos(angle) * a.radius;
      const lat = a.base[1] + Math.sin(angle) * a.radius * 0.7;
      // Cap tangent à l'orbite, ramené sur [0, 360[.
      const heading = (((angle * 180) / Math.PI + 90) % 360 + 360) % 360;
      // Un appareil est « au sol » au tout début de son cycle (écopage/base).
      const onGround = phase < 0.04;

      return {
        icao24: a.icao24,
        callsign: a.callsign,
        lat,
        lon,
        ll: [lon, lat] as [number, number],
        altitude: onGround ? 0 : 300 + Math.round(Math.sin(angle * 2) * 200 + 400),
        heading,
        velocity: onGround ? 0 : 60 + Math.round(Math.cos(angle) * 15),
        verticalRate: Math.round(Math.cos(angle * 2) * 6),
        onGround,
        squawk: a.squawk,
        lastContact: new Date(now).toISOString(),
        originCountry: "Morocco",
      } satisfies AircraftPosition;
    }).filter((p) => p.lat >= box.minLat && p.lat <= box.maxLat && p.lon >= box.minLon && p.lon <= box.maxLon);
  }
}

/** Codes disponibles en exercice, affichés à l'opérateur comme aide de saisie. */
export const EXERCISE_CODES: readonly string[] = EXERCISE_FLEET.map((a) => a.callsign);
