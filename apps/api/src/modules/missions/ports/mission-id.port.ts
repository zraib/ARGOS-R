// ============================================================================
// ARGOS — port de génération d'identifiants de mission
//
// La forme de l'identifiant (« M-0007 » aujourd'hui, un UUID ou un numéro
// alloué par la base demain) est un détail d'infrastructure.
// ============================================================================

/** Fournisseur d'identifiants de missions. */
export interface MissionIdGenerator {
  next(): Promise<string>;
}

export const MISSION_ID_GENERATOR = Symbol("MISSION_ID_GENERATOR");
