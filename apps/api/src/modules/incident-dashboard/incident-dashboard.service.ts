import { Injectable, NotFoundException } from "@nestjs/common";
import { DomainService, type FeedItem, type Incident, type SubIncident } from "@/modules/domain/domain.service";
import { DeploymentService, type DeployedPost } from "@/modules/domain/deployment.service";
import { MissionService } from "@/modules/missions/application/mission.service";
import type { Role } from "@/shared/permissions";

// ============================================================================
// ARGOS — TABLEAU DE BORD D'UNE OPÉRATION (lot V-3)
//
// Le tableau de bord national répond à « comment va le pays ? ». Sur une
// opération en cours, ce n'est pas la question : on veut savoir ce qui se passe
// ICI, qui est engagé, ce qui est en vol, et ce qui manque.
//
// POURQUOI UN MODULE À PART. Cet agrégat lit le DOMAINE (incident, unités,
// hôpitaux, fil, postes déployés) ET les MISSIONS (les boucles ouvertes). Or
// `MissionsModule` importe déjà `DomainModule` — pour enregistrer sa cascade de
// suppression. Injecter `MissionService` dans le domaine fermerait le cycle.
//
// D'où un module de LECTURE qui dépend des deux et dont personne ne dépend :
// il compose, il n'est composé par rien. C'est aussi ce qui garde l'agrégat
// honnête — il ne peut rien écrire.
//
// CALCULÉ CÔTÉ SERVEUR, comme le tableau de bord national. Deux raisons : les
// chiffres font foi au même endroit pour tout le monde, et surtout la route est
// gardée par `canSeeIncident` — un OPCOM ne doit pas pouvoir ouvrir le tableau
// de bord d'une autre opération en devinant son identifiant. Un agrégat
// reconstruit dans le navigateur n'aurait aucune garde.
// ============================================================================

/** Ce qu'un commandement doit voir en arrivant sur une opération. */
export interface IncidentDashboard {
  incident: Incident;
  casualties: { dead: number; injured: number; missing: number; total: number };
  engagement: {
    units: { id: string; nom: string; eff: number; dispo: string; readiness: number }[];
    hospitals: { id: string; nom: string; lits: number; occ: number; reserved: number; libres: number; saturation: number }[];
    personnel: number;
    ambulances: number;
    helicopteres: number;
  };
  /** Qui conduit l'opération (lot V-2). */
  posts: DeployedPost[];
  missions: {
    total: number;
    open: number;
    byState: Record<string, number>;
    byKind: Record<string, number>;
    latest: { id: string; kind: string; state: string; label: string; issuedAt: string }[];
  };
  subIncidents: SubIncident[];
  /** Le fil de CETTE opération — sur le champ `incidentId`, pas sur le texte. */
  timeline: FeedItem[];
}

const TIMELINE_MAX = 40;
const MISSIONS_LATEST = 6;

@Injectable()
export class IncidentDashboardService {
  constructor(
    private readonly domain: DomainService,
    private readonly deployment: DeploymentService,
    private readonly missions: MissionService,
  ) {}

  async build(incidentId: string, viewer: Role): Promise<IncidentDashboard> {
    const incident = this.domain.listIncidents().find((i) => i.id === incidentId);
    if (!incident) throw new NotFoundException(`Incident inconnu : ${incidentId}`);

    const engagedUnits = incident.responders?.units ?? [];
    const engagedHosps = incident.responders?.hospitals ?? [];
    const units = this.domain.listUnits().filter((u) => engagedUnits.includes(u.id));
    const hospitals = this.domain.listHospitals().filter((h) => engagedHosps.includes(h.id));

    const c = incident.casualties ?? { dead: 0, injured: 0, missing: 0 };

    const all = await this.missions.list({ incidentId });
    const byState: Record<string, number> = {};
    const byKind: Record<string, number> = {};
    for (const m of all) {
      byState[m.state] = (byState[m.state] ?? 0) + 1;
      byKind[m.kind] = (byKind[m.kind] ?? 0) + 1;
    }
    const open = await this.missions.list({ incidentId, openOnly: true });

    return {
      incident,
      casualties: { ...c, total: c.dead + c.injured + c.missing },
      engagement: {
        units: units.map((u) => ({ id: u.id, nom: u.nom, eff: u.eff, dispo: u.dispo, readiness: u.readiness })),
        hospitals: hospitals.map((h) => {
          // Libres = armés − occupés − RÉSERVÉS. Omettre les réservations
          // ferait apparaître disponible un lit qu'une EVASAN acceptée attend
          // déjà (lot P2-b) — deux transferts viseraient le même.
          const reserved = h.reserved ?? 0;
          const libres = Math.max(0, h.lits - h.occ - reserved);
          return {
            id: h.id,
            nom: h.nom,
            lits: h.lits,
            occ: h.occ,
            reserved,
            libres,
            saturation: h.lits > 0 ? Math.round(((h.occ + reserved) / h.lits) * 100) : 0,
          };
        }),
        personnel: units.reduce((n, u) => n + u.eff, 0),
        ambulances: hospitals.reduce((n, h) => n + h.amb, 0),
        helicopteres: hospitals.reduce((n, h) => n + h.heli, 0),
      },
      posts: this.deployment.listDeployed(incidentId, viewer),
      missions: {
        total: all.length,
        open: open.length,
        byState,
        byKind,
        latest: all.slice(0, MISSIONS_LATEST).map((m) => ({
          id: m.id,
          kind: m.kind,
          state: m.state,
          label: m.label,
          issuedAt: m.issuedAt,
        })),
      },
      subIncidents: incident.subIncidents ?? [],
      timeline: this.domain.listFeed().filter((f) => f.incidentId === incidentId).slice(0, TIMELINE_MAX),
    };
  }
}
