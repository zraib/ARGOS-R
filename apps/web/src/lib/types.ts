// ============================================================================
// ARGOS — types du domaine
// Partagés par la couche de données, le store et l'UI. En production, ils
// reflètent le client généré depuis l'OpenAPI (voir MASTER_PLAN §4.2). Pour le
// prototype, ils sont écrits à la main pour coller aux données simulées.
// ============================================================================

export type Lang = "fr" | "ar" | "en";

/**
 * Type d'incident : identifiant du catalogue PARAMÉTRABLE servi par l'API
 * (/incident-types). Chaîne libre — la plateforme peut enregistrer de nouveaux
 * types sans modifier le code.
 */
export type IncidentType = string;

/** Définition d'un type d'incident (catalogue API : libellés trilingues + icône). */
export interface IncidentTypeDef {
  id: string;
  labels: { fr: string; ar: string; en: string };
  icon: string;
  builtin?: boolean;
}

export type Severity = "high" | "medium" | "low";
export type IncidentStatus = "open" | "prog" | "closed";


// --- Missions : la boucle fermée (ADR 0007, docs/08-workflow-operationnel.md) ---

/** Nature de la boucle. Le cycle de vie est le même pour les trois. */
export type MissionKind = "order" | "resource_request" | "transfer";
/** États de la boucle. */
export type MissionState = "issued" | "accepted" | "declined" | "in_progress" | "completed" | "cancelled";
/** Jalons d'exécution. */
export type MissionMilestoneKey = "en_route" | "on_site" | "handover";

/** Partie prenante (émetteur ou destinataire). */
export interface MissionParty {
  role: string;
  userId?: string;
  entity?: string;
}

/** Mission telle que servie par l'API. */
export interface Mission {
  id: string;
  kind: MissionKind;
  incidentId: string;
  label: string;
  from: MissionParty;
  to: MissionParty;
  state: MissionState;
  milestones: { key: MissionMilestoneKey; at: string; by: string }[];
  /** Motif — présent au refus et à l'annulation. */
  reason?: string;
  payload: Record<string, unknown> & { kind: MissionKind };
  issuedAt: string;
  updatedAt: string;
}

/** Familles de menace NRBC (volet déclaratif d'un incident de type nrbc). */
export type NrbcFamily = "N" | "R" | "B" | "C";

/** Volet NRBC d'un incident : famille, substance du catalogue, ampleur, rejet. */
export interface NrbcDetails {
  family: NrbcFamily;
  substanceId?: string;
  spill?: "small" | "large";
  release?: "instant" | "continuous";
}

/** Substance chimique du catalogue API (table 1 de l'ERG 2024). */
export interface NrbcSubstance {
  id: string;
  un: string;
  ergGuide: string;
  labels: { fr: string; ar: string; en: string };
  state: "gas" | "liquid";
  small: { isolationM: number; protectDayKm: number; protectNightKm: number };
  large: { isolationM: number; protectDayKm: number; protectNightKm: number };
  /** false = distances à confirmer sur l'ERG 2024 — l'UI l'affiche. */
  ergVerified: boolean;
}

/** Zone du panache : propriétés portées par chaque Feature GeoJSON de l'API. */
export interface NrbcPlumeZoneProps {
  model: "atp45" | "erg";
  level: "danger" | "protection" | "vigilance";
  kind: "circle" | "wedge" | "square";
  /**
   * Nappe d'AXE émise sous le seuil de vent ATP-45 (lot N-4e) : elle dit la
   * direction la plus probable, elle n'est pas un périmètre à poser. Le cercle
   * de vigilance qui l'accompagne reste la zone doctrinale.
   */
  lowWind?: boolean;
  radiusKm: number | null;
  reachKm: number | null;
}

/** Panache estimé d'un incident NRBC (réponse /nrbc/plume/:id). */
export interface NrbcPlume {
  incidentId: string;
  substance: Pick<NrbcSubstance, "id" | "un" | "ergGuide" | "labels" | "ergVerified"> | null;
  spill: "small" | "large";
  hour: number;
  /** Vent du pas de prévision retenu — null si la prévision est indisponible. */
  wind: { speedKmh: number; fromDeg: number; time: string; isDay: boolean } | null;
  models: ("atp45" | "erg")[];
  generatedAt: string;
  fc: {
    type: "FeatureCollection";
    features: {
      type: "Feature";
      properties: NrbcPlumeZoneProps;
      geometry: { type: "Polygon"; coordinates: [number, number][][] };
    }[];
  };
}

export interface Incident {
  id: string;
  type: IncidentType;
  titre: string;
  region: string;
  sev: Severity;
  st: IncidentStatus;
  time: string;
  /** Coordonnées de la mini-carte SVG (silhouette du Maroc) */
  x: number;
  y: number;
  /** Coordonnées géographiques [lng, lat] */
  ll: [number, number];
  /** Adresse / lieu-dit saisi à la déclaration (optionnel) */
  adresse?: string;
  /**
   * Description libre de la situation, saisie à la déclaration.
   * Persistée par l'API depuis le lot V-3 — auparavant collectée puis perdue.
   */
  desc?: string;
  /** Bilan humain saisi à la déclaration (optionnel).
   *  Sémantique selon type d'incident :
   *    - traumatique (séisme/inondation/…) : injured = blessés
   *    - épidémiologique : injured peut être alias de infected
   *    - NRBC / industriel chimique : contaminated, exposed
   */
  casualties?: {
    dead: number; injured: number; missing: number;
    infected?: number;
    exposed?: number;
    contaminated?: number;
    rescued?: number;
  };
  /** Premiers intervenants rattachés : identifiants d'unités / d'hôpitaux */
  responders?: { units: string[]; hospitals: string[] };
  /** Sous-incidents (aléas secondaires rattachés après la déclaration) */
  subIncidents?: SubIncident[];
  /** Volet NRBC (incidents de type nrbc) */
  nrbc?: NrbcDetails;
  /** Incident archivé (masqué de la liste active) */
  archived?: boolean;
}

/** Aléa secondaire rattaché à un incident principal (mêmes détails qu'un incident). */
export interface SubIncident {
  id: string;
  type: string;
  sev: Severity;
  note?: string;
  time: string;
  ll?: [number, number];
  casualties?: {
    dead: number; injured: number; missing: number;
    infected?: number; exposed?: number; contaminated?: number; rescued?: number;
  };
  responders?: { units: string[]; hospitals: string[] };
}

/** Sous-type d'incident (libellés trilingues, servis par l'API). */
export interface SubIncidentTypeDef {
  id: string;
  labels: { fr: string; ar: string; en: string };
}

/** Catalogue des sous-types + mapping par type d'incident principal. */
export interface SubIncidentCatalog {
  types: SubIncidentTypeDef[];
  byParent: Record<string, string[]>;
}

export type UnitReadiness = "ready" | "deployed" | "standby";

export interface Unit {
  id: string;
  nom: string;
  ville: string;
  cmdt: string;
  eff: number;
  dispo: UnitReadiness;
  readiness: number;
  x: number;
  y: number;
  ll: [number, number];
}

/**
 * Réseau et échelon d'un établissement de santé — pilote le symbole
 * cartographique et les filtres Hospinet (voir lib/hospitals.ts) :
 * militaire, campagne militaire, civil (CHP/local/psy), régional civil (CHR),
 * universitaire civil (CHU), campagne civil.
 */
export type HospitalKind = "mil" | "mil_field" | "civ" | "civ_reg" | "civ_univ" | "civ_field";

export type HospitalServiceKey = "rea" | "chirurgie" | "medecine" | "urgences" | "pediatrie" | string;

export interface HospitalStoredService {
  key: HospitalServiceKey;
  name: string;
  total: number;
  occ: number;
}

export type WardStatus = "open" | "saturated" | "closed";

export interface HospitalWard {
  id: string;
  key: HospitalServiceKey;
  name: string;
  lits: number;
  occ: number;
  statut: WardStatus;
  chef?: string | null;
}

/**
 * Référentiel ARGOS des types de services hospitaliers (~20 familles).
 * L'opérateur choisit depuis ce dropdown ; le type peut aussi être libre.
 */
export const ARGOS_WARD_REFERENCE: { key: HospitalServiceKey; label: string; default?: boolean }[] = [
  { key: "rea",           label: "Réanimation / USIC", default: true },
  { key: "chirurgie",     label: "Chirurgie générale", default: true },
  { key: "chir_digest",   label: "Chirurgie digestive" },
  { key: "orthopedie",    label: "Orthopédie - Traumatologie" },
  { key: "cardio",        label: "Cardiologie" },
  { key: "pneumo",        label: "Pneumologie" },
  { key: "medecine",      label: "Médecine interne", default: true },
  { key: "urgences",      label: "Urgences", default: true },
  { key: "pediatrie",     label: "Pédiatrie", default: true },
  { key: "maternite",     label: "Maternité / Obstétrique" },
  { key: "geriatrie",     label: "Gériatrie / SSR" },
  { key: "neuro",         label: "Neurologie" },
  { key: "hepato",        label: "Hépato-gastro-entérologie" },
  { key: "nephro",        label: "Néphrologie / Dialyse" },
  { key: "rhumato",       label: "Rhumatologie" },
  { key: "orl",           label: "ORL" },
  { key: "ophtalmo",      label: "Ophtalmologie" },
  { key: "oncologie",     label: "Oncologie / Hémato" },
  { key: "psychiatrie",   label: "Psychiatrie" },
  { key: "reeducation",   label: "Rééducation / MPR" },
];

export interface Hospital {
  id: string;
  nom: string;
  ville: string;
  /** Région administrative de rattachement. */
  region?: string;
  /** Province / préfecture de rattachement. */
  province?: string;
  /** Réseau et échelon (absent sur les données antérieures : voir hospKind). */
  kind?: HospitalKind;
  /** Nature de la structure (CHU militaire, hôpital général, régional…). */
  type?: string;
  /**
   * Services (wards) renseignés localement côté frontend,
   * transitoire, en attendant la saisie réelle via le endpoint `/hospitals/:id/wards`
   * du backend NestJS. Si absent → dérivation statistique rétrocompat.
   */
  services?: HospitalStoredService[];
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
  /** Lits réservés par une EVASAN acceptée mais pas encore arrivée (P2-b). */
  reserved?: number;
}

export type FieldHospStatus = "op" | "partial";

export interface FieldHospital {
  hid: string;
  nom: string;
  cap: number;
  occ: number;
  statut: FieldHospStatus;
  depuis: string;
  /** Réseau de rattachement : campagne militaire ou campagne civile. */
  kind?: "mil_field" | "civ_field";
  x?: number;
  y?: number;
  ll?: [number, number];
}

export interface FeedItem {
  time: string;
  /** classe Tailwind bg-* pour la pastille de statut */
  c: string;
  txt: string;
}

export interface VehRoute {
  id: string;
  label: string;
  kind: string;
  /** unités de progression par seconde */
  speed: number;
  route: [number, number][];
}

// --- Communications ------------------------------------------------------

export type ChannelKind = "text" | "voice";

export interface Channel {
  id: string;
  name: string;
  kind: ChannelKind;
  topic?: string;
  /**
   * Matricules autorisés. ABSENT = canal OUVERT (les canaux thématiques
   * historiques) ; DÉFINI = canal restreint à cette liste.
   */
  members?: string[];
  /** Incident porteur, pour les canaux nés d'une déclaration. */
  incidentId?: string;
  archived?: boolean;
}

/** Compte joignable, tel que l'annuaire du centre de communication le rend. */
export interface DirectoryEntry {
  matricule: string;
  nom: string;
  grade?: string;
  roles: string[];
}

export interface CommCategory {
  id: string;
  name: string;
  chans: Channel[];
}

/** Pièce jointe d'un message — le contenu vit côté serveur (lot COMMS). */
export interface CommAttachment {
  id: string;
  name: string;
  mime: string;
  bytes: number;
}

export interface CommMessage {
  id: number;
  /** Nom affiché de l'auteur. */
  who: string;
  /** MATRICULE de l'auteur — c'est lui, et non le nom, qui dit si le message est le nôtre. */
  author?: string;
  initials: string;
  /** classes Tailwind pour l'avatar */
  av: string;
  time: string;
  txt: string;
  mine?: boolean;
  /** Absente pour un message de texte seul — la majorité. */
  attachment?: CommAttachment;
}

/** Un compte réellement connecté, tel que le flux temps réel le rapporte. */
export interface PresenceUser {
  matricule: string;
  role: string;
  /** Nombre de flux ouverts : deux onglets font UN présent, pas deux. */
  sessions: number;
  since: string;
}

export interface Member {
  n: string;
  g: string;
  av: string;
  initials: string;
}

export interface Province {
  v: string;
  region: string;
  x: number;
  y: number;
  /** Coordonnées géographiques du chef-lieu [lng, lat] */
  ll?: [number, number];
}

/** Ville / commune (référentiel de localisation fine, API /reference). */
export interface City {
  v: string;
  region: string;
  ll: [number, number];
}

/** Statistiques de commandement servies par l'API (/dashboard/stats). */
export interface DashStats {
  evolution: { d: string; opened: number; closed: number }[];
  severity: { high: number; medium: number; low: number };
  status: { open: number; prog: number; closed: number };
  casualties: {
    dead: number; injured: number; missing: number; rescued: number;
    /** Champs optionnels (NRBC / épidémiologique) */
    infected?: number;
    exposed?: number;
    contaminated?: number;
  };
  hospitals: { id: string; nom: string; ville: string; kind?: HospitalKind; occPct: number; icuPct: number }[];
  units: { total: number; deployed: number; ready: number; avgReadiness: number };
}

// --- Flux externes : sismologie (EMSC) & météo (Open-Meteo) --------------
// Contrats stables servis par l'API (proxy souverain, voir docs/adr/0002).

/** Séisme normalisé depuis le CSEM/EMSC (API /seismic/events). */
export interface SeismicEvent {
  id: string;
  /** ISO 8601 UTC */
  time: string;
  mag: number;
  magType: string;
  depth: number;
  region: string;
  lat: number;
  lon: number;
  /** [lng, lat] pour la carte */
  ll: [number, number];
  /** Type d'événement (earthquake, quarry blast…). */
  evtype: string;
  /** Agence / réseau d'origine. */
  agency: string;
  /** Dernière mise à jour de la solution (ISO 8601). */
  lastUpdate: string;
  /** Identifiant source EMSC. */
  sourceId: string;
}

/** Ville sélectionnable pour la météo (API /weather/cities). */
export interface WeatherCity {
  id: string;
  nom: string;
  lat: number;
  lon: number;
}

/** Conditions actuelles (API /weather/forecast). */
export interface WeatherNow {
  temp: number;
  feels: number;
  humidity: number;
  wind: number;
  gust: number;
  windDir: number;
  precip: number;
  pressure: number;
  cloud: number;
  code: number;
}

/** Prévision journalière (API /weather/forecast). */
export interface WeatherDay {
  date: string;
  code: number;
  tmax: number;
  tmin: number;
  precip: number;
  precipProb: number;
  feelMax: number;
  feelMin: number;
  windMax: number;
  gustMax: number;
  uvMax: number;
  sunrise: string;
  sunset: string;
}

/** Prévisions météo pour un point (API /weather/forecast). */
export interface WeatherForecast {
  lat: number;
  lon: number;
  current: WeatherNow;
  daily: WeatherDay[];
}

/** Série horaire d'un point de la grille météo (API /weather/grid). */
export interface WeatherGridPoint {
  lat: number;
  lon: number;
  temp: number[];
  wind: number[];
  /** Direction d'où vient le vent (degrés), par heure. */
  windDir: number[];
  /** Probabilité de précipitations (%), par heure. */
  precipProb: number[];
}

/** Grille météo animée : heures de prévision partagées + points (row-major). */
export interface WeatherGridSeries {
  times: string[];
  points: WeatherGridPoint[];
}

// --- Alertes sismiques (configuration serveur) ---------------------------

/** Autorité notifiée (SMS + e-mail) lors d'un séisme national ≥ seuil. */
export interface AuthorityContact {
  name: string;
  phone: string;
  email: string;
}

/** Configuration des alertes sismiques (GET/PATCH /seismic/alert-config). */
export interface SeismicAlertConfig {
  /** Seuil national : SMS + e-mail aux autorités + alerte rouge dans l'app. */
  maMinMag: number;
  /** Seuil mondial : simple notification dans l'app. */
  globalMinMag: number;
  contacts: AuthorityContact[];
}

/** Trace d'un envoi SMS/e-mail aux autorités (historique serveur). */
export interface SeismicNotification {
  id: string;
  quakeId: string;
  mag: number;
  region: string;
  quakeTime: string;
  sentAt: string;
  contacts: number;
  channels: ("sms" | "email")[];
}

// --- Sélection sur la carte opérationnelle -------------------------------

export type MarkerKind = "unit" | "hosp" | "inc" | "veh" | "field" | "acft";

// --- suivi aérien (feux de forêt) ---
// Miroir des types du module `aviation` de l'API. Le poste de commandement ne
// suit que les aéronefs qu'un opérateur a explicitement inscrits.

export type AircraftRole = "waterbomber" | "helicopter" | "observation" | "transport" | "medevac";
export type AircraftCodeKind = "icao24" | "registration" | "callsign" | "squawk";
export type TrackingStatus = "airborne" | "ground" | "no_signal";

export interface TrackedAircraft {
  id: string;
  code: string;
  codeKind: AircraftCodeKind;
  icao24?: string;
  label: string;
  role: AircraftRole;
  incidentId?: string;
  archived: boolean;
  addedAt: string;
  addedBy: string;
}

export interface AircraftPosition {
  icao24: string;
  callsign: string | null;
  lat: number;
  lon: number;
  ll: [number, number];
  /** Altitude en mètres. */
  altitude: number | null;
  /** Cap vrai en degrés (0 = nord). */
  heading: number | null;
  /** Vitesse sol en m/s. */
  velocity: number | null;
  verticalRate: number | null;
  onGround: boolean;
  squawk: string | null;
  lastContact: string;
  originCountry: string | null;
}

export interface TrackedAircraftState {
  aircraft: TrackedAircraft;
  position: AircraftPosition | null;
  status: TrackingStatus;
}

export interface MapSelection {
  kind: MarkerKind;
  id: string;
}
