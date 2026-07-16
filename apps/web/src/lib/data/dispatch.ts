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

export const DISPATCH_QUEUE: QueueItem[] = [
  { id: "REQ-5012", kind: "evac", label: "Évacuation 14 blessés graves — Douar Tnirt", incidentId: "INC-2607", target: [-8.36, 31.05], type: "earthquake", urgency: "urgent" },
  { id: "REQ-5011", kind: "logistics", label: "Groupes électrogènes + éclairage — PC Amizmiz", incidentId: "INC-2607", target: [-8.25, 31.22], type: "earthquake", urgency: "high" },
  { id: "REQ-5009", kind: "shelter", label: "Renfort tentes & vivres — abris Talat N'Yaaqoub", incidentId: "INC-2607", target: [-8.26, 30.98], type: "earthquake", urgency: "high" },
  { id: "REQ-5007", kind: "logistics", label: "Pompage & potabilisation — crues Ourika", incidentId: "INC-2606", target: [-7.79, 31.32], type: "flood", urgency: "medium" },
  { id: "REQ-5004", kind: "evac", label: "Rotation EVASAN — point de tri Tizi N'Test", incidentId: "INC-2607", target: [-8.2, 30.9], type: "earthquake", urgency: "urgent" },
];

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

export const MOVEMENTS_INIT: TransportMovement[] = [
  { id: "MVT-3301", mission: "Convoi logistique", vehicles: "LOG-1 · 6 véh.", origin: "Rabat", destination: "Marrakech (A7)", cargo: "40 t fret humanitaire", progress: 62, etaMin: 74, delayMin: 0 },
  { id: "MVT-3302", mission: "Recherche & sauvetage", vehicles: "SAR-2 · 4 véh.", origin: "Agadir", destination: "Amizmiz", cargo: "Équipe cynophile + déblaiement", progress: 78, etaMin: 33, delayMin: 12 },
  { id: "MVT-3303", mission: "Évacuation sanitaire", vehicles: "EVASAN-1 · hélico", origin: "Marrakech", destination: "Zone sinistrée", cargo: "6 blessés graves", progress: 41, etaMin: 18, delayMin: 0 },
  { id: "MVT-3304", mission: "Ravitaillement abris", vehicles: "LOG-3 · 3 véh.", origin: "Fès", destination: "Talat N'Yaaqoub", cargo: "12 tentes + vivres", progress: 25, etaMin: 96, delayMin: 24 },
];
