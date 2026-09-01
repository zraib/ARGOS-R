import type { Tracker, TrackerFix, TrackerPatch } from "@/modules/tracking/tracking.types";

// ============================================================================
// ARGOS — port « registre des traceurs » (lot N-2)
//
// Le service applicatif ne connaît ni tableau en mémoire, ni Drizzle, ni SQL :
// il ne connaît que ce contrat. L'implémentation in-memory du mode dev et une
// future implémentation Postgres/TimescaleDB sont interchangeables sans qu'une
// ligne du service ne bouge (ADR 0004).
// ============================================================================

export interface TrackerRegistry {
  /** Tous les traceurs, archivés compris. Le filtrage appartient au service. */
  list(): Promise<Tracker[]>;
  findById(id: string): Promise<Tracker | null>;
  /** Recherche par IMEI — sert à la poignée de main ET à refuser les doublons. */
  findByImei(imei: string): Promise<Tracker | null>;
  add(tracker: Tracker): Promise<Tracker>;
  update(id: string, patch: TrackerPatch): Promise<Tracker>;
  /** Suppression définitive — réservée au superadmin par le RBAC. */
  remove(id: string): Promise<void>;
  /**
   * Verse une position relevée. Séparée de `update` parce qu'elle vient du
   * BOÎTIER et non d'un opérateur : elle n'est jamais soumise aux mêmes droits,
   * et une future implémentation l'écrira dans une hypertable de séries
   * temporelles plutôt que dans la ligne du traceur.
   */
  appendFix(id: string, fix: TrackerFix): Promise<void>;
  /** Note un contact sans fix — le boîtier parle, mais ne se localise pas. */
  touch(id: string, at: string): Promise<void>;
}

/** Jeton d'injection Nest. */
export const TRACKER_REGISTRY = Symbol("TRACKER_REGISTRY");
