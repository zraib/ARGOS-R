import type { AvlPriority } from "@/modules/tracking/codec8";

// ============================================================================
// ARGOS — suivi de traceurs FMC920 : types du domaine (lot N-2)
//
// LE REGISTRE EST LE CŒUR, PAS LE FLUX. Comme pour le suivi aérien (module
// `aviation`), le poste de commandement ne veut pas « tous les boîtiers qui
// émettent » : il veut voir les moyens QU'IL A DÉCLARÉS, rattachés à ce qu'ils
// équipent. Un boîtier inconnu n'est pas un moyen non identifié à afficher,
// c'est un boîtier qui n'a rien à faire sur le réseau — il est refusé à la
// poignée de main.
//
// Aucun import d'infrastructure ici : ni TCP, ni HTTP, ni base (ADR 0004).
// ============================================================================

/**
 * Ce qu'un traceur équipe.
 *
 * Le rattachement est TYPÉ plutôt que d'être un identifiant nu : ARGOS suit des
 * unités, des véhicules et des personnels, et un boîtier posé sur une ambulance
 * ne se lit pas comme un boîtier porté par un chef de détachement. Le type dit
 * comment interpréter la trace.
 */
export type TrackerTargetKind = "unit" | "vehicle" | "personnel" | "equipment";

export const TRACKER_TARGET_KINDS: TrackerTargetKind[] = ["unit", "vehicle", "personnel", "equipment"];

export interface TrackerTarget {
  kind: TrackerTargetKind;
  /** Identifiant du moyen dans son propre registre (U1, VEH-12, matricule…). */
  id: string;
}

/** Une position relevée par un traceur, telle qu'ARGOS la conserve. */
export interface TrackerFix {
  /** Millisecondes UTC — l'horodatage du BOÎTIER, pas celui de la réception. */
  at: number;
  /** [lng, lat] en degrés. */
  ll: [number, number];
  speedKmh: number;
  headingDeg: number;
  altitudeM: number;
  satellites: number;
  priority: AvlPriority;
}

/**
 * D'où viennent les positions.
 *  - `device` : un boîtier FMC920 sur le réseau, identifié par son IMEI à la
 *    poignée de main TCP (ADR 0008) ;
 *  - `app`    : le compte d'un personnel partage la position de son téléphone
 *    depuis l'application ; seul CE compte peut verser ses positions, et un
 *    compte n'a qu'un partage (ADR 0008, révision).
 */
export type TrackerSource = "device" | "app";

export const TRACKER_SOURCES: TrackerSource[] = ["device", "app"];

/** Clé de registre d'un partage par l'application : tient la place de l'IMEI. */
export const appKey = (account: string): string => `app:${account.trim().toLowerCase()}`;

/** Un traceur déclaré au registre. */
export interface Tracker {
  id: string;
  /**
   * IMEI à 15 chiffres — la seule identité que le boîtier présente. Pour un
   * partage par l'application : la clé `app:<matricule>`, qu'aucun boîtier ne
   * peut présenter.
   */
  imei: string;
  source: TrackerSource;
  /** Partage par l'application : le compte (matricule) qui partage sa position. */
  account?: string;
  /** Nom d'usage : « Ambulance 04 », « VLTT Cne Alami ». */
  label: string;
  target: TrackerTarget | null;
  /** Opération sur laquelle le moyen est engagé, si elle est connue. */
  incidentId: string | null;
  /**
   * Traceur retiré du service sans être effacé : il cesse d'être admis à la
   * poignée de main et sort des cartes, mais son historique reste lisible.
   */
  archived: boolean;
  createdBy: string;
  createdAt: string;
  /** Dernière position EXPLOITABLE reçue, ou `null` si le boîtier n'a jamais eu de fix. */
  last: TrackerFix | null;
  /**
   * Dernier contact, fix ou non. Distinct de `last` à dessein : un boîtier peut
   * émettre fidèlement depuis un sous-sol sans jamais se localiser. Confondre
   * les deux ferait passer un boîtier vivant pour un boîtier muet.
   */
  lastSeenAt: string | null;
  /** Trace récente, du plus ancien au plus récent. Bornée — voir TRAIL_MAX. */
  trail: TrackerFix[];
}

/**
 * Longueur maximale de la trace conservée par traceur.
 *
 * Le FMC920 émet typiquement toutes les 30 s en mouvement : 240 points valent
 * environ deux heures, ce qui couvre une intervention sans faire enfler la
 * mémoire d'un dépôt qui n'est pas encore une base de données.
 */
export const TRAIL_MAX = 240;

/** Ce qu'un opérateur peut modifier sur un traceur déclaré. */
export type TrackerPatch = Partial<Pick<Tracker, "label" | "target" | "incidentId" | "archived">>;

/** Une position partagée depuis l'application (géolocalisation du navigateur). */
export interface SharedPosition {
  ll: [number, number];
  /** Millisecondes UTC de la mesure ; à défaut, l'instant de réception. */
  at?: number;
  accuracyM?: number;
  speedKmh?: number;
  headingDeg?: number;
  altitudeM?: number;
}

/** Compte rendu d'une session TCP, pour le journal et l'écran d'état. */
export interface TrackerIngest {
  imei: string;
  accepted: number;
  rejected: number;
  reason?: string;
}
