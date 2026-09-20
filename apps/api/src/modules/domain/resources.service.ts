// ============================================================================
// ARGOS — registre des ressources (ADR 0016) : personnes, équipes, véhicules,
// logistique ; les équipements restent dans le domaine (parc).
//
// Même mécanique que le parc d'équipement : tableaux en mémoire, identifiants
// séquentiels préfixés, instantané `resources.json` (dev-store). Une ressource
// appartient à un détenteur (unité, hôpital, abri) ; quand le détenteur est
// retiré, ses ressources partent avec lui (cascade d'entité du domaine).
// ============================================================================

import { Injectable } from "@nestjs/common";
import { loadDevState, saveDevState } from "@/common/dev-store";
import { DomainService } from "@/modules/domain/domain.service";
import type { EquipItem } from "@/modules/domain/catalog.data";
import type { Placement } from "@/modules/domain/domain.types";
import {
  sameOwner,
  type Person,
  type PlaceableKind,
  type PlaceableResource,
  type PlacedResource,
  type ResourceOwner,
  type Supply,
  type Team,
  type Vehicle,
} from "@/modules/domain/resources.types";

type Snapshot = { persons?: Person[]; teams?: Team[]; vehicles?: Vehicle[]; supplies?: Supply[] };

type PersonInput = Omit<Person, "id" | "owner" | "createdBy" | "createdAt" | "updatedAt">;
type TeamInput = Omit<Team, "id" | "owner" | "createdBy" | "createdAt" | "updatedAt">;
type VehicleInput = Omit<Vehicle, "id" | "owner" | "createdBy" | "createdAt" | "updatedAt">;
type SupplyInput = Omit<Supply, "id" | "owner" | "createdBy" | "createdAt" | "updatedAt">;

export interface OwnerResources {
  owner: ResourceOwner;
  label: string;
  persons: Person[];
  teams: Team[];
  vehicles: Vehicle[];
  supplies: Supply[];
  equipment: EquipItem[];
}

@Injectable()
export class ResourcesService {
  private persons: Person[] = [];
  private teams: Team[] = [];
  private vehicles: Vehicle[] = [];
  private supplies: Supply[] = [];

  constructor(private readonly domain: DomainService) {
    const snap = loadDevState<Snapshot>("resources", {});
    this.persons = snap.persons ?? [];
    this.teams = snap.teams ?? [];
    this.vehicles = snap.vehicles ?? [];
    this.supplies = snap.supplies ?? [];
    // Les orphelins d'un détenteur disparu entre deux démarrages partent.
    const before = this.total();
    const alive = (o: ResourceOwner) => this.domain.resourceOwner(o) !== undefined;
    this.persons = this.persons.filter((p) => alive(p.owner));
    this.teams = this.teams.filter((t) => alive(t.owner));
    this.vehicles = this.vehicles.filter((v) => alive(v.owner));
    this.supplies = this.supplies.filter((s) => alive(s.owner));
    if (this.total() !== before) this.persist();
    this.domain.registerEntityCascade((kind, id) => {
      if (kind === "morgue") return;
      this.dropOwner({ kind, id });
    });
  }

  private total(): number {
    return this.persons.length + this.teams.length + this.vehicles.length + this.supplies.length;
  }

  private persist(): void {
    saveDevState("resources", { persons: this.persons, teams: this.teams, vehicles: this.vehicles, supplies: this.supplies });
  }

  private nextId(prefix: string, list: readonly { id: string }[]): string {
    const n = Math.max(0, ...list.map((x) => parseInt(x.id.replace(/\D/g, ""), 10) || 0)) + 1;
    return `${prefix}-${n}`;
  }

  /** Tout ce qu'un détenteur tient ; `undefined` s'il n'existe pas. */
  listFor(owner: ResourceOwner): OwnerResources | undefined {
    const o = this.domain.resourceOwner(owner);
    if (!o) return undefined;
    return {
      owner,
      label: o.label,
      persons: this.persons.filter((p) => sameOwner(p.owner, owner)),
      teams: this.teams.filter((t) => sameOwner(t.owner, owner)),
      vehicles: this.vehicles.filter((v) => sameOwner(v.owner, owner)),
      supplies: this.supplies.filter((s) => sameOwner(s.owner, owner)),
      equipment: this.domain.listEquipmentOf(owner),
    };
  }

  /** Le registre entier — pour la conduite et les tableaux de bord. */
  listAll(): { persons: Person[]; teams: Team[]; vehicles: Vehicle[]; supplies: Supply[] } {
    return { persons: this.persons, teams: this.teams, vehicles: this.vehicles, supplies: this.supplies };
  }

  // --- terrain (ADR 0018) -----------------------------------------------------

  /** Ce que la carte lit : tout ce qui est posé sur le terrain, avec son détenteur. */
  listPlaced(): PlacedResource[] {
    const out: PlacedResource[] = [];
    for (const t of this.teams) if (t.position) out.push(this.placedOf("teams", t, t.position));
    for (const v of this.vehicles) if (v.position) out.push(this.placedOf("vehicles", v, v.position));
    for (const e of this.domain.listEquipment()) {
      if (e.position) out.push(this.placedOf("equipment", { id: e.id, owner: { kind: e.ownerKind ?? "unit", id: e.unitId } }, e.position));
    }
    return out;
  }

  /**
   * Ce qu'un compte peut poser (boîte à outils) : les ressources des natures
   * qu'il pose, sur les détenteurs que le filtre retient — le mode et
   * l'affectation des unités sont l'affaire de l'appelant (`edit.rules.ts`).
   */
  listPlaceable(kinds: readonly PlaceableKind[], keepOwner: (owner: ResourceOwner) => boolean): PlaceableResource[] {
    const out: PlaceableResource[] = [];
    const push = (kind: PlaceableKind, r: { id: string; owner: ResourceOwner; position?: Placement }) => {
      if (!keepOwner(r.owner)) return;
      const p = this.placedOf(kind, r, r.position ?? { ll: [0, 0], at: "", by: "" });
      out.push({ kind, id: p.id, owner: p.owner, ownerLabel: p.ownerLabel, label: p.label, sub: p.sub, placed: !!r.position });
    };
    if (kinds.includes("teams")) for (const t of this.teams) push("teams", t);
    if (kinds.includes("vehicles")) for (const v of this.vehicles) push("vehicles", v);
    if (kinds.includes("equipment")) for (const e of this.domain.listEquipment()) push("equipment", { id: e.id, owner: { kind: e.ownerKind ?? "unit", id: e.unitId }, position: e.position });
    return out;
  }

  /** La ressource visée par une pose, avec son détenteur ; `undefined` si elle n'existe pas. */
  findPlaceable(kind: PlaceableKind, id: string): { owner: ResourceOwner; position?: Placement } | undefined {
    if (kind === "teams") return this.teams.find((t) => t.id === id);
    if (kind === "vehicles") return this.vehicles.find((v) => v.id === id);
    const e = this.domain.listEquipment().find((x) => x.id === id);
    return e ? { owner: { kind: e.ownerKind ?? "unit", id: e.unitId }, position: e.position } : undefined;
  }

  /** Pose (ou retire, `undefined`) une ressource sur le terrain. */
  setPosition(kind: PlaceableKind, id: string, position: Placement | undefined): PlacedResource | null | undefined {
    if (kind === "equipment") {
      const e = this.domain.listEquipment().find((x) => x.id === id);
      if (!e) return undefined;
      const updated = this.domain.updateEquipmentOf({ kind: e.ownerKind ?? "unit", id: e.unitId }, id, { position: position ?? null } as Partial<EquipItem>);
      if (!updated) return undefined;
      return position ? this.placedOf("equipment", { id: e.id, owner: { kind: e.ownerKind ?? "unit", id: e.unitId } }, position) : null;
    }
    const r: (Team | Vehicle) | undefined = kind === "teams" ? this.teams.find((t) => t.id === id) : this.vehicles.find((v) => v.id === id);
    if (!r) return undefined;
    if (position) r.position = position;
    else delete r.position;
    r.updatedAt = new Date().toISOString();
    this.persist();
    return position ? this.placedOf(kind, r, position) : null;
  }

  /** Libellés d'une ressource posée : ce que le marqueur écrit. */
  private placedOf(kind: PlaceableKind, r: { id: string; owner: ResourceOwner }, position: Placement): PlacedResource {
    const ownerLabel = this.domain.resourceOwner(r.owner)?.label ?? r.owner.id;
    if (kind === "teams") {
      const t = this.teams.find((x) => x.id === r.id);
      return { kind, id: r.id, owner: r.owner, ownerLabel, label: t?.nom ?? r.id, sub: t?.mission, position };
    }
    if (kind === "vehicles") {
      const v = this.vehicles.find((x) => x.id === r.id);
      return { kind, id: r.id, owner: r.owner, ownerLabel, label: v ? `${v.type}${v.qty > 1 ? ` × ${v.qty}` : ""}` : r.id, sub: v?.plate || undefined, position };
    }
    const e = this.domain.listEquipment().find((x) => x.id === r.id);
    return { kind, id: r.id, owner: r.owner, ownerLabel, label: e?.desig ?? r.id, sub: e?.type || e?.cat, position };
  }

  /** Effectifs par détenteur (personnes, véhicules) — pour les listes d'unités. */
  countsFor(owner: ResourceOwner): { persons: number; teams: number; vehicles: number; supplies: number } {
    return {
      persons: this.persons.filter((p) => sameOwner(p.owner, owner)).length,
      teams: this.teams.filter((t) => sameOwner(t.owner, owner)).length,
      vehicles: this.vehicles.filter((v) => sameOwner(v.owner, owner)).reduce((n, v) => n + v.qty, 0),
      supplies: this.supplies.filter((s) => sameOwner(s.owner, owner)).length,
    };
  }

  // --- personnes -------------------------------------------------------------

  findPerson(id: string): Person | undefined {
    return this.persons.find((p) => p.id === id);
  }

  addPerson(owner: ResourceOwner, input: PersonInput, by: string): Person {
    const now = new Date().toISOString();
    const p: Person = { ...input, id: this.nextId("P", this.persons), owner, createdBy: by, createdAt: now, updatedAt: now };
    if (p.teamId && !this.teams.some((t) => t.id === p.teamId && sameOwner(t.owner, owner))) delete p.teamId;
    this.persons.push(p);
    this.syncTeamMembers(p);
    this.persist();
    return p;
  }

  updatePerson(id: string, patch: Partial<PersonInput>): Person | undefined {
    const p = this.persons.find((x) => x.id === id);
    if (!p) return undefined;
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) (p as unknown as Record<string, unknown>)[k] = v;
    if (p.teamId && !this.teams.some((t) => t.id === p.teamId && sameOwner(t.owner, p.owner))) delete p.teamId;
    p.updatedAt = new Date().toISOString();
    this.syncTeamMembers(p);
    this.persist();
    return p;
  }

  removePerson(id: string): boolean {
    const i = this.persons.findIndex((x) => x.id === id);
    if (i < 0) return false;
    this.persons.splice(i, 1);
    for (const t of this.teams) {
      t.memberIds = t.memberIds.filter((m) => m !== id);
      if (t.leaderId === id) delete t.leaderId;
    }
    this.persist();
    return true;
  }

  /** L'appartenance se lit des deux côtés : la personne porte son équipe, l'équipe liste ses membres. */
  private syncTeamMembers(p: Person): void {
    for (const t of this.teams) {
      const inTeam = t.id === p.teamId;
      const listed = t.memberIds.includes(p.id);
      if (inTeam && !listed) t.memberIds.push(p.id);
      if (!inTeam && listed) t.memberIds = t.memberIds.filter((m) => m !== p.id);
    }
  }

  // --- équipes ----------------------------------------------------------------

  findTeam(id: string): Team | undefined {
    return this.teams.find((t) => t.id === id);
  }

  addTeam(owner: ResourceOwner, input: TeamInput, by: string): Team {
    const now = new Date().toISOString();
    const members = input.memberIds.filter((m) => this.persons.some((p) => p.id === m && sameOwner(p.owner, owner)));
    const t: Team = { ...input, memberIds: [...new Set(members)], id: this.nextId("T", this.teams), owner, createdBy: by, createdAt: now, updatedAt: now };
    if (t.leaderId && !t.memberIds.includes(t.leaderId)) t.memberIds.push(t.leaderId);
    this.teams.push(t);
    this.reassignMembers(t);
    this.persist();
    return t;
  }

  updateTeam(id: string, patch: Partial<TeamInput>): Team | undefined {
    const t = this.teams.find((x) => x.id === id);
    if (!t) return undefined;
    if (patch.memberIds) {
      t.memberIds = [...new Set(patch.memberIds.filter((m) => this.persons.some((p) => p.id === m && sameOwner(p.owner, t.owner))))];
    }
    if (patch.nom !== undefined) t.nom = patch.nom;
    if (patch.mission !== undefined) t.mission = patch.mission;
    if (patch.leaderId !== undefined) {
      t.leaderId = patch.leaderId || undefined;
      if (t.leaderId && !t.memberIds.includes(t.leaderId)) t.memberIds.push(t.leaderId);
    }
    t.updatedAt = new Date().toISOString();
    this.reassignMembers(t);
    this.persist();
    return t;
  }

  removeTeam(id: string): boolean {
    const i = this.teams.findIndex((x) => x.id === id);
    if (i < 0) return false;
    this.teams.splice(i, 1);
    for (const p of this.persons) if (p.teamId === id) delete p.teamId;
    // Les articles du parc affectés à l'équipe (ADR 0027) reviennent au détenteur.
    this.domain.releaseEquipmentOfTeam(id);
    this.persist();
    return true;
  }

  /** L'équipe fait autorité sur l'appartenance de ses membres. */
  private reassignMembers(t: Team): void {
    for (const p of this.persons) {
      if (!sameOwner(p.owner, t.owner)) continue;
      if (t.memberIds.includes(p.id)) p.teamId = t.id;
      else if (p.teamId === t.id) delete p.teamId;
    }
  }

  // --- véhicules --------------------------------------------------------------

  findVehicle(id: string): Vehicle | undefined {
    return this.vehicles.find((v) => v.id === id);
  }

  addVehicle(owner: ResourceOwner, input: VehicleInput, by: string): Vehicle {
    const now = new Date().toISOString();
    const v: Vehicle = { ...input, qty: Math.max(1, input.qty || 1), id: this.nextId("V", this.vehicles), owner, createdBy: by, createdAt: now, updatedAt: now };
    this.vehicles.push(v);
    this.persist();
    return v;
  }

  updateVehicle(id: string, patch: Partial<VehicleInput>): Vehicle | undefined {
    const v = this.vehicles.find((x) => x.id === id);
    if (!v) return undefined;
    for (const [k, val] of Object.entries(patch)) if (val !== undefined) (v as unknown as Record<string, unknown>)[k] = val;
    v.qty = Math.max(1, v.qty || 1);
    v.updatedAt = new Date().toISOString();
    this.persist();
    return v;
  }

  removeVehicle(id: string): boolean {
    const i = this.vehicles.findIndex((x) => x.id === id);
    if (i < 0) return false;
    this.vehicles.splice(i, 1);
    this.persist();
    return true;
  }

  // --- logistique -------------------------------------------------------------

  findSupply(id: string): Supply | undefined {
    return this.supplies.find((s) => s.id === id);
  }

  addSupply(owner: ResourceOwner, input: SupplyInput, by: string): Supply {
    const now = new Date().toISOString();
    const s: Supply = { ...input, id: this.nextId("S", this.supplies), owner, createdBy: by, createdAt: now, updatedAt: now };
    this.supplies.push(s);
    this.persist();
    return s;
  }

  updateSupply(id: string, patch: Partial<SupplyInput>): Supply | undefined {
    const s = this.supplies.find((x) => x.id === id);
    if (!s) return undefined;
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) (s as unknown as Record<string, unknown>)[k] = v;
    s.updatedAt = new Date().toISOString();
    this.persist();
    return s;
  }

  removeSupply(id: string): boolean {
    const i = this.supplies.findIndex((x) => x.id === id);
    if (i < 0) return false;
    this.supplies.splice(i, 1);
    this.persist();
    return true;
  }

  /** Un détenteur disparaît : ses ressources aussi. */
  dropOwner(owner: ResourceOwner): void {
    const keep = <T extends { owner: ResourceOwner }>(list: T[]) => list.filter((x) => !sameOwner(x.owner, owner));
    const before = this.total();
    this.persons = keep(this.persons);
    this.teams = keep(this.teams);
    this.vehicles = keep(this.vehicles);
    this.supplies = keep(this.supplies);
    if (this.total() !== before) this.persist();
  }
}
