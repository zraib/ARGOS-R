// ============================================================================
// ARGOS — port de persistance des missions
//
// L'ABSTRACTION de l'inversion des dépendances : `MissionService` dépend de
// cette interface, jamais d'un dépôt concret. Le contrat est défini ICI, dans
// la couche métier — les adaptateurs (mémoire aujourd'hui, Postgres demain)
// s'y plient.
//
// Lecture et écriture sont séparées (ségrégation des interfaces) : une future
// projection de tableau de bord dépendra de `MissionReader` seul.
// ============================================================================

import type { MissionKind, MissionSnapshot, MissionState } from "@/modules/missions/domain/mission";

/** Critères de filtrage d'une recherche de missions. */
export interface MissionQuery {
  incidentId?: string;
  kind?: MissionKind;
  state?: MissionState;
  /** Missions dont l'entité est destinataire. */
  toEntity?: string;
  /** Missions dont l'entité est émettrice. */
  fromEntity?: string;
  /** Missions dont le rôle destinataire correspond. */
  toRole?: string;
  /** N'inclure que les boucles ouvertes (ni refusées, ni terminées, ni annulées). */
  openOnly?: boolean;
}

/** Opérations de lecture. */
export interface MissionReader {
  findById(id: string): Promise<MissionSnapshot | null>;
  /** Missions correspondant aux critères, de la plus récemment modifiée à la plus ancienne. */
  findAll(query?: MissionQuery): Promise<MissionSnapshot[]>;
  /** Plus grand numéro de séquence déjà attribué (génération d'identifiants). */
  lastSequence(): Promise<number>;
}

/** Opérations d'écriture. */
export interface MissionWriter {
  /** Insère ou remplace une mission (idempotent sur l'identifiant). */
  save(mission: MissionSnapshot): Promise<void>;
  /** Suppression définitive — cascade de suppression d'incident uniquement. */
  removeByIncident(incidentId: string): Promise<number>;
}

/** Contrat complet attendu par le service applicatif. */
export type MissionRepository = MissionReader & MissionWriter;

/** Jeton d'injection : un Symbol, impossible à collisionner. */
export const MISSION_REPOSITORY = Symbol("MISSION_REPOSITORY");
