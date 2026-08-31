import { Injectable } from "@nestjs/common";
import type { Substance } from "@/modules/nrbc/nrbc.types";
import { SUBSTANCES } from "@/modules/nrbc/infrastructure/substances.data";
import type { SubstanceCatalog } from "@/modules/nrbc/ports/substance-catalog.port";
import { loadImportedLibrary, mergeLibrary, type ImportedLibrary } from "@/modules/nrbc/infrastructure/substance-import";

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
  private readonly substances: Substance[];
  /** Jeu sous licence chargé, s'il y en a un — sa provenance remonte à l'écran. */
  readonly imported: ImportedLibrary | null;

  constructor() {
    // Un fichier ABSENT n'est pas une erreur : l'application tourne avec la
    // bibliothèque livrée. Un fichier PRÉSENT mais invalide fait échouer le
    // démarrage — un référentiel de sécurité à moitié chargé est un piège,
    // puisqu'on croit consulter la base complète.
    this.imported = loadImportedLibrary();
    this.substances = this.imported ? mergeLibrary(SUBSTANCES, this.imported.substances) : SUBSTANCES;
  }

  async list(): Promise<Substance[]> {
    return this.substances;
  }

  origin() {
    if (!this.imported) return null;
    const { source, retrievedAt, authorization } = this.imported;
    return { source, retrievedAt, authorization };
  }

  async findById(id: string): Promise<Substance | null> {
    return this.substances.find((s) => s.id === id) ?? null;
  }
}
