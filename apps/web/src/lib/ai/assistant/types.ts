// ============================================================================
// ARGOS — assistant IA · Types du domaine de l'assistant : question enrichie, contexte, réponse structurée.
//
// Extrait de l'ancien `assistant.ts` (2 782 lignes) lors de la refactorisation :
// même code, découpé par responsabilité pour être lisible, testable et
// modifiable sans relire le tout. Voir `index.ts` pour la surface publique.
// ============================================================================

import type { DashStats, Hospital, Incident, SeismicEvent, Unit } from "@/lib/types";
import type { TransportMovement } from "@/lib/data/dispatch";
import type { Analytics, EquipItem, OrsecBoard } from "@/lib/data/modules";
import type { RiskPrediction } from "@/lib/ai/risk/types";

export type AiIntent =
  | "reachability"
  | "sitrep"
  | "anomaly"
  | "incident_details"
  | "incidents_list"
  | "global_overview"
  | "trends"
  | "casualties_summary"
  | "hospitals_status"
  | "hospitals_nearest"
  | "units_status"
  | "cross_analysis"
  | "orsec_summary"
  | "seismic_status"
  | "equipment_search"
  | "equipment_critical_status"
  | "mobilizable_potential"
  | "help"
  | "greeting"
  | "social"
  // --- Intents temporels (noveaux : ARGOS §6.22)
  | "today_incidents"
  | "last24h_summary"
  | "today_vs_yesterday"
  | "trend_incidents"
  | "activity_peaks"
  | "unusual_evolution"
  // --- Intents géographiques (nouveaux : ARGOS §6.22)
  | "touched_zones"
  | "incidents_near_city"
  | "critical_concentration"
  | "riskiest_zone"
  // --- Intents module IA prédictions risques (nouveau : module dashboard RiskPanel)
  | "risks_prediction"
  | "risks_zone"
  | "unknown";


export interface AiUnitResult {
  id: string;
  nom: string;
  ville: string;
  etaMin: number;
  caps: string[];
  dispo: string;
  within: boolean;
  /** Champs enrichis Copilot (optionnels pour rétro-compat) */
  type?: string;
  readiness?: number;
  score?: number;
}


export interface AiIncidentRow {
  id: string;
  titre: string;
  region: string;
  type: string;
  sev: string;
  st: string;
  time: string;
  casualties?: { dead: number; injured: number; missing: number; rescued?: number };
  lieu?: string;
  coords?: [number, number];
  declared?: string;
}


export interface AiHospitalRow {
  id: string;
  nom: string;
  ville: string;
  kind?: string;
  occPct: number;
  icuPct: number;
  lits: number;
  rea: number;
  distKm?: number;
  distanceKm?: number;
  etaMin?: number;
  ll?: [number, number];
  name?: string; // alias retro: AiHospitalRow utilisé parfois avec .name
}


export interface AiTopEquip {
  id: string;
  desig: string;
  cat: string;
  stock: number;
  cond: string;
  unit: string;
  seuil?: number;
}


export interface AiAnswerStatsItem {
  label: string;
  value: string | number;
  level: number;
  key?: string;
}


export interface AiAnswerStats {
  open?: number;
  prog?: number;
  closed?: number;
  high?: number;
  medium?: number;
  low?: number;
  dead?: number;
  injured?: number;
  missing?: number;
  rescued?: number;
  unitsReady?: number;
  unitsDeployed?: number;
  avgReadiness?: number;
  totalHospitals?: number;
  totalLits?: number;
  litsDisponibles?: number;
  occMoyennePct?: number;
  totalRea?: number;
  reaDisponibles?: number;
  etablissementsSousTension?: number;
  items?: AiAnswerStatsItem[];
}


export interface AiCrossUnitRec {
  unit: { id: string; nom: string; ville: string; type?: string };
  score: number;
  timeScore: number;
  capScore: number;
  regionScore: number;
  dispoScore: number;
}


export interface AiCrossUnitEquip {
  unitName: string;
  equipment: { desig: string; stock: number; cond: string }[];
}


export interface AiCrossBlock {
  incident?: AiIncidentRow & { lieu?: string; coords?: [number, number] };
  recommendedUnits?: AiCrossUnitRec[];
  hospitals?: AiHospitalRow[];
  unitEquipment?: AiCrossUnitEquip[];
  quakes?: SeismicEvent[];
  // --- géo : centrage carte demandé depuis Copilot « Afficher sur la carte »
  mapFocus?: {
    ll: [number, number];
    zoom: number;
    label?: string;
    /** si c'est un incident précis : son ID (on appelle focusIncident) */
    incidentId?: string;
  };
  // --- temporel : infos 24h / hier / aujourd'hui (pour synthèse Qwen)
  temporal?: {
    today: { count: number; severity: Record<string, number>; ids: string[] };
    last24h: { count: number; severity: Record<string, number>; ids: string[] };
    yesterday?: { count: number; severity: Record<string, number>; ids: string[] };
    trend?: "increasing" | "decreasing" | "stable";
    deltaPct?: number;
    peakHour?: string;
    unusual?: boolean;
  };
  // --- géo : agrégation par zone
  zones?: { nom: string; count: number; severity: "critique" | "élevé" | "moyen" | "faible"; ll?: [number, number]; ids: string[] }[];
}


export interface AiSuggestion {
  label: string;
  query: string;
  priority?: "primary" | "secondary";
}


export interface AiAnswer {
  intent: AiIntent;
  layer1: string;
  text: string;
  units?: AiUnitResult[];
  incidents?: AiIncidentRow[];
  hospitals?: AiHospitalRow[];
  stats?: AiAnswerStats;
  topEquip?: AiTopEquip[];
  quakes?: { id: string; region: string; mag: number; depth: number; time: string }[];
  suggestions?: (string | AiSuggestion)[];
  cross?: AiCrossBlock;
  /** Module Analytique opérationnelle (KPI + graphiques calculés DomainService).
   *  Injecté systématiquement dans TOUTES les réponses (même unknown / fallback).
   *  → permet au LLM de répondre : taux clôture, délai réponse, tendance 7j,
   *     saturation hôpital, triage zone, utilisation des moyens. */
  analytics?: Analytics | null;
}


export interface AiContext {
  incidents: Incident[];
  movements: TransportMovement[];
  units: Unit[];
  hospitals?: Hospital[];
  equipment: EquipItem[];
  orsec: OrsecBoard;
  dashStats?: DashStats | null;
  quakes?: SeismicEvent[];
  currentPath?: string;
  currentIncidentId?: string | null;
  /** Module prédictions risques IA (100% réel). Peut être vide si module désactivé. */
  riskPredictions?: RiskPrediction[];
  /** Module Analytique (100% réel, calculé DomainService NestJS). Données KPI
   *  + graphiques calculés temps réel → LLM peut répondre sur tendances 7 j,
   *  saturation hôpitaux TOP 6, temps de réponse, utilisation des moyens,
   *  triage zones, KPI taux clôture/réponse/moyens. */
  analytics?: Analytics | null;
}


export type IntentTopicHint = "incident" | "hospital" | "unit" | "seismic" | "orsec" | "equipment" | "global" | "logistics" | "trends" | "casualties" | "cross" | "unknown";


export interface EnrichedQuery {
  query: string;
  targetIncidentId?: string;
  targetUnitId?: string;
  targetHospitalId?: string;
}


export type IncSubIntent = "severity" | "status" | "location" | "opinion" | "casualties" | "full";


export type TemporalBucket = { count: number; severity: Record<string, number>; ids: string[] };
