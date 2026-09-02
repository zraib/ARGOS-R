// ========================================================================
// Types · Conscience Situationnelle IA (ARGOS FAR/RM/ORSEC, Maroc)
// ========================================================================
export type GlobalAlertLevel =
  | "calme"          // 🟢 situation normale
  | "surveillance"   // 🟡 vigilance standard
  | "vigilance"      // 🟠 vigilance renforcée
  | "alerte_rouge";  // 🔴 alerte maximale

export type Hotspot = {
  id: string;
  label: string;
  region: string;
  typeInc: string;
  sev: "high" | "medium" | "low";
  ll: [number, number];
  poids: number; // 0..1 (importance relative)
  nIncidents: number;
};

export type CriticalFactor = {
  id: string;
  label: string;
  type: "capacite" | "saturation" | "blocage" | "evenement" | "materiel";
  impact: "haut" | "moyen" | "faible";
  value?: number | string;
  linkedIncidentIds?: string[];
  linkedHospitalIds?: string[];
};

export type ResourceCapacity = {
  personnel: number;
  ambulances: number;
  helicos: number;
  vehicules: number;
  litsDispos: number;
  litsOccupesPct: number; // 0..1
  reaDispos: number;
  reaOccupesPct: number; // 0..1
};

export type NextRisk = {
  horizon: "2h" | "6h" | "24h";
  type: string; // "Saturation hospitalière / Inondation / Aggravation séisme..."
  niveau: "faible" | "modere" | "eleve" | "critique";
  probabilitePct: number; // 0..100
  zone: string;
};

// ---------- 6 INDICATEURS PRÉDICTIFS EXCLUSIFS À LA CS (redondance ZÉRO avec KPI dashboard) ----------
export type SituationalForecasts = {
  /** ⏱️ Temps avant saturation globale estimée (minutes). Infini → MAX_SAFE + flag. */
  ttgMinutes: number;
  /** Drapeau si situation stable (temps infini → vrai). */
  ttgStable: boolean;
  /** 🚨 Prochain hôpital le plus proche de la saturation. */
  nextSat?: {
    id?: string;
    nom: string;
    ville?: string;
    occPctNow: number; // 0..1 (actuellement)
    minutesUntilSat: number; // estim. avant 95% si tendance (ou 0 si déjà > 95%)
    alreadySat: boolean;
  };
  /** 🏕️ Besoin HMC prédictif d'ici 6h (nombre + lits). */
  besoinHMC?: {
    nombre: number;
    litsParHMC: number;
    litsTotal: number;
  };
  /** 🔀 Hôpitaux pouvant recevoir des patients sans saturer (<=70% + marge). */
  redirection: {
    nHopitaux: number;
    litsRedirigeables: number;
  };
  /** 📈 Flux patients prédit 6 prochaines heures. */
  flux6h: {
    total: number;
    picDansMinutes: number; // heure pic
    tendance: "↗ stable" | "↗ en hausse" | "↘ en baisse";
  };
  /** 📦 Stock critique (issues de catalog.equipment : stock<threshold ou cond=oos). */
  stockCritique: {
    niveau: "ok" | "attention" | "alerte";
    ruptures: string[]; // ex: ["Station de pompage mobile · HS", "Citerne souple 5000 L · HS", ...]
    meta?: {
      nRuptures: number;
      nHorsService: number;
      nSousSeuil: number;
    };
  };
};

export type SituationalAwareness = {
  /** Niveau global de conscience situationnelle. */
  niveauGlobal: GlobalAlertLevel;
  /** Score 0..100 — 0 = calme, 100 = crise majeure. */
  scoreGlobal: number;
  /** Synthèse 1 phrase COURTE (≤ 180 caractères), exploitable direct. */
  synthese: string;
  /** Nombre RÉEL d'incidents actifs (toutes régions, sans le tronquage des cinq points chauds). */
  totalIncidents: number;
  /** 3-5 points chauds géographiques les plus critiques. */
  pointsChauds: Hotspot[];
  /** 4-6 facteurs critiques (impact haut / moyen / faible). */
  facteursCritiques: CriticalFactor[];
  /** 🧠 INDICATEURS PRÉDICTIFS EXCLUSIFS (PAS redondance KPI dashboard). */
  predictions: SituationalForecasts;
  /** 3 risques imminents (horizon 2h / 6h / 24h). */
  risquesProchaines: NextRisk[];
  /** Modèle LLM ayant généré la conscience. */
  modelName?: string;
  /** Généré à. */
  generatedAt: number;
  /** true = IA inférée LLM, false = fallback déterministe. */
  fromAI: boolean;
  /** Meta pour affichage marge réseau (chip TTG « Réseau stable »). */
  _debugLitsTot?: number;
  _debugLitsOcc?: number;
};
