// ============================================================================
// lib/ai/draft/types.ts — contrat d'entrée des propositions
//
// Ce que le moteur reçoit du formulaire : type d'incident, lieu, mots-clés.
// Logique PURE, sans React : extraite de IncidentDraftAssist.tsx pour être
// testée seule et réutilisée par le brouillon LLM (lib/ai/llmIncidentDraft.ts)
// sans qu'une bibliothèque n'importe plus un composant.
// ============================================================================

import type { IncidentTypeDef } from "@/lib/types";

export interface DescriptionProposalInput {
  type: string | null;
  titre: string;
  adresse: string;
  province: string;
  ville: string;
  pt: [number, number] | null;
  lang: "fr" | "ar" | "en";
  incidentTypes: IncidentTypeDef[];
  keywords?: string;
}
export interface DescPair { l1: string; l2: string; }
export type Proposal = { title: string; desc: string };

/* =========================== HELPERS BASIQUES =========================== */

export interface SemGroup {
  id: string;
  text: string;
  priority: number;
  severity: "info" | "warn" | "crit";
}
