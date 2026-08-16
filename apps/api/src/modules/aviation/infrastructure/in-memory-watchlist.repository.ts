import { Injectable, NotFoundException } from "@nestjs/common";
import type { TrackedAircraft } from "@/modules/aviation/aircraft.types";
import type { AircraftPatch, AircraftWatchlistRepository } from "@/modules/aviation/ports/aircraft-watchlist.port";

// ============================================================================
// ARGOS — adaptateur in-memory du port AircraftWatchlistRepository
//
// Mode développement, sans Docker ni base. Une implémentation Drizzle/Postgres
// se substituera à celle-ci en changeant le seul `useClass` du module : le
// service applicatif n'en saura rien.
// ============================================================================

@Injectable()
export class InMemoryWatchlistRepository implements AircraftWatchlistRepository {
  /**
   * Liste vide au démarrage : le commandement inscrit lui-même les appareils
   * qu'il engage. On ne pré-remplit pas une flotte fictive qu'un opérateur
   * pourrait prendre pour la situation réelle.
   */
  private readonly aircraft: TrackedAircraft[] = [];

  async list(): Promise<TrackedAircraft[]> {
    return this.aircraft.map((a) => ({ ...a }));
  }

  async findById(id: string): Promise<TrackedAircraft | null> {
    const found = this.aircraft.find((a) => a.id === id);
    return found ? { ...found } : null;
  }

  async findByCode(code: string): Promise<TrackedAircraft | null> {
    const found = this.aircraft.find((a) => a.code === code);
    return found ? { ...found } : null;
  }

  async add(aircraft: TrackedAircraft): Promise<TrackedAircraft> {
    this.aircraft.push({ ...aircraft });
    return { ...aircraft };
  }

  async update(id: string, patch: AircraftPatch): Promise<TrackedAircraft> {
    const idx = this.aircraft.findIndex((a) => a.id === id);
    if (idx < 0) throw new NotFoundException(`Aéronef inconnu : ${id}`);
    // `undefined` ne doit pas écraser une valeur existante : on n'applique que
    // les clés réellement fournies.
    const current = this.aircraft[idx];
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) Object.assign(current, { [key]: value });
    }
    return { ...current };
  }

  async remove(id: string): Promise<void> {
    const idx = this.aircraft.findIndex((a) => a.id === id);
    if (idx < 0) throw new NotFoundException(`Aéronef inconnu : ${id}`);
    this.aircraft.splice(idx, 1);
  }
}
