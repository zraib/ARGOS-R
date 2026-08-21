import type { Substance } from "@/modules/nrbc/nrbc.types";

// ============================================================================
// ARGOS — port « catalogue de substances chimiques »
//
// Même principe que la liste de suivi aérien (ADR 0004) : le service NRBC ne
// connaît que ce contrat. Aujourd'hui un tableau en mémoire seedé depuis la
// table 1 de l'ERG 2024 ; demain une table Postgres alimentée par l'état-major,
// sans qu'une ligne du service ne bouge.
// ============================================================================

export interface SubstanceCatalog {
  list(): Promise<Substance[]>;
  findById(id: string): Promise<Substance | null>;
}

/** Jeton d'injection Nest. */
export const SUBSTANCE_CATALOG = Symbol("SUBSTANCE_CATALOG");
