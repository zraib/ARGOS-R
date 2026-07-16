import { NotFoundException } from "@nestjs/common";
import type { Db } from "@/db/client";
import { featureFlags } from "@/db/schema";
import { DEFAULT_FLAGS, type FlagsRepository } from "@/modules/flags/flags.repository";

/** Dépôt de feature flags Drizzle/Postgres (table `feature_flags`). */
export class FlagsDrizzleRepository implements FlagsRepository {
  constructor(private readonly db: Db) {}

  /** Insère les flags par défaut si la table est vide (premier démarrage). */
  private async ensureSeeded(): Promise<void> {
    const rows = await this.db.select({ key: featureFlags.key }).from(featureFlags).limit(1);
    if (rows.length > 0) return;
    await this.db
      .insert(featureFlags)
      .values(Object.entries(DEFAULT_FLAGS).map(([key, enabled]) => ({ key, enabled })))
      .onConflictDoNothing();
  }

  async all(): Promise<Record<string, boolean>> {
    await this.ensureSeeded();
    const rows = await this.db.select().from(featureFlags);
    return Object.fromEntries(rows.map((r) => [r.key, r.enabled]));
  }

  async set(key: string, enabled: boolean): Promise<Record<string, boolean>> {
    if (!(key in DEFAULT_FLAGS)) throw new NotFoundException(`Flag inconnu : ${key}`);
    await this.ensureSeeded();
    await this.db
      .insert(featureFlags)
      .values({ key, enabled, updatedAt: new Date() })
      .onConflictDoUpdate({ target: featureFlags.key, set: { enabled, updatedAt: new Date() } });
    return this.all();
  }
}
