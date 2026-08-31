import { Injectable } from "@nestjs/common";
import type { Substance } from "@/modules/nrbc/nrbc.types";
import { SUBSTANCES } from "@/modules/nrbc/infrastructure/substances.data";
import type { SubstanceCatalog } from "@/modules/nrbc/ports/substance-catalog.port";

// ============================================================================
// ARGOS — catalogue de substances en mémoire (adaptateur de développement)
//
// Les données et TOUTE la discipline de provenance vivent dans
// `substances.data.ts` : ce fichier n'est plus qu'un adaptateur du port
// `SubstanceCatalog`. Demain une table Postgres alimentée par l'état-major
// prendra sa place sans qu'une ligne du service ne bouge.
// ============================================================================


@Injectable()
export class InMemorySubstancesRepository implements SubstanceCatalog {
  private readonly substances = SUBSTANCES;

  async list(): Promise<Substance[]> {
    return this.substances;
  }

  async findById(id: string): Promise<Substance | null> {
    return this.substances.find((s) => s.id === id) ?? null;
  }
}
