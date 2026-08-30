// ============================================================================
// ARGOS — port horloge du module missions
//
// `new Date()` est une dépendance cachée vers l'environnement : elle rend le
// service non déterministe. On l'inverse — les tests injectent une horloge
// figée et vérifient les horodatages au caractère près.
// ============================================================================

/** Source de temps du service. */
export interface Clock {
  now(): Date;
  /** Horodatage court affiché dans l'IHM (« 06:15 »). */
  shortLabel(): string;
}

export const MISSION_CLOCK = Symbol("MISSION_CLOCK");
