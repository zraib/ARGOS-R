// ============================================================================
// ARGOS — port de génération d'identifiants
//
// La forme de l'identifiant (« BT-3392 » aujourd'hui, un UUID ou un numéro
// alloué par la base demain) est un détail d'infrastructure. Le service
// demande « l'identifiant suivant » sans savoir d'où il vient.
// ============================================================================

/** Fournisseur d'identifiants de bons de travail. */
export interface OrderIdGenerator {
  next(): Promise<string>;
}

export const ORDER_ID_GENERATOR = Symbol("ORDER_ID_GENERATOR");
