// ============================================================================
// ARGOS — données simulées du Répartiteur (MASTER_PLAN §6.16)
// File de dispatching (besoins entrants) + mouvements de transport. Les
// engagements et suggestions appliquées sont créés à l'exécution dans le store.
// ============================================================================

import type { IncidentType } from "@/lib/types";

export type QueueKind = "logistics" | "evac" | "shelter";
export type Urgency = "urgent" | "high" | "medium";

export interface QueueItem {
  id: string;
  kind: QueueKind;
  label: string;
  incidentId: string;
  /** coordonnées cibles [lng, lat] pour le calcul du temps de trajet */
  target: [number, number];
  /** profil de capacités réutilisé par le moteur de reco */
  type: IncidentType;
  urgency: Urgency;
}

export const KIND_LABEL: Record<QueueKind, string> = {
  logistics: "Logistique",
  evac: "Évacuation sanitaire",
  shelter: "Abris",
};

export interface TransportMovement {
  id: string;
  mission: string;
  vehicles: string;
  origin: string;
  destination: string;
  cargo: string;
  progress: number;
  etaMin: number;
  /** minutes d'écart vs itinéraire prévu ; >0 = alerte retard */
  delayMin: number;
}
