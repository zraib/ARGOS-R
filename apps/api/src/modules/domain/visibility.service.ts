import { Injectable } from "@nestjs/common";
import { DEPLOYABLE_ROLES, type Assignments, type ResponsibilityKind } from "@/shared/responsibilities";
import type { Role } from "@/shared/permissions";
import type { Incident, Unit, FieldHospital } from "@/modules/domain/domain.service";

// ============================================================================
// ARGOS — DOCTRINE DE VISIBILITÉ : qui voit quoi (lot V-1)
//
// Le RBAC dit « ce rôle peut-il lire les incidents ? ». Il ne dit pas
// « LESQUELS ». Jusqu'ici la réponse était « tous », pour tout le monde : un
// wali voyait les opérations de l'autre bout du pays, un OPCOM déployé sur un
// séisme voyait les crues d'une autre région. Ce fichier répond à la question
// manquante, et il est le SEUL à y répondre — un filtrage dispersé dans les
// contrôleurs finirait par diverger d'une route à l'autre.
//
// CINQ PORTÉES, une par doctrine de commandement :
//
//   global    — admin, superadmin, strategic : le pays entier. Le rôle
//               stratégique a besoin de la vue d'ensemble, c'est sa fonction.
//   region    — wali : les incidents de SA région administrative. Décision
//               produit : SEULS les incidents sont filtrés ; le réseau
//               hospitalier et les unités restent visibles au national, pour
//               qu'il puisse demander des renforts extérieurs.
//   zone      — place d'armes : ce qu'elle peut atteindre — incidents, unités
//               et hôpitaux de campagne dans un rayon autour de sa ville. Une
//               zone de compétence n'est pas une frontière administrative.
//   incident  — conduite déployée (OPCOM, TACOM, cellules, resp. abri et
//               équipement) : l'opération sur laquelle elle est affectée, et
//               elle seule. Un seul incident à la fois.
//   entity    — responsables hôpital / unité / morgue : ils servent PLUSIEURS
//               incidents à la fois. Leur périmètre est donc l'ensemble des
//               incidents où leur entité est engagée — par les intervenants
//               déclarés ou par une boucle qui les vise.
//
// FILTRER N'EST PAS SÉCURISER À SOI SEUL : ce service est appelé côté serveur,
// dans les contrôleurs de lecture. Le frontend n'a rien à filtrer — il reçoit
// déjà ce à quoi il a droit. C'est ce qui évite qu'un oubli d'écran ne devienne
// une fuite.
// ============================================================================

/** Portée effective d'un compte. */
export type VisibilityScope =
  | { kind: "global" }
  | { kind: "region"; region: string }
  | { kind: "incident"; incidentId: string | null }
  | {
      kind: "entity";
      entities: string[];
      /** Régions des entités : un responsable voit aussi ce qui se déclare dans la région de son établissement. */
      regions: string[];
      /** Opération sur laquelle le compte est déployé (responsable d'abri) — visible aussi. */
      incidentId?: string | null;
    };

/** Résout la région d'une entité affectée — fourni par le domaine, que la doctrine ne connaît pas. */
export type RegionOfEntity = (kind: ResponsibilityKind, id: string) => string | undefined;

/** Rôles qui voient tout — leur fonction l'exige. */
const GLOBAL_ROLES: readonly Role[] = ["superadmin", "admin", "strategic"];

/**
 * Rôles de conduite cantonnés à l'incident sur lequel ils sont déployés.
 * Le responsable d'abri et celui du parc en font partie : contrairement à
 * l'hôpital ou l'unité, ils servent une opération à la fois.
 *
 * La liste n'est pas écrite ici mais DÉRIVÉE de `ROLE_SCOPE_KEY` : c'est la même
 * table qui autorise l'affectation d'un incident (lot V-1) et qui décide du
 * déploiement (V-2). Deux listes parallèles auraient fini par diverger, et un
 * rôle déployable oublié ici aurait vu TOUS les incidents.
 */
const DEPLOYED_ROLES = DEPLOYABLE_ROLES;

/** Les régions (dédoublonnées) de ces entités, si un résolveur est fourni. */
function regionsOf(kind: ResponsibilityKind, ids: readonly string[], regionOf?: RegionOfEntity): string[] {
  if (!regionOf) return [];
  return [...new Set(ids.map((id) => regionOf(kind, id)).filter((r): r is string => !!r))];
}

/** Rôles dont le périmètre est l'ensemble des incidents où leur entité sert. */
const MULTI_INCIDENT_ROLES: readonly Role[] = ["resp_hospital", "resp_unit", "resp_morgue"];

@Injectable()
export class VisibilityService {
  /**
   * Portée d'un compte, depuis son rôle et ses affectations.
   *
   * DEFAULT-DENY : un rôle cantonné SANS affectation ne voit rien. Un wali
   * sans région, un OPCOM non déployé : liste vide. Le silence d'une
   * affectation ne vaut pas permission — c'est ce qui rend l'oubli
   * administratif visible plutôt que dangereux.
   */
  scopeOf(role: Role, assignments: Assignments | undefined, regionOf?: RegionOfEntity): VisibilityScope {
    if (GLOBAL_ROLES.includes(role)) return { kind: "global" };

    // Le responsable d'abri : SON abri, la région de son abri, et l'opération
    // où il est déployé — avant la règle générale des postes déployables, qui
    // l'aveuglerait sur tout le reste tant qu'on ne l'a pas déployé.
    if (role === "resp_shelter") {
      const entities = assignments?.shelter ? [assignments.shelter] : [];
      return { kind: "entity", entities, regions: regionsOf("shelter", entities, regionOf), incidentId: assignments?.incident ?? null };
    }

    // Wali et commandant de place d'armes : LEUR région, rien d'autre. La
    // place d'armes couvrait un rayon de 40 km autour d'une ville ; elle suit
    // désormais le découpage administratif, comme le wali.
    if (role === "wali" || role === "place_arme") {
      return { kind: "region", region: assignments?.region ?? "" };
    }

    if (DEPLOYED_ROLES.includes(role)) {
      return { kind: "incident", incidentId: assignments?.incident ?? null };
    }

    if (MULTI_INCIDENT_ROLES.includes(role)) {
      const parKind: [ResponsibilityKind, string | undefined][] = [
        ["hospital", assignments?.hospital],
        ["unit", assignments?.unit],
        ["morgue", assignments?.morgue],
      ];
      const entities = parKind.map(([, id]) => id).filter((x): x is string => !!x);
      const regions = [...new Set(parKind.flatMap(([kind, id]) => (id ? regionsOf(kind, [id], regionOf) : [])))];
      return { kind: "entity", entities, regions };
    }

    // Rôle inconnu de la doctrine : rien. Ajouter un rôle sans le classer ici
    // le prive d'accès plutôt que de lui en ouvrir un par inadvertance.
    return { kind: "entity", entities: [], regions: [] };
  }

  /** Portée d'un compte, depuis son rôle et ses affectations (même chemin pour tous les contrôleurs). */
  scopeOfUser(role: Role, assignments: Assignments | undefined, regionOf?: RegionOfEntity): VisibilityScope {
    return this.scopeOf(role, assignments, regionOf);
  }

  /**
   * Incidents visibles.
   *
   * `entitiesOnIncident` fournit, pour un incident, les entités qui y servent —
   * intervenants déclarés ET destinataires de boucles ouvertes. Le service ne
   * connaît pas les missions : il reçoit cette réponse, ce qui évite au domaine
   * de dépendre du module missions.
   */
  filterIncidents(
    incidents: Incident[],
    scope: VisibilityScope,
    entitiesOnIncident: (incidentId: string) => string[],
  ): Incident[] {
    switch (scope.kind) {
      case "global":
        return incidents;
      case "region":
        return scope.region ? incidents.filter((i) => i.region === scope.region) : [];
      case "incident":
        return scope.incidentId ? incidents.filter((i) => i.id === scope.incidentId) : [];
      case "entity": {
        // Ce qui le concerne : les opérations où son entité sert, celles de
        // la région de son entité, et celle où il est déployé. Rien de tout
        // cela → rien (default-deny).
        if (scope.entities.length === 0 && scope.regions.length === 0 && !scope.incidentId) return [];
        return incidents.filter((i) => {
          if (scope.incidentId && i.id === scope.incidentId) return true;
          if (scope.regions.includes(i.region)) return true;
          if (scope.entities.length === 0) return false;
          const serving = entitiesOnIncident(i.id);
          return scope.entities.some((e) => serving.includes(e));
        });
      }
    }
  }

  /**
   * Un incident précis est-il visible ? Sert à garder le dashboard d'incident
   * (lot V-3) : un OPCOM ne doit pas pouvoir ouvrir celui d'une autre opération
   * en devinant son identifiant.
   */
  canSeeIncident(
    incident: Incident,
    scope: VisibilityScope,
    entitiesOnIncident: (incidentId: string) => string[],
  ): boolean {
    return this.filterIncidents([incident], scope, entitiesOnIncident).length > 0;
  }

  /**
   * Unités visibles : TOUTES, quelle que soit la portée. Le wali et la place
   * d'armes gardent la vue nationale des moyens (décision produit), et la
   * conduite déployée a besoin de voir les unités engageables sur son
   * opération. Une unité n'est pas un secret ; un incident, si.
   */
  filterUnits(units: Unit[], _scope: VisibilityScope): Unit[] {
    return units;
  }

  /**
   * Hôpitaux de campagne : PAS de filtrage de zone à ce stade.
   *
   * Le modèle API de `FieldHospital` ne porte aucune coordonnée (seulement
   * `hid`, `nom`, capacité, statut) : il n'y a rien à comparer à un rayon.
   * Leur géolocalisation est reconstruite côté carte à partir d'autres
   * données. Plutôt que d'inventer une position pour faire semblant de
   * filtrer, on laisse passer et on le dit — un filtre approximatif sur une
   * plateforme de commandement serait pire que pas de filtre du tout.
   *
   * À traiter quand `FieldHospital` portera `ll`, comme les unités.
   */
  filterFieldHospitals(field: FieldHospital[], _scope: VisibilityScope): FieldHospital[] {
    return field;
  }
}
