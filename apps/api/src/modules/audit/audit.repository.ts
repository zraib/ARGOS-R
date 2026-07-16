export interface AuditEntry {
  seq: number;
  ts: string;
  actor: string;
  role: string;
  method: string;
  path: string;
  status?: number;
  prevHash: string;
  hash: string;
  meta?: Record<string, unknown>;
}

export interface AuditInput {
  actor: string;
  role: string;
  method: string;
  path: string;
  status?: number;
  meta?: Record<string, unknown>;
}

/** Dépôt du journal d'audit (append-only). Implémentations : in-memory, Drizzle. */
export interface AuditRepository {
  append(entry: AuditEntry): Promise<void>;
  /** Les plus récentes d'abord. */
  list(limit: number): Promise<AuditEntry[]>;
  /** Toutes, ordonnées par seq croissant (pour la vérification de chaîne). */
  all(): Promise<AuditEntry[]>;
  lastHash(): Promise<string | null>;
  count(): Promise<number>;
}

export const AUDIT_REPOSITORY = "AUDIT_REPOSITORY";
