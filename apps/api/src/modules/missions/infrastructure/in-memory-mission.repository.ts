// ============================================================================
// ARGOS — adaptateur de persistance : mémoire (+ instantané disque en dev)
//
// Implémente `MissionRepository`. Module de BAS niveau : il dépend de
// l'abstraction définie par le métier, jamais l'inverse. Le service ne connaît
// pas ce fichier et ne l'importe nulle part.
//
// Aucun jeu de démonstration : une mission naît d'un geste réel (un
// engagement, une demande, un transfert). En semer serait afficher des boucles
// que personne n'a ouvertes.
// ============================================================================

import { Injectable } from "@nestjs/common";
import { loadDevState, saveDevState } from "@/common/dev-store";
import type { MissionSnapshot } from "@/modules/missions/domain/mission";
import type { MissionQuery, MissionRepository } from "@/modules/missions/ports/mission-repository.port";

const OPEN_STATES = new Set(["issued", "accepted", "in_progress"]);

@Injectable()
export class InMemoryMissionRepository implements MissionRepository {
  private missions: MissionSnapshot[];

  constructor() {
    this.missions = loadDevState<MissionSnapshot[]>("missions", []);
  }

  async findById(id: string): Promise<MissionSnapshot | null> {
    return this.missions.find((m) => m.id === id) ?? null;
  }

  async findAll(query: MissionQuery = {}): Promise<MissionSnapshot[]> {
    return this.missions
      .filter((m) => {
        if (query.incidentId && m.incidentId !== query.incidentId) return false;
        if (query.kind && m.kind !== query.kind) return false;
        if (query.state && m.state !== query.state) return false;
        if (query.toEntity && m.to.entity !== query.toEntity) return false;
        if (query.fromEntity && m.from.entity !== query.fromEntity) return false;
        if (query.toRole && m.to.role !== query.toRole) return false;
        if (query.openOnly && !OPEN_STATES.has(m.state)) return false;
        return true;
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async lastSequence(): Promise<number> {
    return this.missions.reduce((max, m) => {
      const n = Number.parseInt(m.id.replace(/^M-/, ""), 10);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
  }

  async save(mission: MissionSnapshot): Promise<void> {
    const i = this.missions.findIndex((m) => m.id === mission.id);
    if (i >= 0) this.missions[i] = mission;
    else this.missions.unshift(mission);
    this.persist();
  }

  async removeByIncident(incidentId: string): Promise<number> {
    const before = this.missions.length;
    this.missions = this.missions.filter((m) => m.incidentId !== incidentId);
    this.persist();
    return before - this.missions.length;
  }

  private persist(): void {
    saveDevState("missions", this.missions);
  }
}
