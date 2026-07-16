import { Inject, Injectable } from "@nestjs/common";
import { FLAGS_REPOSITORY, type FlagsRepository } from "@/modules/flags/flags.repository";

/**
 * Service de feature flags (MASTER_PLAN §6.15). Les flags portent les modules
 * globalement. Stockage abstrait par dépôt (in-memory ou Postgres/Drizzle).
 */
@Injectable()
export class FlagsService {
  constructor(@Inject(FLAGS_REPOSITORY) private readonly repo: FlagsRepository) {}

  all(): Promise<Record<string, boolean>> {
    return this.repo.all();
  }

  set(key: string, enabled: boolean): Promise<Record<string, boolean>> {
    return this.repo.set(key, enabled);
  }
}
