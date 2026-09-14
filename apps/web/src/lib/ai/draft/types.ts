// ============================================================================
// lib/ai/draft/types.ts — contrat d'entrée des propositions
//
// Ce que le moteur reçoit du formulaire : type d'incident, localisation,
// BILAN HUMAIN structuré, NRBC si concerné, nombre de moyens déployés.
// Les keywords sont DÉSORMAIS OPTIONNELS : la génération titre + description
// se fait à 100% depuis les CHAMPS STRUCTURÉS (type, ville, morts, blessés,
// disparus, infectés, contaminés, familles NRBC, unités/hôpitaux).
// ============================================================================

import type { IncidentTypeDef, NrbcFamily } from "@/lib/types";

export interface DescriptionProposalInput {
  type: string | null;
  titre: string;
  adresse: string;
  province: string;
  ville: string;
  pt: [number, number] | null;
  lang: "fr" | "ar" | "en";
  incidentTypes: IncidentTypeDef[];
  /** @deprecated plus utilisé ; conservé compatibilité ancienne version */
  keywords?: string;
  /** Bilan humain : champs libres (chaîne numérique ou texte). Vide = non renseigné. */
  dead?: string;
  injured?: string;
  missing?: string;
  infected?: string;
  contaminated?: string;
  /** Événement NRBC : famille, substance, type de déversement. */
  nrbcFamily?: NrbcFamily | null;
  nrbcSubstance?: string;
  nrbcSpill?: "small" | "large";
  nrbcRelease?: "instant" | "continuous";
  /** Nombre de moyens déployés (pour description quantitative si > 0). */
  unitsCount?: number;
  hospitalsCount?: number;
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
