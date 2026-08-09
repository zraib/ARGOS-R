// ============================================================================
// ARGOS — port horloge
//
// `new Date()` est une dépendance cachée vers l'environnement : elle rend le
// service non déterministe et donc difficilement testable. On l'inverse comme
// n'importe quelle autre dépendance — le service reçoit une horloge, les tests
// en injectent une figée.
// ============================================================================

/** Source de temps du service. */
export interface Clock {
  now(): Date;
  /**
   * Horodatage court affiché dans l'IHM (« 06:15 »), calculé dans le fuseau
   * de l'horloge : le domaine n'a pas à connaître les règles de formatage.
   */
  shortLabel(): string;
}

export const CLOCK = Symbol("ORDERS_CLOCK");
