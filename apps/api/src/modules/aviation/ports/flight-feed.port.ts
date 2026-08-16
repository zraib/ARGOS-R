import type { AircraftPosition, BoundingBox } from "@/modules/aviation/aircraft.types";

// ============================================================================
// ARGOS — port « flux de positions aériennes »
//
// Inversion de dépendance : le service applicatif dépend de CETTE interface, et
// jamais d'OpenSky. Changer de fournisseur (Flightradar24 sous licence, flux
// radar national, récepteur ADS-B souverain posé sur un toit) revient à écrire
// un nouvel adaptateur et à changer une ligne dans le module — sans toucher au
// service ni aux écrans. Voir docs/adr/0004.
// ============================================================================

export interface FlightFeed {
  /** Nom du fournisseur, exposé à l'opérateur pour qu'il sache d'où vient la donnée. */
  readonly name: string;

  /**
   * Positions de TOUS les aéronefs présents dans l'emprise donnée.
   *
   * Volontairement une requête par **emprise géographique** et non par liste de
   * codes : interroger la source appareil par appareil lui révélerait quels
   * aéronefs le commandement surveille. Le filtrage sur la liste de suivi se
   * fait donc côté ARGOS. Voir docs/adr/0004 § Souveraineté.
   *
   * En cas d'indisponibilité de la source, l'implémentation doit se dégrader
   * (dernier cache connu, sinon tableau vide) plutôt que de lever : une carte
   * sans avions reste utilisable, une carte en erreur ne l'est pas.
   */
  statesInBox(box: BoundingBox): Promise<AircraftPosition[]>;
}

/** Jeton d'injection Nest (une interface TypeScript n'existe pas à l'exécution). */
export const FLIGHT_FEED = Symbol("FLIGHT_FEED");
