// ============================================================================
// ARGOS — adaptateur d'identifiants : séquence « M-0007 ».
//
// Le numéro suit le dépôt (et non un compteur en mémoire) : après un
// redémarrage, la séquence reprend là où elle s'était arrêtée au lieu de
// réattribuer des identifiants déjà émis.
// ============================================================================

import { Inject, Injectable } from "@nestjs/common";
import type { MissionIdGenerator } from "@/modules/missions/ports/mission-id.port";
import { MISSION_REPOSITORY, type MissionRepository } from "@/modules/missions/ports/mission-repository.port";

@Injectable()
export class SequentialMissionIdGenerator implements MissionIdGenerator {
  constructor(@Inject(MISSION_REPOSITORY) private readonly repo: MissionRepository) {}

  async next(): Promise<string> {
    const last = await this.repo.lastSequence();
    return `M-${String(last + 1).padStart(4, "0")}`;
  }
}
