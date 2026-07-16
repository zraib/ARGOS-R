import { Injectable } from "@nestjs/common";
import type { AuditEntry, AuditRepository } from "@/modules/audit/audit.repository";

/** Dépôt d'audit in-memory (Phase 0). */
@Injectable()
export class AuditMemoryRepository implements AuditRepository {
  private readonly entries: AuditEntry[] = [];

  async append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
  async list(limit: number): Promise<AuditEntry[]> {
    return this.entries.slice(-limit).reverse();
  }
  async all(): Promise<AuditEntry[]> {
    return [...this.entries];
  }
  async lastHash(): Promise<string | null> {
    return this.entries.length ? this.entries[this.entries.length - 1].hash : null;
  }
  async count(): Promise<number> {
    return this.entries.length;
  }
}
