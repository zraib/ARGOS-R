// ============================================================================
// ARGOS — types des modules opérationnels (MASTER_PLAN §6)
// Les DONNÉES viennent désormais de l'API (`GET /catalog`, chargées dans le
// store). Ce fichier ne conserve que les TYPES et un catalogue vide de bootstrap
// (aucune donnée métier locale).
// ============================================================================

export type EquipCondition = "ok" | "repair" | "oos";
export interface EquipItem {
  id: string;
  desig: string;
  cat: string;
  unit: string;
  stock: number;
  threshold: number;
  cond: EquipCondition;
}
export type MovementType = "in" | "out" | "transfer";
export interface Movement {
  id: string;
  date: string;
  type: MovementType;
  item: string;
  qty: number;
  from: string;
  to: string;
  by: string;
}

export type Availability = "available" | "deployed" | "rest" | "unavailable";
export interface PersonRecord {
  id: string;
  grade: string;
  nom: string;
  unit: string;
  fonction: string;
  spec: string;
  av: Availability;
}

export type WoPriority = "low" | "medium" | "high" | "urgent";
export type WoStatus = "requested" | "approved" | "assigned" | "inprogress" | "done" | "verified";
export interface WorkOrder {
  id: string;
  subject: string;
  unit: string;
  assignee: string;
  priority: WoPriority;
  status: WoStatus;
  sla: string;
  created: string;
}

export type TriageColor = "red" | "yellow" | "green" | "black";
export interface TriageZone {
  id: string;
  name: string;
  red: number;
  yellow: number;
  green: number;
  black: number;
}
export interface TriageFlow {
  site: number;
  evac: number;
  hospital: number;
}
export interface Victim {
  tag: string;
  color: TriageColor;
  zone: string;
  time: string;
  destination: string;
}

export type SupplyStatus = "ok" | "low" | "critical";
export interface Shelter {
  id: string;
  nom: string;
  ville: string;
  capacity: number;
  occupants: number;
  staff: number;
  supplies: SupplyStatus;
  needs: string;
  adults: number;
  children: number;
  elderly: number;
}

export type Habitability = "ok" | "restricted" | "no";
export interface DamageRecord {
  id: string;
  building: string;
  zone: string;
  grade: 1 | 2 | 3 | 4 | 5;
  habitability: Habitability;
  assessor: string;
  date: string;
}

export interface OrsecBoard {
  planLevel: number;
  activatedAt: string;
  casualties: { dead: number; injured: number; missing: number; rescued: number };
  units: { engaged: number; available: number };
  personnel: { engaged: number; available: number };
  vehicles: { engaged: number; available: number };
  hospitalLoad: number;
  sheltersActive: number;
  org: { role: string; name: string }[];
  decisions: { time: string; author: string; decision: string }[];
  duty: { role: string; name: string }[];
}

export type PlanStatus = "active" | "draft" | "review" | "expired";
export interface PlanRecord {
  id: string;
  name: string;
  type: string;
  zone: string;
  version: string;
  updated: string;
  status: PlanStatus;
}

export type IcsStatus = "draft" | "review" | "approved";
export interface IcsForm {
  code: string;
  titleKey: "f201" | "f202" | "f203" | "f204" | "f205" | "f206" | "f209" | "f214";
  incident: string;
  status: IcsStatus;
  updated: string;
  author: string;
}

export type ReportStatus = "draft" | "published";
export interface Report {
  id: string;
  title: string;
  incident: string;
  period: string;
  author: string;
  status: ReportStatus;
  published: string;
}

export interface Bar {
  label: string;
  value: number;
  couleur: string;
}
export interface Analytics {
  kpis: { avgResponse: number; evacAdmit: number; closedRate: number; util: number };
  responseTimes: Bar[];
  incidentTrend: Bar[];
  resourceUtil: Bar[];
  hospitalSat: Bar[];
  triageOutcomes: Bar[];
}

/** Catalogue complet des modules opérationnels (réponse de `GET /catalog`). */
export interface Catalog {
  equipment: EquipItem[];
  movements: Movement[];
  roster: PersonRecord[];
  workOrders: WorkOrder[];
  triageZones: TriageZone[];
  triageFlow: TriageFlow;
  victims: Victim[];
  shelters: Shelter[];
  damage: DamageRecord[];
  orsec: OrsecBoard;
  plans: PlanRecord[];
  ics: IcsForm[];
  reports: Report[];
  analytics: Analytics;
}

/** Catalogue de bootstrap (vide) avant chargement depuis l'API. */
export const EMPTY_CATALOG: Catalog = {
  equipment: [],
  movements: [],
  roster: [],
  workOrders: [],
  triageZones: [],
  triageFlow: { site: 0, evac: 0, hospital: 0 },
  victims: [],
  shelters: [],
  damage: [],
  orsec: {
    planLevel: 0,
    activatedAt: "—",
    casualties: { dead: 0, injured: 0, missing: 0, rescued: 0 },
    units: { engaged: 0, available: 0 },
    personnel: { engaged: 0, available: 0 },
    vehicles: { engaged: 0, available: 0 },
    hospitalLoad: 0,
    sheltersActive: 0,
    org: [],
    decisions: [],
    duty: [],
  },
  plans: [],
  ics: [],
  reports: [],
  analytics: {
    kpis: { avgResponse: 0, evacAdmit: 0, closedRate: 0, util: 0 },
    responseTimes: [],
    incidentTrend: [],
    resourceUtil: [],
    hospitalSat: [],
    triageOutcomes: [],
  },
};
