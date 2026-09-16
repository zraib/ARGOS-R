// ============================================================================
// ARGOS — ressources d'une entité (ADR 0016) : types miroir de l'API et aides
// ============================================================================

import type { Dict } from "@/lib/i18n/translations";
import type { EquipItem } from "@/lib/data/modules";

export type ResourceOwnerKind = "unit" | "hospital" | "shelter";
export interface ResourceOwner {
  kind: ResourceOwnerKind;
  id: string;
}

export const PERSON_CORPS = ["far", "gendarmerie", "fa", "dgsn", "dgpc", "civil"] as const;
export type PersonCorps = (typeof PERSON_CORPS)[number];
export const PERSON_STATUS = ["present", "deployed", "rest", "absent"] as const;
export type PersonStatus = (typeof PERSON_STATUS)[number];

export interface Person {
  id: string;
  owner: ResourceOwner;
  corps: PersonCorps;
  grade?: string;
  nom: string;
  prenom: string;
  matricule: string;
  fonction: string;
  teamId?: string;
  status: PersonStatus;
  phone?: string;
  note?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Team {
  id: string;
  owner: ResourceOwner;
  nom: string;
  mission?: string;
  leaderId?: string;
  memberIds: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const VEHICLE_STATES = ["ok", "repair", "oos"] as const;
export type VehicleState = (typeof VEHICLE_STATES)[number];

export interface Vehicle {
  id: string;
  owner: ResourceOwner;
  type: string;
  plate: string;
  qty: number;
  state: VehicleState;
  assignment?: string;
  note?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const SUPPLY_KINDS = ["fuel", "food", "bedding", "camp", "other"] as const;
export type SupplyKind = (typeof SUPPLY_KINDS)[number];

export interface Supply {
  id: string;
  owner: ResourceOwner;
  kind: SupplyKind;
  label: string;
  qty: number;
  unit: string;
  threshold?: number;
  note?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const RESOURCE_KINDS = ["persons", "teams", "vehicles", "supplies", "equipment"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

/** Ce que l'API rend pour un détenteur. */
export interface OwnerResources {
  owner: ResourceOwner;
  label: string;
  persons: Person[];
  teams: Team[];
  vehicles: Vehicle[];
  supplies: Supply[];
  equipment: EquipItem[];
  mode: "demo" | "exercise" | "operational";
  canManage: Record<ResourceKind, boolean>;
}

/** Libellé du statut d'une personne. */
export function personStatusLabel(s: PersonStatus, t: Dict): string {
  return { present: t.rs_status_present, deployed: t.rs_status_deployed, rest: t.rs_status_rest, absent: t.rs_status_absent }[s];
}

export function vehicleStateLabel(s: VehicleState, t: Dict): string {
  return { ok: t.rs_state_ok, repair: t.rs_state_repair, oos: t.rs_state_oos }[s];
}

export function supplyKindLabel(k: SupplyKind, t: Dict): string {
  return { fuel: t.rs_supply_fuel, food: t.rs_supply_food, bedding: t.rs_supply_bedding, camp: t.rs_supply_camp, other: t.rs_supply_other }[k];
}

/** Nom affiché d'une personne : grade, prénom, nom. */
export function personName(p: Pick<Person, "grade" | "nom" | "prenom">): string {
  return [p.grade, p.prenom, p.nom].filter(Boolean).join(" ");
}

/** Analyse `unit:U3` (paramètre d'URL) en détenteur. */
export function parseOwner(v: string | null | undefined): ResourceOwner | null {
  if (!v) return null;
  const [kind, id] = v.split(":");
  if ((kind === "unit" || kind === "hospital" || kind === "shelter") && id) return { kind, id };
  return null;
}

export function ownerParam(o: ResourceOwner): string {
  return `${o.kind}:${o.id}`;
}
