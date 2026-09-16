// ============================================================================
// ARGOS — ressources d'une entité (ADR 0016) : personnes, équipes, véhicules,
// logistique. Les équipements gardent leur type (`EquipItem`, catalog.data.ts).
//
// Une ressource appartient à UNE entité — unité, hôpital ou abri — tenue par
// son chef (responsable) et, selon le mode de la station, par les cellules du
// TACOM. Elle est visible de tout intervenant qui lit les ressources.
// ============================================================================

export const RESOURCE_OWNER_KINDS = ["unit", "hospital", "shelter"] as const;
export type ResourceOwnerKind = (typeof RESOURCE_OWNER_KINDS)[number];

export interface ResourceOwner {
  kind: ResourceOwnerKind;
  id: string;
}

/**
 * Corps d'une personne : les corps en uniforme portent un GRADE (militaires
 * des FAR, Forces Auxiliaires, Gendarmerie Royale, DGSN) ; le personnel civil
 * (hôpital, abri, protection civile) porte une FONCTION — le grade y est
 * facultatif.
 */
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
  /** Équipe d'appartenance, s'il y en a une. */
  teamId?: string;
  status: PersonStatus;
  phone?: string;
  note?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Équipe de personnes d'une même entité (binôme, section, équipe cynophile…). */
export interface Team {
  id: string;
  owner: ResourceOwner;
  nom: string;
  mission?: string;
  /** Chef d'équipe, une personne de l'entité. */
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
  /** Type (ambulance, VLTT, camion-citerne, hélicoptère…). */
  type: string;
  /** Immatriculation ou numéro de parc ; vide pour une flotte comptée. */
  plate: string;
  /** Nombre de véhicules identiques (1 par défaut ; une flotte comptée en porte plus). */
  qty: number;
  state: VehicleState;
  /** Affectation courante (mission, lieu), texte libre. */
  assignment?: string;
  note?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Ressources logistiques tenues par la cellule verte : carburant, vivres, couchage, campement. */
export const SUPPLY_KINDS = ["fuel", "food", "bedding", "camp", "other"] as const;
export type SupplyKind = (typeof SUPPLY_KINDS)[number];

export interface Supply {
  id: string;
  owner: ResourceOwner;
  kind: SupplyKind;
  label: string;
  qty: number;
  /** Unité de compte : L, rations, places, tentes… */
  unit: string;
  /** Seuil d'alerte (réapprovisionner en dessous). */
  threshold?: number;
  note?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const RESOURCE_KINDS = ["persons", "teams", "vehicles", "supplies", "equipment"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export function sameOwner(a: ResourceOwner, b: ResourceOwner): boolean {
  return a.kind === b.kind && a.id === b.id;
}
