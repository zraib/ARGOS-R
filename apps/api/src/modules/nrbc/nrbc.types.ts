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
/**
 * Fiche opérationnelle d'une substance — dimension « CAMEO Chemicals » (lot N-3).
 *
 * L'ERG donne des DISTANCES ; CAMEO Chemicals donne le COMPORTEMENT : à quoi
 * ressemble le produit, où va son nuage, ce qu'il fait aux poumons, ce qu'il
 * fait au contact de l'eau. Ce sont deux jeux de données distincts, et les
 * confondre conduirait à croire qu'une fiche vérifiée vaut distance vérifiée.
 *
 * Tous les champs sont en français : ils sont lus par l'intervenant, pas par une
 * machine.
 */
export interface SubstanceSheet {
  /** Aspect et odeur — la reconnaissance sur zone commence par là. */
  appearance: string;
  /**
   * Densité de vapeur rapportée à l'air.
   * `> 1` : le nuage rampe et s'accumule dans les points bas, les caves, les
   * fosses. `< 1` : il s'élève. Ce seul chiffre change le sens d'évacuation.
   */
  vaporDensity?: number;
  boilingPointC?: number;
  /** Comportement au rejet — ce que l'intervenant doit anticiper. */
  behaviour: string;
  health: string;
  fire: string;
  /** Réactivité et incompatibilités — l'eau en est souvent une. */
  reactivity: string;
  /** Protection individuelle minimale. */
  ppe: string;

  // --- champs de la fiche CAMEO (lot N-3d) ---------------------------------
  // Rédigés par la NOAA et les agences publiques qu'elle cite (NTP, USCG, EPA,
  // NIOSH, ICSC). Les jeux dont les conditions nomment un propriétaire —
  // cotations NFPA, tenues DuPont, seuils AEGL et ERPG — ne sont PAS repris.

  /** Conduite à tenir devant une victime — le geste, pas la théorie. */
  firstAid?: string;
  /** Lutte contre l'incendie : agents, précautions, ce qu'il ne faut pas faire. */
  fireFighting?: string;
  /** Intervention hors incendie : endiguement, absorption, décontamination. */
  nonFireResponse?: string;
  /** Profil chimique — comportement détaillé, produits de décomposition. */
  profile?: string;
  /** Dangers particuliers signalés hors des rubriques précédentes. */
  specialHazards?: string;
  /** Consignes d'isolement et d'évacuation rédigées (distinctes des distances ERG). */
  isolationAdvice?: string;
  /**
   * Seuil IDLH en ppm (NIOSH) — « immédiatement dangereux pour la vie ou la
   * santé ». Sert à qualifier une mesure de terrain, pas à poser un périmètre.
   */
  idlhPpm?: number;
  /** Point d'éclair en °C, quand la source n'est pas la NFPA. */
  flashPointC?: number;
}

export interface Substance {
  id: string;
  /**
   * Numéro ONU (étiquette orange des transports de matières dangereuses).
   *
   * OPTIONNEL depuis le lot N-3d : 1 361 produits du référentiel n'en ont pas
   * — ils ne voyagent pas sous régime ADR mais restent dangereux, et une
   * bibliothèque de consultation n'a aucune raison de les taire.
   */
  un?: string;
  /** Numéro CAS — clé de recherche dans les bases chimiques. */
  cas?: string;
  /** Guide orange ERG correspondant (consignes d'intervention). */
  ergGuide: string;
  labels: { fr: string; ar: string; en: string };
  /** Synonymes et noms commerciaux — la recherche doit les trouver. */
  synonyms?: string[];
  /** Classe de danger ADR (pilote le pictogramme, lot N-1). */
  hazardClass?: string;
  /** État physique au rejet — pilote le symbole et le vocabulaire de l'UI. */
  state: "gas" | "liquid";
  /**
   * Distances de la table 1 de l'ERG — ABSENTES tant qu'elles n'ont pas été
   * relevées. Une substance peut figurer au catalogue avec sa fiche
   * opérationnelle sans porter de distances : le gabarit ERG du panache est
   * alors indisponible pour elle, et l'interface le dit. Inventer un ordre de
   * grandeur plausible serait pire que ne rien afficher.
   */
  small?: ErgDistances;
  large?: ErgDistances;
  /** Fiche opérationnelle (lot N-3). */
  sheet?: SubstanceSheet;
  /**
   * La FICHE a-t-elle été confrontée à la fiche CAMEO Chemicals (NOAA) ?
   *
   * Distinct de `ergVerified`, qui ne porte que sur les distances. Une fiche
   * juste n'implique pas des distances justes, et l'inverse non plus.
   */
  sheetVerified?: boolean;
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
  /**
   * Nappe émise SOUS le seuil de vent de l'ATP-45 (lot N-4e).
   *
   * En dessous de 10 km/h, l'ATP-45 refuse de désigner un secteur : la direction
   * y est trop instable, et la zone doctrinale devient un cercle
   * omnidirectionnel. Ce cercle reste émis et fait toujours foi.
   *
   * Mais un vent de 6 km/h A une direction, et un cercle de 10 km posé sur une
   * agglomération ne se tasque pas. On émet donc EN PLUS l'axe le plus probable,
   * marqué comme tel — son ouverture grandit à mesure que le vent faiblit, ce
   * qui est la façon honnête de dire « voici la direction, et voici combien
   * j'en doute ». Elle ne REMPLACE jamais le cercle : elle s'y ajoute.
   */
  lowWind?: boolean;
  /** Description courte de la géométrie (rayon ou portée), pour l'infobulle. */
  /**
   * `wedge` a remplacé `triangle` au lot N-4b : la zone sous le vent n'est plus
   * un triangle à sommet sur le rejet mais une nappe TANGENTE au cercle
   * d'isolement, fermée par un arc à la portée. Un danger ne naît pas d'un point.
   */
  kind: "circle" | "wedge" | "square";
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
  substance: (Pick<Substance, "id" | "un" | "ergGuide" | "labels" | "ergVerified"> & { hasErgDistances: boolean }) | null;
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
