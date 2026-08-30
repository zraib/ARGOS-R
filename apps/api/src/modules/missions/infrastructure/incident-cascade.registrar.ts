// ============================================================================
// ARGOS — inscription de la cascade « incident supprimé » (lot G2)
//
// POURQUOI CE FICHIER EXISTE
// Supprimer un incident doit annuler puis purger ses boucles. Mais le module
// `missions` importe déjà `domain` : un appel direct de domain vers missions
// créerait un cycle, et `forwardRef` ne ferait que le masquer.
//
// L'inversion est donc franche : le domaine expose un point d'accroche
// (`registerIncidentCascade`), et c'est le module DÉPENDANT qui vient s'y
// inscrire au démarrage. Le domaine continue d'ignorer ce qu'est une mission ;
// aucun cycle n'est créé.
// ============================================================================

import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { DomainService } from "@/modules/domain/domain.service";
import { MissionService } from "@/modules/missions/application/mission.service";

@Injectable()
export class IncidentCascadeRegistrar implements OnModuleInit {
  private readonly logger = new Logger("MissionCascade");

  constructor(
    private readonly domain: DomainService,
    private readonly missions: MissionService,
  ) {}

  onModuleInit(): void {
    this.domain.registerIncidentCascade(async (incidentId) => {
      // Annuler AVANT de purger : l'annulation trace le motif dans le fil et
      // dans le canal, la purge ne laisserait rien. On veut savoir POURQUOI
      // des boucles ont disparu.
      const cancelled = await this.missions.cancelAllForIncident(
        incidentId,
        "Incident supprimé",
        "système",
      );
      const purged = await this.missions.purgeIncident(incidentId);
      this.logger.log(`${incidentId} : ${cancelled} boucle(s) annulée(s), ${purged} purgée(s).`);
    });
  }
}
