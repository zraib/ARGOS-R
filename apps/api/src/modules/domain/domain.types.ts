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
  /**
   * Le bilan tel que l'opérateur l'a DÉCLARÉ ou corrigé. `casualties` en est
   * la lecture : jamais moins que les victimes nommées de chaque nature,
   * recalculée à chaque changement — pas un cliquet qui ne redescend jamais.
   */
  declaredCasualties?: { dead: number; injured: number; missing: number };
  /** Premiers intervenants rattachés : unités, hôpitaux — et sites mortuaires dès qu'un décès est déclaré. */
  responders?: { units: string[]; hospitals: string[]; morgues?: string[] };
  /** Affectations d'unités par l'OPCOM, avec leur destination et leur déploiement (ADR 0016). */
  assignments?: UnitAssignment[];
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

/**
 * Corps d'appartenance d'une unité (ADR 0016) : il décide QUI peut l'affecter
 * à une opération et vers quel poste du TACOM elle va.
 *   far         — Forces Armées Royales (militaire)
 *   gendarmerie — Gendarmerie Royale (militaire ; rejoint le PCO)
 *   dgsn        — Sûreté Nationale (civil)
 *   dgpc        — Protection Civile (civil)
 *   fa          — Forces Auxiliaires (civil)
 */
export const UNIT_CORPS = ["far", "gendarmerie", "dgsn", "dgpc", "fa"] as const;
export type UnitCorps = (typeof UNIT_CORPS)[number];

/** Les corps civils : ceux que le wali et le ministère de l'Intérieur affectent. */
export const CIVIL_CORPS: readonly UnitCorps[] = ["dgsn", "dgpc", "fa"];

/** Destination d'une unité affectée : le PC opérationnel ou le PC tactique du TACOM. */
export const DESTINATIONS = ["pco", "pct"] as const;
export type Destination = (typeof DESTINATIONS)[number];

/**
 * Affectation d'une unité à une opération par l'OPCOM (ADR 0016), puis son
 * déploiement sur le terrain par le TACOM ou une cellule. Une unité n'est
 * affectée qu'à une opération à la fois.
 */
export interface UnitAssignment {
  unitId: string;
  destination: Destination;
  by: string;
  at: string;
  /** Déployée sur le terrain ; absent tant qu'elle attend au PC. */
  deployedAt?: string;
  deployedBy?: string;
}

export interface Unit {
  id: string;
  /** Ligne du jeu de démonstration — voir `Incident.seeded`. */
  seeded?: boolean;
  nom: string;
  ville: string;
  cmdt: string;
  /** Corps d'appartenance ; absent sur les unités d'avant l'ADR 0016 (= FAR). */
  corps?: UnitCorps;
  eff: number;
  dispo: "ready" | "deployed" | "standby";
  readiness: number;
  x: number;
  y: number;
  ll: [number, number];
  /** Opération à laquelle l'unité est affectée, et sa destination — dénormalisé pour la carte et les listes. */
  assignment?: { incidentId: string; destination: Destination; deployed: boolean };
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

/** Nature d'un site mortuaire : champ mortuaire, morgue temporaire, morgue hospitalière, camion réfrigéré. */
export const MORGUE_TYPES = ["field", "temporary", "hospital", "truck"] as const;
export type MorgueType = (typeof MORGUE_TYPES)[number];

/**
 * Statut d'un site : opérationnel, partiel, non opérationnel (`closed`) — et
 * `full`, DÉRIVÉ, quand la capacité est atteinte (jamais saisi, toujours lu).
 */
export type MorgueStatus = "op" | "partial" | "closed" | "full";

/** Site mortuaire (permanent ou de circonstance), ou morgue MOBILE déployée sur le terrain. */
export interface MorgueSite {
  id: string;
  nom: string;
  ville: string;
  /** Emplacements réfrigérés. */
  capacity: number;
  /** Effectif affecté au site (médecins légistes, techniciens). */
  staff: number;
  statut: MorgueStatus;
  /** Nature du site ; absente sur les données antérieures (déduite du rattachement et de la mobilité). */
  type?: MorgueType;
  /** Fixe (institut, chambre mortuaire) ou mobile (conteneur réfrigéré déployable) ; absent = fixe. */
  kind?: "fixed" | "mobile";
  /**
   * Échelon d'un site fixe — la morgue suit la logique des hôpitaux : une
   * morgue **de ville** (chambre mortuaire d'un établissement) ou une morgue
   * **régionale** (institut médico-légal, plus grande et mieux équipée).
   */
  level?: "regional" | "city";
  region?: string;
  province?: string;
  /** L'établissement de santé auquel la morgue est rattachée. */
  hospitalId?: string;
  /** Code court des références (« RBT-2026-012 »). */
  code?: string;
  ll?: [number, number];
  /** Morgue mobile : où elle est déployée, pour quel incident, depuis quand, par qui — `null` une fois repliée. */
  deployment?: { site: string; ll: [number, number]; incidentId?: string; at: string; by: string } | null;
}

/**
 * Étapes de la chaîne de garde d'un corps (pratiques DVI / CICR) : chaque
 * changement de responsabilité est daté et signé — c'est la traçabilité
 * entre l'hôpital, le terrain et les sites mortuaires.
 */
export const CUSTODY_STEPS = ["recovered", "hospital", "transferred", "received", "released"] as const;
export type CustodyStep = (typeof CUSTODY_STEPS)[number];

export interface CustodyEvent {
  at: string;
  step: CustodyStep;
  from?: string;
  to?: string;
  /** Qui a acté l'étape (matricule). */
  by: string;
  note?: string;
}

/** Étapes du parcours d'identification. */
export const DVI_STATUSES = ["unidentified", "in_progress", "identified", "released"] as const;
export type DviStatus = (typeof DVI_STATUSES)[number];

/** Prélèvements post-mortem servant à l'identification. */
export const DVI_SAMPLES = ["dna", "dental", "fingerprint"] as const;
export type DviSample = (typeof DVI_SAMPLES)[number];

/** Mode d'identification retenu : ADN, empreinte digitale, dentaire, signe corporel. */
export const ID_METHODS = ["dna", "fingerprint", "dental", "body_mark"] as const;
export type IdMethod = (typeof ID_METHODS)[number];

export type Sex = "m" | "f" | "unknown";

/**
 * Identité d'une personne, telle qu'on la connaît — préliminaire sur le
 * terrain, confirmée à la morgue. Chaque champ est absent tant qu'il est
 * inconnu : l'écran dit alors « non identifié », il n'invente rien.
 */
export interface PersonIdentity {
  lastName?: string;
  firstName?: string;
  /** Carte nationale d'identité, si elle existe. */
  cni?: string;
  sex?: Sex;
  /** Âge (années), si connu. */
  age?: number;
}

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
  // --- identité et identification (reprennent la préliminaire du terrain, complétée à la morgue) ---
  lastName?: string;
  firstName?: string;
  cni?: string;
  age?: number;
  /** Heure du décès (ISO 8601), corrigée à la morgue ; absente = non connue. */
  deathAt?: string;
  /** Mode d'identification retenu, quand et par qui, note. */
  idMethod?: IdMethod;
  identifiedAt?: string;
  identifiedBy?: string;
  note?: string;
  /** La victime de l'incident dont ce dossier est issu, s'il vient du terrain. */
  victimId?: string;
  /** D'où vient le corps : un hôpital (décès en établissement) ou le terrain. */
  origin?: { kind: "hospital" | "field"; id?: string; label: string };
  /** La chaîne de garde, dans l'ordre ; absente sur les dossiers antérieurs. */
  custody?: CustodyEvent[];
  /** Transfert annoncé par l'expéditeur, réception à confirmer par le site : le corps n'est pas encore « chez lui ». */
  pendingReceipt?: boolean;
  /**
   * Les modifications du dossier, dans l'ordre : qui, quand, quels champs,
   * avant → après. C'est la traçabilité que l'identification progressive
   * exige — chaque détail ajouté ou corrigé se retrouve ici, signé.
   */
  history?: RecordChange[];
  /** Horodatages ISO 8601 : admission et dernière évolution. */
  admittedAt: string;
  updatedAt: string;
}

/** Une modification d'un dossier mortuaire : signée, datée, champ par champ. */
export interface RecordChange {
  at: string;
  by: string;
  /** Les champs touchés, dans l'ordre de la saisie. */
  fields: string[];
  /** Valeurs avant et après, pour ces seuls champs (absent = non renseigné). */
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

// --- bilan des victimes d'un incident --------------------------------------
// Les compteurs (`casualties`) disent COMBIEN ; les victimes nommées disent
// QUI, quand les intervenants le savent : identification préliminaire d'un
// décédé (à confirmer par la morgue d'affectation), blessé évacué, disparu.

export const VICTIM_KINDS = ["dead", "injured", "missing"] as const;
export type VictimKind = (typeof VICTIM_KINDS)[number];

export interface IncidentVictim extends PersonIdentity {
  id: string;
  incidentId: string;
  kind: VictimKind;
  note?: string;
  /** Décédé : heure du décès si connue. */
  deathAt?: string;
  /** Décédé : morgue d'affectation et dossier ouvert là-bas. */
  morgueId?: string;
  recordId?: string;
  /** Blessé : établissement d'évacuation. */
  hospitalId?: string;
  /** Disparu : dernier lieu où la personne a été vue. */
  lastSeen?: string;
  createdAt: string;
  updatedAt: string;
  /** Qui a saisi / corrigé (matricule). */
  by: string;
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
// `pco` et `pct` : les deux postes de commandement du TACOM (ADR 0016).
export const POST_KINDS = ["opcom", "tacom", "pco", "pct", "bluecell", "greencell", "orangecell", "shelter", "equipment"] as const;
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
