import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { DomainService } from "@/modules/domain/domain.service";
import { UsersService } from "@/modules/iam/users.service";
import { isDeployableRole } from "@/shared/responsibilities";
import { ROLE_LABELS, type Role } from "@/shared/permissions";
import type { ManagedUserPublic } from "@/modules/iam/users.service";

// ============================================================================
// ARGOS — DÉPLOIEMENT D'UN POSTE SUR UNE OPÉRATION (lot V-2)
//
// Le lot V-1 a posé la doctrine : un OPCOM ne voit que l'incident sur lequel il
// est déployé. Mais « être déployé » se réduisait alors à un champ modifiable
// par un `PATCH /iam/users/:id` — un geste d'ADMINISTRATION, noyé au milieu du
// grade et du téléphone.
//
// Or ce champ décide de ce qu'un officier voit. Le poser est un ACTE DE
// COMMANDEMENT : il a un auteur, une date, une opération, et il retire
// l'officier de celle qu'il servait. Ce service en fait un geste distinct,
// tracé au fil et au journal d'audit, et il en tient les règles :
//
//   • on ne déploie que sur une opération OUVERTE — armer un incident clos
//     n'engage personne ;
//   • on ne déploie que des POSTES DÉPLOYABLES — un responsable d'hôpital sert
//     plusieurs opérations à la fois, l'y cantonner l'aveuglerait sur les
//     autres ;
//   • UN SEUL incident à la fois — redéployer retire de l'opération précédente,
//     et ce retrait est écrit noir sur blanc plutôt que subi.
//
// Le contrôle d'accès n'est PAS ici : il vit sur la route (`incidents:update`
// et visibilité de l'incident). Ce service tient les règles du métier ; la
// question « cet appelant a-t-il le droit ? » est tranchée avant lui.
// ============================================================================

/** Un poste occupé sur une opération. */
export interface DeployedPost {
  matricule: string;
  nom: string;
  grade?: string;
  roles: string[];
  online: boolean;
}

/** Ce qu'un déploiement a effectivement changé. */
export interface DeploymentChange {
  matricule: string;
  incidentId: string;
  /** Opération quittée, si le compte en servait déjà une. */
  previousIncidentId: string | null;
  /** `false` quand le compte était déjà sur cette opération (geste sans effet). */
  changed: boolean;
}

function toPost(u: ManagedUserPublic): DeployedPost {
  return {
    matricule: u.matricule,
    nom: [u.grade, u.nom].filter(Boolean).join(" ") || u.matricule,
    grade: u.grade,
    roles: [...u.roles],
    online: u.online,
  };
}

@Injectable()
export class DeploymentService {
  constructor(
    private readonly domain: DomainService,
    private readonly users: UsersService,
  ) {
    // Un incident supprimé emporte ses déploiements. Sans ce retrait, les
    // comptes resteraient affectés à un identifiant fantôme : leur portée
    // resterait « incident », l'incident n'existerait plus, et ils ne verraient
    // plus jamais rien — un compte mort sans message d'erreur.
    this.domain.registerIncidentCascade(async (incidentId) => {
      this.withdrawAll(incidentId, "cascade:suppression");
    });
  }

  /** Postes actuellement déployés sur cette opération, tels que `viewer` peut les voir. */
  listDeployed(incidentId: string, viewer: Role): DeployedPost[] {
    this.requireIncident(incidentId);
    return this.users.listDeployedOn(incidentId, viewer).map(toPost);
  }

  /**
   * Comptes qu'on PEUT déployer, avec leur affectation courante — pour que le
   * commandement voie, avant de cliquer, qui il s'apprête à retirer d'ailleurs.
   */
  listDeployable(viewer: Role): (DeployedPost & { currentIncidentId: string | null })[] {
    return this.users.listDeployable(viewer).map((u) => ({
      ...toPost(u),
      currentIncidentId: u.assignments?.incident ?? null,
    }));
  }

  /** Déploie un compte sur une opération. Remplace son affectation précédente. */
  deploy(incidentId: string, matricule: string, actor: string): DeploymentChange {
    const inc = this.requireIncident(incidentId);
    if (inc.archived || inc.st === "closed") {
      throw new ConflictException(
        `L'opération ${incidentId} est close ou archivée : on n'y déploie plus de poste.`,
      );
    }

    // Lu en portée superadmin : le SERVICE doit connaître tout le registre pour
    // trancher « poste déployable ou non ». Ce que l'appelant a le droit de
    // VOIR est une autre question, tranchée par les listes ci-dessus.
    const target = this.users.listDeployable().find((u) => u.matricule === matricule);
    if (!target) {
      // Distinguer les deux causes : le compte n'existe pas, ou son rôle n'est
      // pas déployable. Un message unique ferait chercher au mauvais endroit.
      const exists = this.users.list("superadmin").some((u) => u.matricule === matricule);
      if (!exists) throw new NotFoundException(`Compte inconnu : ${matricule}`);
      throw new BadRequestException(
        `${matricule} n'occupe pas un poste déployable. Les responsables d'hôpital, d'unité et de morgue ` +
          `servent plusieurs opérations à la fois : les cantonner à une seule les priverait des autres.`,
      );
    }

    if (target.assignments?.incident === incidentId) {
      return { matricule, incidentId, previousIncidentId: incidentId, changed: false };
    }

    const { previous } = this.users.setDeployment(matricule, incidentId);
    const who = toPost(target).nom;
    const roles = target.roles.map((r) => ROLE_LABELS[r as Role] ?? r).join(", ");
    this.domain.pushFeed(
      previous
        ? `${who} (${roles}) redéployé de ${previous} vers ${incidentId} — par ${actor}`
        : `${who} (${roles}) déployé sur ${incidentId} — par ${actor}`,
      "bg-or-500",
      incidentId,
    );
    return { matricule, incidentId, previousIncidentId: previous, changed: true };
  }

  /** Retire un compte de l'opération. */
  withdraw(incidentId: string, matricule: string, actor: string): DeploymentChange {
    this.requireIncident(incidentId);
    const target = this.users.list("superadmin").find((u) => u.matricule === matricule);
    if (!target) throw new NotFoundException(`Compte inconnu : ${matricule}`);
    if (target.assignments?.incident !== incidentId) {
      throw new ConflictException(`${matricule} n'est pas déployé sur ${incidentId}.`);
    }

    this.users.setDeployment(matricule, null);
    this.domain.pushFeed(`${toPost(target).nom} retiré de ${incidentId} — par ${actor}`, "bg-rdia-500", incidentId);
    return { matricule, incidentId, previousIncidentId: incidentId, changed: true };
  }

  /**
   * Retire TOUS les postes d'une opération. Appelé par la cascade de suppression.
   * Ne pousse rien au fil : l'incident lui-même y écrit déjà sa disparition, et
   * une ligne par officier noierait le message.
   */
  withdrawAll(incidentId: string, _actor: string): number {
    const deployed = this.users.listDeployedOn(incidentId);
    for (const u of deployed) this.users.setDeployment(u.matricule, null);
    return deployed.length;
  }

  private requireIncident(id: string) {
    const inc = this.domain.listIncidents().find((i) => i.id === id);
    if (!inc) throw new NotFoundException(`Incident inconnu : ${id}`);
    return inc;
  }
}

export { isDeployableRole };
