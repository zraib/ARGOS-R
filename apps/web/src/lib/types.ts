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
  /** Bilan humain saisi à la déclaration (optionnel) */
  casualties?: { dead: number; injured: number; missing: number };
  /** Premiers intervenants rattachés : identifiants d'unités / d'hôpitaux */
  responders?: { units: string[]; hospitals: string[] };
  /** Sous-incidents (aléas secondaires rattachés après la déclaration) */
  subIncidents?: SubIncident[];
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
  casualties?: { dead: number; injured: number; missing: number };
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

export interface Hospital {
  id: string;
  nom: string;
  ville: string;
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

export type FieldHospStatus = "op" | "partial";

export interface FieldHospital {
  hid: string;
  nom: string;
  cap: number;
  occ: number;
  statut: FieldHospStatus;
  depuis: string;
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
}

export interface CommCategory {
  id: string;
  name: string;
  chans: Channel[];
}

export interface CommMessage {
  id: number;
  who: string;
  initials: string;
  /** classes Tailwind pour l'avatar */
  av: string;
  time: string;
  txt: string;
  mine?: boolean;
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
  casualties: { dead: number; injured: number; missing: number; rescued: number };
  hospitals: { id: string; nom: string; ville: string; occPct: number; icuPct: number }[];
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

export type MarkerKind = "unit" | "hosp" | "inc" | "veh" | "field";

export interface MapSelection {
  kind: MarkerKind;
  id: string;
}
