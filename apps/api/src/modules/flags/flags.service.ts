import { Inject, Injectable } from "@nestjs/common";
import { FLAGS_REPOSITORY, type FlagsRepository } from "@/modules/flags/flags.repository";

/**
 * Durée de vie du cache des drapeaux. Depuis l'ADR 0015 la garde RBAC consulte
 * les drapeaux à CHAQUE requête gardée : sans cache, chaque appel coûterait
 * une lecture en base sur la station (Postgres). Une station n'a qu'une
 * instance d'API et toute écriture passe par `set()`, qui rafraîchit le cache :
 * la valeur servie n'est jamais périmée localement ; le délai ne couvre que le
 * cas — théorique ici — d'une écriture par une autre instance.
 */
const FLAGS_CACHE_MS = 5_000;

/**
 * Service de feature flags (MASTER_PLAN §6.15). Les flags portent les modules
 * globalement. Stockage abstrait par dépôt (in-memory ou Postgres/Drizzle).
 */
@Injectable()
export class FlagsService {
  private cache?: { at: number; value: Record<string, boolean> };

  constructor(@Inject(FLAGS_REPOSITORY) private readonly repo: FlagsRepository) {}

  async all(): Promise<Record<string, boolean>> {
    if (this.cache && Date.now() - this.cache.at < FLAGS_CACHE_MS) return this.cache.value;
    const value = await this.repo.all();
    this.cache = { at: Date.now(), value };
    return value;
  }

  async set(key: string, enabled: boolean): Promise<Record<string, boolean>> {
    const value = await this.repo.set(key, enabled);
    this.cache = { at: Date.now(), value };
    return value;
  }
}
