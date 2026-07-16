import { desc } from "drizzle-orm";
import type { Db } from "@/db/client";
import { auditLog } from "@/db/schema";
import type { AuditEntry, AuditRepository } from "@/modules/audit/audit.repository";

/** Dépôt d'audit Drizzle/Postgres (table append-only `audit_log`). */
export class AuditDrizzleRepository implements AuditRepository {
  constructor(private readonly db: Db) {}

  private toEntry(r: typeof auditLog.$inferSelect): AuditEntry {
    return {
      seq: r.seq,
      ts: r.ts instanceof Date ? r.ts.toISOString() : String(r.ts),
      actor: r.actor,
      role: r.role,
      method: r.method,
      path: r.path,
      status: r.status ?? undefined,
      prevHash: r.prevHash,
      hash: r.hash,
      meta: (r.meta as Record<string, unknown> | null) ?? undefined,
    };
  }

  async append(entry: AuditEntry): Promise<void> {
    await this.db.insert(auditLog).values({
      seq: entry.seq,
      ts: new Date(entry.ts),
      actor: entry.actor,
      role: entry.role,
      method: entry.method,
      path: entry.path,
      status: entry.status,
      prevHash: entry.prevHash,
      hash: entry.hash,
      meta: entry.meta,
    });
  }

  async list(limit: number): Promise<AuditEntry[]> {
    const rows = await this.db.select().from(auditLog).orderBy(desc(auditLog.seq)).limit(limit);
    return rows.map((r) => this.toEntry(r));
  }

  async all(): Promise<AuditEntry[]> {
    const rows = await this.db.select().from(auditLog).orderBy(auditLog.seq);
    return rows.map((r) => this.toEntry(r));
  }

  async lastHash(): Promise<string | null> {
    const rows = await this.db.select({ hash: auditLog.hash }).from(auditLog).orderBy(desc(auditLog.seq)).limit(1);
    return rows[0]?.hash ?? null;
  }

  async count(): Promise<number> {
    const rows = await this.db.select({ seq: auditLog.seq }).from(auditLog).orderBy(desc(auditLog.seq)).limit(1);
    return rows[0]?.seq ?? 0;
  }
}
