// ============================================================================
// ARGOS — types du domaine opérationnel (incidents, unités, hôpitaux, abris,
// morgue/DVI, fil d'événements, mouvements).
//
// Les formes correspondent aux types du frontend : c'est le CONTRAT que le
// client généré consomme. Séparés du service pour qu'un module puisse
// dépendre des types sans tirer l'état en mémoire.
// ============================================================================

import type { NrbcDetails } from "@/modules/nrbc/nrbc.types";
import type { HospitalKind } from "@/modules/domain/hospitals.data";

export interface Incident {
  id: string;
  /** Type d'incident : identifiant du catalogue paramétrable (IncidentTypesService). */
  type: string;
  titre: string;
  region: string;
  /** Adresse / lieu-dit saisi à la déclaration (optionnel). */
  adresse?: string;
  /**
   * Description libre de la situation, saisie (ou proposée par l'assistant) à la
   * déclaration.
   *
   * L'assistant de création la collectait depuis toujours et ne l'envoyait
   * JAMAIS : le récit de ce qui se passait était perdu à l'enregistrement. C'est
   * pourtant la seule prose de la fiche — tout le reste est chiffré ou codé.
   */
  desc?: string;
  sev: "high" | "medium" | "low";
  st: "open" | "prog" | "closed";
  time: string;
  x: number;
  y: number;
  ll: [number, number];
  /** Bilan humain saisi à la déclaration (optionnel). */
  casualties?: { dead: number; injured: number; missing: number };
  /** Premiers intervenants rattachés : identifiants d'unités / d'hôpitaux. */
  responders?: { units: string[]; hospitals: string[] };
  /** Sous-incidents (aléas secondaires rattachés après la déclaration). */
  subIncidents?: SubIncident[];
  /** Volet NRBC (famille, substance, ampleur) — incidents de type `nrbc`. */
  nrbc?: NrbcDetails;
  /** Incident archivé (masqué de la liste active). */
  archived?: boolean;
  /**
   * Ligne du jeu de DÉMONSTRATION (lot V-4).
   *
   * Une montée de version du seed reconstruit ces lignes et conserve ce qu'un
   * utilisateur a créé. Sans ce marqueur, il aurait fallu choisir entre tout
   * écraser — et perdre le travail d'une séance — ou ne rien écraser, auquel cas
   * un nouveau jeu de données n'aurait aucun effet là où il en faut un.
   */
  seeded?: boolean;
}

/** Aléa secondaire rattaché à un incident principal (mêmes détails qu'un incident). */
export interface SubIncident {
  id: string;
  /** Identifiant d'un sous-type (SubIncidentTypesService). */
  type: string;
  sev: "high" | "medium" | "low";
  note?: string;
  time: string;
  /** Localisation propre du sous-incident [lng, lat] (optionnel). */
  ll?: [number, number];
  /** Bilan humain propre au sous-incident (optionnel). */
  casualties?: { dead: number; injured: number; missing: number };
  /** Intervenants rattachés au sous-incident (IDs d'unités / d'hôpitaux). */
  responders?: { units: string[]; hospitals: string[] };
}

export interface Unit {
  id: string;
  /** Ligne du jeu de démonstration — voir `Incident.seeded`. */
  seeded?: boolean;
  nom: string;
  ville: string;
  cmdt: string;
  eff: number;
  dispo: "ready" | "deployed" | "standby";
  readiness: number;
  x: number;
  y: number;
  ll: [number, number];
}

/**
 * Compte rendu de situation d'une entité. Trois champs saisis, le reste
 * photographié : un compte rendu long n'est pas rendu.
 */
export interface Sitrep {
  id: string;
  /** Numéro d'ordre — un compte rendu publié est immuable et numéroté. */
  number: number;
  entityKind: "hospital" | "unit" | "shelter" | "morgue";
  entityId: string;
  /** État général en un mot : nominal, tendu, débordé. */
  state: "nominal" | "strained" | "overwhelmed";
  /** Besoins exprimés en clair. */
  needs?: string;
  /** Prochain point attendu / action en cours. */
  nextPoint?: string;
  /** Photographie automatique des chiffres de l'entité au moment du rendu. */
  snapshot?: Record<string, number>;
  author: string;
  publishedAt: string;
}

export interface Hospital {
  id: string;
  nom: string;
  ville: string;
  /** Région administrative de rattachement. */
  region?: string;
  /** Province / préfecture de rattachement. */
  province?: string;
  /**
   * Réseau et échelon de l'établissement — pilote le symbole cartographique.
   * Absent sur les données créées avant l'introduction du champ : le frontend
   * retombe alors sur « civil » (voir lib/hospitals.ts, hospKind).
   */
  kind?: HospitalKind;
  /**
   * Lits RÉSERVÉS par une EVASAN acceptée mais pas encore arrivée (lot P2-b).
   *
   * Sans ce compteur, deux transferts pouvaient viser le dernier lit libre :
   * chacun le voyait disponible puisque l'occupation ne bouge qu'à l'arrivée.
   * Libres = armés − occupés − réservés.
   */
  reserved?: number;
  /** Nature de la structure (CHU militaire, hôpital général, régional…). */
  type?: string;
  lits: number;
  occ: number;
  rea: number;
  reaOcc: number;
  staff: number;
  amb: number;
  heli: number;
  x: number;
  y: number;
  ll: [number, number];
}

export interface FieldHospital {
  hid: string;
  nom: string;
  cap: number;
  occ: number;
  statut: "op" | "partial";
  depuis: string;
  /** Réseau de rattachement : campagne militaire ou campagne civile. */
  kind?: "mil_field" | "civ_field";
}

/**
 * Service de soins d'un établissement (réanimation, chirurgie, urgences…).
 * Piloté par le responsable de SON hôpital — le cantonnement est appliqué par
 * le `ScopeGuard`, ce service ne connaît pas la notion de responsable.
 * Identifiant anglais `Ward` pour ne pas confondre avec les « services » NestJS.
 */
export interface HospitalWard {
  id: string;
  /** Hôpital de rattachement. */
  hid: string;
  nom: string;
  lits: number;
  occ: number;
  statut: "open" | "saturated" | "closed";
  /** Médecin-chef du service. */
  chef?: string;
}

/**
 * Abri d'hébergement, piloté par son responsable. Repris du catalogue statique
 * (`catalog.data.ts`) mais désormais MUTABLE : c'est `DomainService` qui fait
 * autorité, et `CatalogService` sert cette liste vivante à l'écran /abris.
 */
export interface Shelter {
  id: string;
  nom: string;
  ville: string;
  /** Région et province d'implantation (référentiel), quand elles sont connues. */
  region?: string;
  province?: string;
  /** Position [lng, lat] : celle de la ville du référentiel, sinon du chef-lieu. Sert à la carte. */
  ll?: [number, number];
  /**
   * Typologie : camp de tentes ou bâtiment en dur. Absent sur les abris
   * enregistrés avant la typologie — lus comme « en dur, nature inconnue ».
   */
  kind?: "tentes" | "dur";
  building?: "dedie" | "ecole" | "college" | "lycee" | "autre";
  /** Camp de tentes : la capacité en découle (tentes × personnes par tente). */
  tents?: number;
  perTent?: number;
  capacity: number;
  occupants: number;
  staff: number;
  supplies: "ok" | "low" | "critical";
  needs: string;
  adults: number;
  children: number;
  elderly: number;
}

// --- Morgue / identification des victimes (DVI) -----------------------------
// Modélisé sur les pratiques d'identification des victimes de catastrophe :
// un site mortuaire accueille des corps sous référence provisoire, qui suivent
// un parcours d'identification jalonné de prélèvements, puis sont restitués aux
// familles. Le registre est horodaté à chaque étape.

/** Site mortuaire (permanent ou de circonstance). */
export interface MorgueSite {
  id: string;
  nom: string;
  ville: string;
  /** Emplacements réfrigérés. */
  capacity: number;
  /** Effectif affecté au site (médecins légistes, techniciens). */
  staff: number;
  statut: "op" | "partial" | "closed";
}

/** Étapes du parcours d'identification. */
export const DVI_STATUSES = ["unidentified", "in_progress", "identified", "released"] as const;
export type DviStatus = (typeof DVI_STATUSES)[number];

/** Prélèvements post-mortem servant à l'identification. */
export const DVI_SAMPLES = ["dna", "dental", "fingerprint"] as const;
export type DviSample = (typeof DVI_SAMPLES)[number];

/**
 * Enregistrement d'un corps admis dans un site mortuaire.
 * `reference` est la référence PROVISOIRE attribuée à l'admission : elle reste
 * l'identifiant opérationnel tant que l'identité n'est pas confirmée.
 */
export interface MortuaryRecord {
  id: string;
  /** Site mortuaire de rattachement. */
  mid: string;
  reference: string;
  /** Incident d'origine, s'il est connu. */
  incidentId?: string;
  /** Lieu de découverte. */
  foundAt?: string;
  sex?: "m" | "f" | "unknown";
  ageRange?: string;
  status: DviStatus;
  samples: DviSample[];
  /** Identité confirmée — exigée dès le statut « identifié ». */
  identifiedAs?: string;
  /** Personne à qui le corps a été restitué — exigée au statut « restitué ». */
  releasedTo?: string;
  /** Horodatages ISO 8601 : admission et dernière évolution. */
  admittedAt: string;
  updatedAt: string;
}

export interface FeedItem {
  time: string;
  c: string;
  txt: string;
  /**
   * Incident concerné, quand la ligne en concerne un.
   *
   * Sans ce champ, reconstituer le fil d'une opération obligerait à chercher son
   * identifiant DANS le texte — une heuristique qui rate dès qu'une formulation
   * change, et qui rate en silence. Sur une plateforme de commandement, une
   * ligne de journal manquante ne se remarque pas.
   */
  incidentId?: string;
}

export interface QueueItem {
  id: string;
  kind: "logistics" | "evac" | "shelter";
  label: string;
  incidentId: string;
  target: [number, number];
  type: Incident["type"];
  urgency: "urgent" | "high" | "medium";
}

export interface TransportMovement {
  id: string;
  mission: string;
  vehicles: string;
  origin: string;
  destination: string;
  cargo: string;
  progress: number;
  etaMin: number;
  delayMin: number;
}

// --- postes d'opération sur la carte (lot #12) ---------------------------------

/** Natures de poste posables sur la carte d'une opération. */
export const POST_KINDS = ["opcom", "tacom", "bluecell", "greencell", "orangecell", "shelter", "equipment"] as const;
export type PostKind = (typeof POST_KINDS)[number];

/**
 * Un poste posé sur la carte d'une opération : un PC (OPCOM, TACOM), une
 * cellule, un abri ou un parc d'équipement, à un point précis.
 *
 * Un poste désigne une INSTANCE, jamais une nature : ce compte-ci (un OPCOM,
 * un TACOM, une cellule — plusieurs par opération, déployés à la pose) ou
 * cette entité-ci (un abri, un parc). Une instance n'est posée qu'une fois.
 */
export interface IncidentPost {
  id: string;
  incidentId: string;
  kind: PostKind;
  ll: [number, number];
  /** Libellé libre — « PC avancé nord ». */
  label?: string;
  /** Entité représentée : identifiant de l'abri (`shelter`) ou de l'unité détentrice du parc (`equipment`). */
  entityId?: string;
  /** Compte qui tient un PC ou une cellule — déployé sur l'opération à la pose du poste. */
  matricule?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
