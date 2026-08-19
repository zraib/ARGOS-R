// ========================================================================
// ARGOS · Module IA Prédiction Risques — Types stables
// 100% données réelles ARGOS, AUCUNE invention.
// ========================================================================
import type { Hospital, Incident, Unit } from "@/lib/types";
import type { TransportMovement } from "@/lib/data/dispatch";

export type RiskLevel = "faible" | "modere" | "eleve" | "critique";

/** Fenêtre temporelle associée à la prédiction. */
export type RiskHorizon = "2h" | "6h" | "24h" | "48h";

/** Source de données utilisée (auditabilité / non-invention). */
export type RiskDataSource =
  | "incidents.actifs"
  | "incidents.historiques.24h"
  | "hospitals.saturation"
  | "hospitals.rea"
  | "units.deploiement"
  | "units.readiness"
  | "movements.flux"
  | "dashstats.evolution"
  | "dashstats.severity"
  | "dashstats.status"
  | "dashstats.casualties"
  | "geo.concentration"
  | "geo.corridor"
  | "weather.current"
  | "weather.forecast"
  | "seismic.events";

/** Facteur explicatif associé à un score (toujours fondé sur des données ARGOS). */
export interface RiskFactor {
  /** Libellé factuel affiché à l'utilisateur. */
  label: string;
  /** Contribution relative 0..1 au score final. */
  weight: number;
  /** Sources utilisées pour ce facteur. */
  sources: RiskDataSource[];
  /** Valeur brute observée (ex: occPct=0.96) pour traçabilité. */
  rawValue?: number | string;
}

/** Une prédiction de risque (résultat du moteur déterministe ou IA LLM). */
export type RiskTrend = "aggravation" | "stable" | "amelioration";
export interface RiskPrediction {
  /** ID déterministe (ex: `zone:rabat:24h`) pour déduplication. */
  id: string;
  /** Nom affiché (zone, établissement, corridor opérationnel). */
  label: string;
  /** Type d'entité prédite (catégorie technique d'objet lié). */
  kind: "zone" | "hopital" | "corridor" | "incident.courant";
  // =====================================================================
  // CHAMPS OPÉRATIONNELS EXIGÉS PAR L'OPÉRATEUR (format exploitable direct)
  // =====================================================================
  /** Type de risque opérationnel HUMAN-READABLE : Inondation, Incendie,
   *  Saturation hospitalière, Aggravation séisme, Glissement de terrain,
   *  Évacuation massives, Affaissement, Tempête, Accident routier massif, etc. */
  riskType: string;
  /** Libellé ZONE CONCERNÉE affiché en clair (ville, province, région,
   *  corridor géographique, établissement). */
  zoneLabel: string;
  /** Localisation géographique en clair (si plus détaillé que zoneLabel,
   *  ex: "Al Haouz · Commune d'Asni · route RN9"). Peut être identique à zoneLabel. */
  locationLabel?: string;
  /** Tendance de la situation (exploitabilité opérateur immédiate). */
  trend: RiskTrend;
  // =====================================================================
  /** Coordonnées [lng, lat] optionnelles pour flyTo carte. */
  ll?: [number, number];
  /** Niveau de risque dérivé du score. */
  level: RiskLevel;
  /** Score ARGOS 0..100, 100 = dégradation certaine. */
  score: number;
  /** Probabilité estimée 0..1 (toujours factuelle, jamais inventée). */
  probability: number;
  /** Horizon temporel applicable. */
  horizon: RiskHorizon;
  /** Facteurs qui ont construit le score (transparence). */
  factors: RiskFactor[];
  /** Incidents liés (dégradation possible). */
  linkedIncidentIds?: string[];
  /** Établissements liés (saturation). */
  linkedHospitalIds?: string[];
  /** Unités liées (readiness insuffisante). */
  linkedUnitIds?: string[];
  /** Timestamp calcul (nouveau calcul = nouvel id suffixé). */
  computedAt: number;
  /** Validation humaine (obligatoire). */
  validatedByHuman?: boolean;
  /** Validateur (optionnel : nom ou ID). */
  validatedBy?: string;
  /** Ignoré / écarté par un opérateur (n'apparait plus en vue principale). */
  dismissed?: boolean;
  /** Origine du calcul : moteur déterministe pondéré OU inférence modèle IA LLM local. */
  origin?: "deterministic" | "ai_model";
  /** Modèle IA ayant généré la prédiction (si origin=ai_model). */
  aiModelName?: string;
  /** Timestamp de l'inférence IA (différent de computedAt si fallback). */
  aiGeneratedAt?: number;
}

/** Contexte injectable au moteur (mêmes données que celles du dashboard). */
export interface RiskContext {
  incidents: Incident[];
  hospitals: Hospital[];
  units: Unit[];
  movements?: TransportMovement[];
  dashStats: {
    evolution: { d: string; opened: number; closed: number }[];
    severity: { high: number; medium: number; low: number };
    status: { open: number; prog: number; closed: number };
    casualties?: { dead?: number; injured?: number; missing?: number; rescued?: number };
  } | null;
  /** Timestamp "maintenant" pour la déterministe (tests). */
  now?: number;
}
