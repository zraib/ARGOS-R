import { Injectable, NotFoundException } from "@nestjs/common";
import { DEFAULT_FLAGS, type FlagsRepository } from "@/modules/flags/flags.repository";

/** Dépôt de feature flags in-memory (Phase 0). */
@Injectable()
export class FlagsMemoryRepository implements FlagsRepository {
  private readonly flags: Record<string, boolean> = { ...DEFAULT_FLAGS };

  async all(): Promise<Record<string, boolean>> {
    return { ...this.flags };
  }
  async set(key: string, enabled: boolean): Promise<Record<string, boolean>> {
    if (!(key in this.flags)) throw new NotFoundException(`Flag inconnu : ${key}`);
    this.flags[key] = enabled;
    return this.all();
  }
}
