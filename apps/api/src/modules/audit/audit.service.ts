import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { AUDIT_REPOSITORY, type AuditEntry, type AuditInput, type AuditRepository } from "@/modules/audit/audit.repository";

const GENESIS = "0".repeat(64);

/**
 * Journal d'audit append-only et infalsifiable (chaîné par hash) — MASTER_PLAN
 * §4.3. Chaque ligne inclut le hash de la précédente ; toute altération casse la
 * chaîne, détectable par `verify()`. Le stockage est abstrait par un dépôt
 * (in-memory en Phase 0, table PostgreSQL `audit_log` en production).
 *
 * NB : sous forte concurrence, lire `count`/`lastHash` puis `append` doit se
 * faire dans une transaction avec verrou (advisory lock) — à durcir en prod.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(AUDIT_REPOSITORY) private readonly repo: AuditRepository) {}

  private computeHash(e: Omit<AuditEntry, "hash">): string {
    const payload = `${e.seq}|${e.ts}|${e.actor}|${e.role}|${e.method}|${e.path}|${e.status ?? ""}|${e.prevHash}|${JSON.stringify(e.meta ?? {})}`;
    return createHash("sha256").update(payload).digest("hex");
  }

  async record(input: AuditInput): Promise<AuditEntry> {
    const count = await this.repo.count();
    const prevHash = (await this.repo.lastHash()) ?? GENESIS;
    const base: Omit<AuditEntry, "hash"> = {
      seq: count + 1,
      ts: new Date().toISOString(),
      actor: input.actor,
      role: input.role,
      method: input.method,
      path: input.path,
      status: input.status,
      prevHash,
      meta: input.meta,
    };
    const entry: AuditEntry = { ...base, hash: this.computeHash(base) };
    await this.repo.append(entry);
    return entry;
  }

  async list(limit = 100): Promise<AuditEntry[]> {
    return this.repo.list(limit);
  }

  /** Recalcule toute la chaîne : détecte insertion, suppression ou modification. */
  async verify(): Promise<{ valid: boolean; count: number; brokenAt?: number }> {
    const entries = await this.repo.all();
    let prevHash = GENESIS;
    for (const e of entries) {
      const { hash, ...base } = e;
      if (base.prevHash !== prevHash) return { valid: false, count: entries.length, brokenAt: e.seq };
      if (this.computeHash(base) !== hash) return { valid: false, count: entries.length, brokenAt: e.seq };
      prevHash = hash;
    }
    return { valid: true, count: entries.length };
  }
}
