import type { TrackedAircraft } from "@/modules/aviation/aircraft.types";

// ============================================================================
// ARGOS — port « liste de suivi aérien »
//
// Le service applicatif ne connaît ni tableau en mémoire, ni Drizzle, ni SQL :
// il ne connaît que ce contrat. L'implémentation in-memory du mode dev et une
// future implémentation Postgres sont interchangeables sans qu'une ligne du
// service ne bouge (principe de substitution de Liskov).
// ============================================================================

/** Champs modifiables d'un appareil inscrit. */
export type AircraftPatch = Partial<Pick<TrackedAircraft, "label" | "role" | "incidentId" | "archived">>;

export interface AircraftWatchlistRepository {
  /** Tous les appareils inscrits, archivés compris. Le filtrage est au service. */
  list(): Promise<TrackedAircraft[]>;
  findById(id: string): Promise<TrackedAircraft | null>;
  /** Recherche par code normalisé — sert à refuser les doublons. */
  findByCode(code: string): Promise<TrackedAircraft | null>;
  add(aircraft: TrackedAircraft): Promise<TrackedAircraft>;
  update(id: string, patch: AircraftPatch): Promise<TrackedAircraft>;
  /** Suppression définitive — réservée au superadmin par le RBAC. */
  remove(id: string): Promise<void>;
}

/** Jeton d'injection Nest. */
export const AIRCRAFT_WATCHLIST = Symbol("AIRCRAFT_WATCHLIST");
