import { Injectable } from "@nestjs/common";
import type { Assignments, ResponsibilityKind } from "@/shared/responsibilities";
import type { Role } from "@/shared/permissions";
import { ROLE_TRAITS, type ProfileId } from "@/shared/profiles";
import type { AppMode } from "@/common/app-mode";
import type { Incident, Unit, FieldHospital } from "@/modules/domain/domain.service";
import type { AuthUser } from "@/common/types/auth-user";
import type { ResourceOwner } from "@/modules/domain/resources.types";

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
/**
 * L'unité existe-t-elle sous ce mode de l'application (ADR 0022) ? Une unité
 * porte le mode où elle a été créée et ne se montre que sous lui ; celles
 * d'avant (sans mode) sont réputées classiques — c'est le mode où elles sont
 * nées ; les graines de démonstration se voient des deux côtés. Les hôpitaux,
 * abris et morgues sont communs aux deux modes.
 */
export function unitFitsMode(unit: Pick<Unit, "profile" | "seeded">, profile: ProfileId): boolean {
  if (unit.seeded) return true;
  return (unit.profile ?? "classique") === profile;
}

/**
 * Tout incident déclaré se voit de tous les rôles (décision du 19 septembre
 * 2026) — c'est le défaut. `INCIDENTS_VISIBILITY=scoped` rend le cantonnement
 * par portée (doctrine V-1 : région, opération de déploiement, entité) : la
 * règle reste écrite et éprouvée, une station peut la choisir.
 */
export function incidentsVisibleToAll(): boolean {
  return (process.env.INCIDENTS_VISIBILITY ?? "all").trim().toLowerCase() !== "scoped";
}

/**
 * « Tout le monde doit voir ce qui se passe sur la carte » (décision du 20
 * septembre 2026, ADR 0027) : les unités — et ce qui est posé sur le terrain —
 * se voient de tous les rôles, dans le mode de l'application en service. C'est
 * le défaut ; `UNITS_VISIBILITY=scoped` rend le cantonnement par portée (ADR
 * 0020 : ce qu'on a inscrit, sa région, son opération, son entité) — la règle
 * reste écrite et éprouvée, une station peut la choisir.
 */
export function unitsVisibleToAll(): boolean {
  return (process.env.UNITS_VISIBILITY ?? "all").trim().toLowerCase() !== "scoped";
}

/**
 * L'unité se montre-t-elle à CE compte ? Une unité créée sous un mode de
 * l'application ne se montre que sous lui (ADR 0022) — pour TOUS les rôles, le
 * Super Administrateur compris (décision du 20 septembre 2026, ADR 0027 rév.) :
 * ce qu'il « voit tout », c'est tout le mode en service.
 */
export function unitVisibleTo(unit: Pick<Unit, "profile" | "seeded">, user: Pick<AuthUser, "role" | "profile">): boolean {
  return unitFitsMode(unit, user.profile);
}

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
// Depuis l'ADR 0022, cette table est le trait `visibility` de chaque rôle
// (`profiles.ts`) : « incident » pour tout poste déployé, des deux profils.

/** Les régions (dédoublonnées) de ces entités, si un résolveur est fourni. */
function regionsOf(kind: ResponsibilityKind, ids: readonly string[], regionOf?: RegionOfEntity): string[] {
  if (!regionOf) return [];
  return [...new Set(ids.map((id) => regionOf(kind, id)).filter((r): r is string => !!r))];
}


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
    const visibility = ROLE_TRAITS[role].visibility;
    if (visibility === "global") return { kind: "global" };

    // Le responsable d'abri : SON abri, la région de son abri, et l'opération
    // où il est déployé — avant la règle générale des postes déployables, qui
    // l'aveuglerait sur tout le reste tant qu'on ne l'a pas déployé.
    if (visibility === "entity") {
      const entities = assignments?.shelter ? [assignments.shelter] : [];
      return { kind: "entity", entities, regions: regionsOf("shelter", entities, regionOf), incidentId: assignments?.incident ?? null };
    }

    // Wali et commandant de place d'armes : LEUR région, rien d'autre. La
    // place d'armes couvrait un rayon de 40 km autour d'une ville ; elle suit
    // désormais le découpage administratif, comme le wali.
    if (visibility === "region") {
      return { kind: "region", region: assignments?.region ?? "" };
    }

    if (visibility === "incident") {
      return { kind: "incident", incidentId: assignments?.incident ?? null };
    }

    if (visibility === "entity_multi") {
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
    // Décision du 19 septembre 2026 : UN INCIDENT DÉCLARÉ SE VOIT DE TOUS, quel
    // que soit le rôle — liste, fiche, tableau de bord d'incident. La carte le
    // montrait déjà à tous (ADR 0020) ; la liste suivait la portée du compte,
    // si bien qu'un commandant d'unité non engagé ne trouvait pas l'opération
    // dont on lui parlait. La portée continue de gouverner les unités, les
    // ressources et les comptes — pas les incidents. Le cantonnement par
    // portée reste écrit ci-dessous, pour le jour où une station le voudrait.
    if (incidentsVisibleToAll()) return incidents;
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
   * RESSOURCES (ADR 0019) : « un compte ne voit que les ressources qui le
   * concernent ». La portée du compte dit quels DÉTENTEURS (unités, hôpitaux,
   * abris) il lit :
   *   global   → tous ;
   *   region   → les détenteurs de SA région ;
   *   incident → en opérationnel, les détenteurs engagés sur SON opération
   *              (unités affectées ou intervenantes, hôpitaux intervenants,
   *              abris posés) ; en démonstration et en exercice, tous — on joue
   *              le scénario avec les entités qu'on y crée ;
   *   entity   → SES entités, et celles de l'opération où il est déployé.
   * Le responsable de parc voit en outre l'unité de son parc, déployé ou non.
   * Default-deny : un rôle cantonné sans affectation ne voit rien.
   */
  canSeeResourceOwner(
    scope: VisibilityScope,
    owner: ResourceOwner,
    deps: {
      mode: AppMode;
      /** Unité du parc d'un responsable d'équipement (`assignments.equipment`). */
      parkUnit?: string;
      regionOf: (kind: ResourceOwner["kind"], id: string) => string | undefined;
      /** Détenteurs engagés sur une opération (identifiants d'entités). */
      ownersOnIncident: (incidentId: string) => readonly string[];
      /** Le compte a inscrit ce détenteur (ADR 0020 : une unité qu'on a inscrite se voit). */
      createdByMe?: (owner: ResourceOwner) => boolean;
    },
  ): boolean {
    if (deps.parkUnit && owner.kind === "unit" && owner.id === deps.parkUnit) return true;
    if (deps.createdByMe?.(owner)) return true;
    switch (scope.kind) {
      case "global":
        return true;
      case "region":
        return !!scope.region && deps.regionOf(owner.kind, owner.id) === scope.region;
      case "incident":
        if (deps.mode !== "operational") return true;
        return !!scope.incidentId && deps.ownersOnIncident(scope.incidentId).includes(owner.id);
      case "entity":
        if (scope.entities.includes(owner.id)) return true;
        return !!scope.incidentId && deps.ownersOnIncident(scope.incidentId).includes(owner.id);
    }
  }

  /**
   * Unités visibles (ADR 0020) : « chaque utilisateur ne voit que les unités
   * qu'il a inscrites » — et celles qui le concernent :
   *   - global (administration, stratégique) : toutes ;
   *   - toujours : celles qu'il a inscrites (`createdBy`), la sienne
   *     (commandant d'unité), celle de son parc (responsable d'équipement) ;
   *   - région (wali, place d'armes) : celles de sa région — ils n'inscrivent
   *     pas d'unité mais affectent celles de leur territoire ;
   *   - opération (conduite déployée) : celles affectées ou intervenantes sur
   *     son opération — et, pour qui AFFECTE (l'OPCOM et ses représentants),
   *     le vivier de la région de l'opération, sans quoi il n'aurait rien à
   *     affecter ; le TACOM et les cellules, qui exploitent, ne voient que le
   *     dispositif de l'opération ;
   *   - entité (responsables) : celles engagées sur l'opération où ils sont
   *     déployés, en plus de la leur.
   * Le reste n'existe pas pour lui. Une unité d'avant l'horodatage, sans
   * auteur, ne se voit que par ces autres chemins.
   */
  filterUnits(
    units: Unit[],
    scope: VisibilityScope,
    ctx?: {
      matricule: string;
      assignments?: Assignments;
      regionOf: (id: string) => string | undefined;
      ownersOnIncident: (incidentId: string) => readonly string[];
      /** Le rôle affecte des unités à l'opération (OPCOM et représentants) : il voit le vivier de la région de l'opération. */
      assigns?: boolean;
      regionOfIncident?: (incidentId: string) => string | undefined;
    },
  ): Unit[] {
    // Décision du 20 septembre 2026 (ADR 0027) : les unités se voient de tous.
    if (unitsVisibleToAll()) return units;
    if (scope.kind === "global" || !ctx) return units;
    const me = ctx.matricule.toLowerCase();
    const mine = new Set([ctx.assignments?.unit, ctx.assignments?.equipment].filter((x): x is string => !!x));
    const engaged = new Set<string>();
    const incidentId = scope.kind === "region" ? null : scope.incidentId ?? null;
    if (incidentId) for (const id of ctx.ownersOnIncident(incidentId)) engaged.add(id);
    const pool = incidentId && ctx.assigns ? ctx.regionOfIncident?.(incidentId) : undefined;
    return units.filter((u) => {
      if (u.createdBy?.toLowerCase() === me) return true;
      if (mine.has(u.id)) return true;
      if (scope.kind === "region") return !!scope.region && ctx.regionOf(u.id) === scope.region;
      if (scope.kind === "entity" && scope.entities.includes(u.id)) return true;
      if (engaged.has(u.id)) return true;
      return !!pool && ctx.regionOf(u.id) === pool;
    });
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
