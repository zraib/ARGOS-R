// ============================================================================
// ARGOS — types du domaine
// Partagés par la couche de données, le store et l'UI. En production, ils
// reflètent le client généré depuis l'OpenAPI (voir MASTER_PLAN §4.2). Pour le
// prototype, ils sont écrits à la main pour coller aux données simulées.
// ============================================================================

export type Lang = "fr" | "ar" | "en";

export type IncidentType =
  | "earthquake"
  | "flood"
  | "wildfire"
  | "landslide"
  | "epidemic"
  | "industrial";

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
}

// --- Sélection sur la carte opérationnelle -------------------------------

export type MarkerKind = "unit" | "hosp" | "inc" | "veh" | "field";

export interface MapSelection {
  kind: MarkerKind;
  id: string;
}
