// ============================================================================
// ARGOS — port de publication d'événements de mission
//
// Le service annonce ce qui s'est passé ; il ne décide pas de ce qu'on en
// fait. C'est par cet adaptateur que les transitions atterrissent dans le fil
// d'événements ET dans le canal de l'incident (§ P1-a du plan) — sans que le
// service connaisse ni le fil, ni les canaux.
// ============================================================================

import type { MissionSnapshot, MissionState } from "@/modules/missions/domain/mission";

/** Événement métier émis après une transition réussie. */
export interface MissionEvent {
  type:
    | "mission.issued"
    | "mission.accepted"
    | "mission.declined"
    | "mission.milestone"
    | "mission.completed"
    | "mission.cancelled";
  mission: MissionSnapshot;
  /** État précédent, pour les changements d'étape. */
  from?: MissionState;
  /** Matricule à l'origine du geste. */
  actor?: string;
  /** Horodatage ISO 8601. */
  at: string;
}

/** Diffuseur d'événements « missions ». */
export interface MissionEventPublisher {
  publish(event: MissionEvent): Promise<void>;
}

export const MISSION_EVENT_PUBLISHER = Symbol("MISSION_EVENT_PUBLISHER");
