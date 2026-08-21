// ============================================================================
// ARGOS — types du domaine NRBC (nucléaire, radiologique, biologique, chimique)
//
// Voir docs/adr/0005-capacite-nrbc.md. Le cœur de la capacité est le panache
// chimique : trois référentiels (ATP-45, ERG 2024, Gauss en phase 4) rendus
// derrière un port unique, sélectionnables et combinables par l'opérateur.
// Tout ce qui sort d'ici est une ESTIMATION de planification, pas une mesure.
// ============================================================================

/** Familles de menace NRBC (déclaratif au niveau incident). */
export const NRBC_FAMILIES = ["N", "R", "B", "C"] as const;
export type NrbcFamily = (typeof NRBC_FAMILIES)[number];

/** Ampleur du déversement, au sens de l'ERG (≤ 208 L / au-delà). */
export const NRBC_SPILLS = ["small", "large"] as const;
export type NrbcSpill = (typeof NRBC_SPILLS)[number];

/** Mode de rejet, au sens de l'ATP-45 (type A instantané / type B continu). */
export const NRBC_RELEASES = ["instant", "continuous"] as const;
export type NrbcRelease = (typeof NRBC_RELEASES)[number];

/** Volet NRBC attaché à un incident (rempli par le wizard de déclaration). */
export interface NrbcDetails {
  family: NrbcFamily;
  /** Substance du catalogue — famille C uniquement (le panache en a besoin). */
  substanceId?: string;
  spill?: NrbcSpill;
  release?: NrbcRelease;
}

/** Distances ERG d'un scénario (petit ou grand déversement). */
export interface ErgDistances {
  /** Zone d'isolement initial, en mètres — toutes directions. */
  isolationM: number;
  /** Distance d'action de protection sous le vent, en km — de jour. */
  protectDayKm: number;
  /** Distance d'action de protection sous le vent, en km — de nuit. */
  protectNightKm: number;
}

/** Substance chimique du catalogue (source : table 1 de l'ERG 2024). */
export interface Substance {
  id: string;
  /** Numéro ONU (étiquette orange des transports de matières dangereuses). */
  un: string;
  /** Guide orange ERG correspondant (consignes d'intervention). */
  ergGuide: string;
  labels: { fr: string; ar: string; en: string };
  /** État physique au rejet — pilote le symbole et le vocabulaire de l'UI. */
  state: "gas" | "liquid";
  small: ErgDistances;
  large: ErgDistances;
  /**
   * `true` = distances relevées sur la fiche CAMEO Chemicals (NOAA) alignée
   * ERG 2024. `false` = ordres de grandeur d'éditions antérieures, à confirmer
   * sur la table 1 de l'ERG 2024 avant tout emploi opérationnel — l'UI
   * l'affiche.
   */
  ergVerified: boolean;
}

/** Référentiels de panache disponibles (phase 4 : `gauss`). */
export const PLUME_MODELS = ["atp45", "erg"] as const;
export type PlumeModelId = (typeof PLUME_MODELS)[number];

/** Sévérité d'une zone du panache (pilote la couleur côté carte). */
export type PlumeLevel = "danger" | "protection" | "vigilance";

/** Une zone du panache : un polygone GeoJSON étiqueté. */
export interface PlumeZone {
  model: PlumeModelId;
  level: PlumeLevel;
  /** Anneau extérieur fermé, coordonnées [lon, lat]. */
  ring: [number, number][];
  /** Description courte de la géométrie (rayon ou portée), pour l'infobulle. */
  kind: "circle" | "triangle" | "square";
  radiusKm?: number;
  reachKm?: number;
}

/** Vent retenu pour un pas horaire du panache. */
export interface PlumeWind {
  /** Vitesse à 10 m, km/h. */
  speedKmh: number;
  /** Direction MÉTÉO (d'où vient le vent), degrés depuis le nord. */
  fromDeg: number;
  /** Heure UTC du pas de prévision utilisé (ISO). */
  time: string;
  /** Jour (7 h–19 h locales) ou nuit — choisit la distance ERG applicable. */
  isDay: boolean;
}

/** Panache complet d'un incident à une échéance donnée. */
export interface PlumeResult {
  incidentId: string;
  substance: Pick<Substance, "id" | "un" | "ergGuide" | "labels" | "ergVerified"> | null;
  spill: NrbcSpill;
  /** Échéance : H+0 … H+6 (heures de prévision). */
  hour: number;
  /** Vent du pas retenu — absent si la prévision est indisponible. */
  wind: PlumeWind | null;
  /** Zones directionnelles omises quand le vent est inconnu (honnêteté). */
  zones: PlumeZone[];
  models: PlumeModelId[];
  generatedAt: string;
}
