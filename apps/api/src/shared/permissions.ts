// ============================================================================
// ARGOS — catalogue de permissions et rôles (RBAC)
//
// Source de vérité : `docs/MATRICE ROLES.xlsx`. Une permission est un couple
// `fonctionnalité:action` ; les attributions par rôle sont la TRANSCRIPTION
// LITTÉRALE de la matrice (voir MATRIX ci-dessous).
//
// Notation de la matrice :
//   V  = visualiser      A  = ajouter
//   M  = modifier        Ar = archiver
//   cellule vide = aucun droit sur cette fonctionnalité (default-deny)
//
// SUPPRESSION : personne ne supprime, sauf le Super Administrateur. Les rôles
// ne disposent au mieux que d'`archive` ; l'action `delete` n'est accordée
// qu'via le joker `*` du superadmin. Voir docs/04-securite.md.
// ============================================================================

/** Actions possibles sur une fonctionnalité. */
export const ACTIONS = ["view", "create", "update", "archive", "delete"] as const;
export type Action = (typeof ACTIONS)[number];

/**
 * Fonctionnalités de la matrice (21). Les clés sont en anglais (convention du
 * dépôt) ; les libellés français correspondent aux lignes du tableur.
 */
export const MATRIX_FEATURES = [
  "dashboard",      // Tableau de bord général
  "dash_incident",  // Tableau de Bord Incident
  "dash_hospital",  // Tableau de Bord Hôpital
  "dash_shelter",   // Tableau de Bord Abri
  "dash_morgue",    // Tableau de Bord Morgue
  "dash_unit",      // Tableau de bord Unité
  "map",            // Carte
  "incidents",      // Incident
  "subincidents",   // Sous-incidents
  "victims",        // Bilan des victimes (décédés, blessés, disparus)
  "hospinet",       // Hospinet
  "shelters",       // Abri
  "morgue",         // Morgue
  "units",          // Unité (l'entité dont un responsable a la charge)
  "equipment",      // Gestion Équipement
  "teams",          // Unités / Équipes (annuaire)
  "comms",          // Centre de communication
  "reports",        // Rapports d'incidents
  "analytics",      // Analytique
  "assistant",      // Assistant IA
  "users",          // Gestion des utilisateurs
  "settings",       // Paramètres
] as const;

/**
 * Modules de l'application ABSENTS de la matrice. Leurs dotations sont celles
 * d'avant la matrice, conservées telles quelles pour ne rien casser — À
 * ARBITRER : soit les ajouter au tableur, soit les fermer (default-deny).
 */
export const LEGACY_FEATURES = [
  "dispatch",   // Répartiteur
  "triage",     // Triage de masse
  "ics",        // Formulaires ICS
  "damage",     // Évaluation des dommages
  "orsec",      // Tableau ORSEC
  "plans",      // Plans
  "personnel",  // Roster du personnel
  "workorders", // Bons de travail
  "seismic",    // Sismologie / météo
  "audit",      // Journal d'audit
  "aviation",   // Suivi aérien (feux de forêt) — absent de la matrice, à arbitrer
  "nrbc",       // Capacité NRBC (panache chimique) — absent de la matrice, à arbitrer
  "missions",   // Boucles opérationnelles (ordres, demandes, transferts) — à arbitrer
  "tracking",   // Traceurs GPS FMC920 (lot N-2) — absent de la matrice, à arbitrer
  "comms_admin", // Administration des canaux (lot COMMS) — absent de la matrice, à arbitrer
  // Mode édition de la carte (lot #12) : poser, déplacer et retirer les postes
  // d'une opération. AUCUNE ligne dans la matrice, à dessein : seul le joker du
  // Super Administrateur l'accorde — l'Administrateur ne l'hérite pas.
  "map_edit",
] as const;

export const FEATURES = [...MATRIX_FEATURES, ...LEGACY_FEATURES] as const;
export type Feature = (typeof FEATURES)[number];

/** Libellés français des fonctionnalités (interface d'administration). */
export const FEATURE_LABELS: Record<Feature, string> = {
  dashboard: "Tableau de bord général",
  dash_incident: "Tableau de bord Incident",
  dash_hospital: "Tableau de bord Hôpital",
  dash_shelter: "Tableau de bord Abri",
  dash_morgue: "Tableau de bord Morgue",
  dash_unit: "Tableau de bord Unité",
  map: "Carte",
  incidents: "Incident",
  subincidents: "Sous-incidents",
  victims: "Bilan des victimes",
  hospinet: "Hospinet",
  shelters: "Abri",
  morgue: "Morgue",
  units: "Unité",
  equipment: "Gestion Équipement",
  teams: "Unités / Équipes",
  comms: "Centre de communication",
  reports: "Rapports d'incidents",
  analytics: "Analytique",
  assistant: "Assistant IA",
  users: "Gestion des utilisateurs",
  settings: "Paramètres",
  dispatch: "Répartiteur",
  triage: "Triage de masse",
  ics: "Formulaires ICS",
  damage: "Évaluation des dommages",
  orsec: "Tableau ORSEC",
  plans: "Plans",
  personnel: "Personnel",
  workorders: "Bons de travail",
  seismic: "Sismologie & météo",
  audit: "Journal d'audit",
  aviation: "Suivi aérien",
  nrbc: "NRBC",
  missions: "Missions (boucles opérationnelles)",
  tracking: "Traceurs GPS (FMC920)",
  comms_admin: "Administration des canaux",
  map_edit: "Édition de la carte (postes d'opération)",
};

export type Permission = `${Feature}:${Action}`;

/** Toutes les permissions existantes (produit fonctionnalités × actions). */
export const PERMISSIONS: Permission[] = FEATURES.flatMap((f) =>
  ACTIONS.map((a) => `${f}:${a}` as Permission),
);

// ---------------------------------------------------------------------------
// Rôles
// ---------------------------------------------------------------------------

export const ROLES = [
  "superadmin",
  "admin",
  "strategic",
  "place_arme",
  "wali",
  "opcom",
  "tacom",
  "bluecell",
  "greencell",
  "orangecell",
  "resp_hospital",
  "resp_shelter",
  "resp_morgue",
  "resp_unit",
  "resp_equipment",
] as const;

export type Role = (typeof ROLES)[number];

/** Anciens rôles → rôle de reprise, pour migrer les comptes déjà persistés. */
export const LEGACY_ROLE_MAP: Record<string, Role> = {
  auditor: "strategic",
  command: "tacom",
  dispatcher: "bluecell",
  unit_commander: "resp_unit",
  field_agent: "resp_unit",
};

/** Libellés français des rôles (colonnes de la matrice). */
export const ROLE_LABELS: Record<Role, string> = {
  superadmin: "Super Administrateur",
  admin: "Administrateur",
  strategic: "Utilisateur Stratégique",
  place_arme: "Place d'Armes",
  wali: "Wali / Gouverneur",
  opcom: "OPCOM",
  tacom: "TACOM",
  bluecell: "Cellule Bleue — Opérations",
  greencell: "Cellule Verte — Logistique",
  orangecell: "Cellule Orange — Sécurité",
  resp_hospital: "Responsable Hôpital",
  resp_shelter: "Responsable Abri",
  resp_morgue: "Responsable Morgue",
  resp_unit: "Responsable Unité",
  resp_equipment: "Responsable Équipement",
};

// ---------------------------------------------------------------------------
// Transcription de la matrice
// ---------------------------------------------------------------------------

/** Codes de cellule : V=visualiser, A=ajouter, M=modifier, R=archiver (Ar). */
type Cell = string;

const V = "V", VM = "VM", AMV = "AMV", ALL = "AMRV";

/**
 * `docs/MATRICE ROLES.xlsx`, ligne par ligne. Un rôle absent d'une ligne n'a
 * AUCUN droit sur la fonctionnalité — c'est une cellule vide du tableur.
 * Le Super Administrateur n'y figure pas : il détient tout (`*`).
 */
const MATRIX: Record<(typeof MATRIX_FEATURES)[number], Partial<Record<Role, Cell>>> = {
  dashboard: { admin: ALL, strategic: V },
  dash_incident: {
    admin: ALL, strategic: V, place_arme: V, wali: V, opcom: V, tacom: V,
    bluecell: V, greencell: V, orangecell: V, resp_shelter: V, resp_morgue: V,
    // V-3 : les responsables d'HÔPITAL et d'UNITÉ manquaient à cette ligne alors
    // qu'ils servent PLUSIEURS opérations à la fois — la portée `entity` de la
    // doctrine V-1 est faite pour eux. Sans ces deux cellules, un responsable
    // d'hôpital voyait ses incidents dans la liste mais recevait 403 en ouvrant
    // le tableau de bord de l'un d'eux. La portée reste appliquée : il n'ouvre
    // que les opérations où SON établissement sert.
    resp_hospital: V, resp_unit: V,
  },
  dash_hospital: {
    admin: ALL, strategic: V, place_arme: V, wali: V, opcom: V, tacom: V,
    bluecell: V, greencell: V, orangecell: V, resp_hospital: V,
  },
  dash_shelter: {
    admin: ALL, strategic: V, place_arme: V, wali: V, opcom: V, tacom: V,
    bluecell: V, greencell: V, orangecell: V, resp_shelter: V,
  },
  dash_morgue: {
    admin: ALL, strategic: V, place_arme: V, wali: V, opcom: V, tacom: V,
    bluecell: V, greencell: V, orangecell: V, resp_hospital: V, resp_morgue: V,
  },
  dash_unit: {
    admin: ALL, strategic: V, place_arme: V, wali: V, opcom: V, tacom: V,
    bluecell: V, greencell: V, orangecell: V, resp_unit: V,
  },
  // Lecture étendue à `resp_morgue` et `resp_equipment` (ADR 0015) : sur une
  // station en service, ce qu'un responsable déploie doit lui apparaître sur la
  // carte — un site mortuaire ou un parc sans carte n'est pas exploitable.
  map: {
    admin: ALL, strategic: V, place_arme: V, wali: V, opcom: V, tacom: V,
    bluecell: V, greencell: V, orangecell: V,
    resp_hospital: V, resp_shelter: V, resp_unit: V, resp_morgue: V, resp_equipment: V,
  },
  // Lecture élargie au lot V-1 : `strategic`, `wali` et `place_arme` étaient
  // ABSENTS de cette ligne — ils recevaient donc 403 sur la liste des incidents,
  // ce qui rendait la doctrine de visibilité inatteignable. La permission dit
  // seulement « peut lire des incidents » ; LESQUELS reste l'affaire du
  // `VisibilityService` (région pour le wali, zone de 40 km pour la place
  // d'armes, tout le pays pour le stratégique). Aucun ne reçoit `M`, `A` ni `R` :
  // ces trois rôles observent, ils ne conduisent pas.
  incidents: {
    admin: ALL, opcom: ALL, tacom: VM,
    bluecell: V, greencell: V, orangecell: V, resp_hospital: V,
    strategic: V, wali: V, place_arme: V,
  },
  subincidents: {
    admin: ALL, opcom: ALL, tacom: ALL, bluecell: AMV, greencell: V, orangecell: V,
  },
  // Le bilan des victimes s'affine par ceux qui sont sur place — cellules
  // opérations et logistique, responsables d'unité et d'hôpital — ; la morgue
  // et les autorités le lisent.
  victims: {
    admin: ALL, opcom: ALL, tacom: ALL, bluecell: AMV, greencell: AMV, orangecell: V,
    resp_unit: AMV, resp_hospital: AMV, resp_morgue: V,
    strategic: V, wali: V, place_arme: V,
  },
  hospinet: {
    admin: ALL, opcom: V, tacom: V, bluecell: V, greencell: AMV, orangecell: V,
    resp_hospital: AMV,
    // V-1 : le stratégique suit le réseau hospitalier par fonction ; le wali
    // doit pouvoir demander des renforts HORS de sa région, donc il voit le
    // réseau entier ; la place d'armes ne voit que sa zone (filtrée en aval).
    strategic: V, wali: V, place_arme: V,
  },
  // V-1 : « situation et déploiement des abris » relève de la vue d'ensemble
  // demandée au rôle stratégique.
  shelters: { admin: ALL, opcom: V, tacom: V, resp_shelter: AMV, strategic: V },
  // Service morgue : la vue d'ensemble revient au stratégique et aux autorités
  // de région ; le responsable d'hôpital voit les sites pour y adresser un
  // décès (l'annonce elle-même passe par SA route hospinet).
  morgue: {
    admin: ALL, strategic: V, wali: V, place_arme: V, opcom: V, tacom: V, bluecell: V, greencell: V, orangecell: V,
    resp_morgue: AMV, resp_hospital: V,
  },
  units: {
    admin: ALL, opcom: V, tacom: V, bluecell: V, greencell: V, orangecell: V,
    resp_unit: AMV,
    // V-1 : « niveau de disponibilité et déploiement des unités » pour le
    // stratégique ; pour le wali et la place d'armes, l'état des moyens
    // engageables sur leur territoire.
    strategic: V, wali: V, place_arme: V,
  },
  equipment: {
    admin: ALL, opcom: V, tacom: V, bluecell: V, greencell: V, orangecell: V,
    resp_unit: V, resp_equipment: AMV,
    // V-1 : « les moyens déployés de sa zone de compétence » — spécification
    // explicite de la place d'armes.
    place_arme: V,
  },
  teams: {
    admin: ALL, opcom: V, tacom: V, bluecell: V, greencell: V, orangecell: V,
    resp_unit: V,
    // V-1 : c'est CETTE ligne qui garde `GET /units` (et non `units:`, qui
    // gouverne la page de gestion). Sans elle, le filtrage de zone de la place
    // d'armes n'aurait jamais été atteint — la requête échouait avant.
    strategic: V, wali: V, place_arme: V,
  },
  // TOUS les rôles communiquent (ADR 0015) : `resp_equipment` manquait à la
  // ligne — un responsable de parc ne pouvait ni lire ni écrire dans un canal.
  comms: {
    admin: ALL, strategic: VM, place_arme: VM, wali: VM, opcom: VM, tacom: VM,
    bluecell: VM, greencell: VM, orangecell: VM,
    resp_hospital: VM, resp_shelter: VM, resp_morgue: VM, resp_unit: VM, resp_equipment: VM,
  },
  reports: {
    admin: ALL, strategic: V, place_arme: V, wali: V, opcom: ALL, tacom: VM,
    bluecell: V, greencell: V, orangecell: V,
  },
  analytics: {
    admin: ALL, strategic: V, place_arme: V, wali: V, opcom: V, tacom: V,
    bluecell: V, greencell: V, orangecell: V, resp_unit: V,
  },
  assistant: {
    admin: ALL, strategic: VM, place_arme: VM, wali: VM, opcom: VM, tacom: VM,
    bluecell: VM, greencell: VM, orangecell: VM,
    resp_hospital: VM, resp_shelter: VM, resp_morgue: VM, resp_unit: VM,
  },
  users: { admin: ALL },
  settings: { admin: ALL },
};

/**
 * Dotations des modules HORS matrice — reprises de l'état antérieur, en
 * attente d'arbitrage. Ne pas étendre : tout nouveau droit doit passer par
 * la matrice.
 */
const LEGACY: Record<(typeof LEGACY_FEATURES)[number], Partial<Record<Role, Cell>>> = {
  dispatch: { admin: V, tacom: AMV, bluecell: AMV, opcom: AMV },
  triage: { admin: V, tacom: V, bluecell: AMV, resp_morgue: V },
  ics: { admin: V, tacom: V, bluecell: AMV },
  damage: { admin: V, tacom: V, bluecell: V },
  orsec: { admin: V, strategic: V, tacom: AMV, opcom: AMV },
  plans: { admin: V, strategic: V, tacom: V, opcom: AMV },
  personnel: { admin: V, greencell: AMV, resp_unit: V },
  workorders: { admin: V, greencell: AMV, resp_equipment: AMV },
  seismic: { admin: V, strategic: V, tacom: V, bluecell: V, opcom: V, wali: V, place_arme: V },
  audit: { admin: V, strategic: V },
  // Suivi aérien : la conduite des moyens aériens revient au commandement
  // opératif et tactique ; les cellules et l'état-major observent. Dotation
  // provisoire, à confirmer lors de l'arbitrage de la matrice.
  aviation: {
    admin: ALL, opcom: AMV, tacom: AMV,
    strategic: V, place_arme: V, wali: V, bluecell: V, greencell: V, orangecell: V,
  },
  // Traceurs GPS : DÉCLARER un boîtier n'est pas un rangement d'inventaire,
  // c'est l'acte qui AUTORISE ce boîtier à parler à ARGOS — le registre est la
  // liste blanche de l'écouteur TCP. La déclaration revient donc au
  // commandement opératif et tactique, comme l'engagement des moyens qu'elle
  // équipe ; l'état-major, le wali, la place d'armes et les cellules consultent.
  // La suppression définitive n'est accordée à personne : seul le joker du
  // Super Administrateur la détient, l'archivage restant le geste par défaut
  // puisqu'il conserve la trace passée du moyen.
  // Dotation provisoire, à confirmer lors de l'arbitrage de la matrice.
  // Lecture ouverte aux responsables (ADR 0015) : une position partagée par
  // l'application doit apparaître sur la carte de quiconque la voit.
  tracking: {
    admin: ALL, opcom: AMV, tacom: AMV,
    strategic: V, place_arme: V, wali: V, bluecell: V, greencell: V, orangecell: V,
    resp_hospital: V, resp_shelter: V, resp_morgue: V, resp_unit: V, resp_equipment: V,
  },
  // Administration des canaux — ligne SÉPARÉE de `comms`, et c'est le point.
  // `comms` accorde `VM` à tous les rôles : chacun doit pouvoir lire, écrire et
  // gérer les membres de ses canaux. Mais CRÉER, RENOMMER ou SUPPRIMER un canal
  // n'est pas participer, c'est administrer la structure du centre — un canal
  // renommé sous les pieds d'une conduite en cours, ou supprimé avec sa
  // conversation, ne se rattrape pas. Confler les deux dans une seule ligne
  // obligeait à choisir entre ouvrir l'administration à tous ou fermer la
  // parole à presque tous.
  // Accordée au seul Administrateur ; le Super Administrateur la détient par
  // son joker. Dotation provisoire, à confirmer lors de l'arbitrage.
  comms_admin: { admin: ALL },
  // Édition de la carte (lot #12) : ligne VIDE à dessein — personne, hormis le
  // joker du Super Administrateur. L'Administrateur ne l'hérite pas.
  map_edit: {},
  // NRBC : même logique que l'aviation — la conduite (déclarer la substance,
  // choisir le référentiel du panache) revient au commandement opératif et
  // tactique ; l'état-major et les cellules consultent. Dotation provisoire,
  // à confirmer lors de l'arbitrage de la matrice.
  nrbc: {
    admin: ALL, opcom: AMV, tacom: AMV,
    strategic: V, place_arme: V, wali: V, bluecell: V, greencell: V, orangecell: V,
  },
  // Missions : la CONDUITE émet les boucles (opcom, tacom, cellule bleue) ;
  // les RESPONSABLES d'entité doivent pouvoir accepter, refuser, jalonner —
  // d'où `update` pour eux, sans `create` tant que les demandes montantes
  // (lot P2-a) ne sont pas ouvertes. Qui peut agir sur QUELLE mission reste
  // tranché par le domaine, pas par cette table. Dotation provisoire, à
  // confirmer lors de l'arbitrage de la matrice.
  missions: {
    admin: ALL, opcom: AMV, tacom: AMV, bluecell: AMV,
    strategic: V, place_arme: V, wali: V, greencell: V, orangecell: V,
    // `A` accordé aux responsables au lot P2-a : ils DEMANDENT un moyen depuis
    // leur entité. C'est le sens montant de la file — jusque-là, un hôpital
    // saturé ne pouvait rien réclamer. Ce qu'ils peuvent demander, et pour
    // quelle entité, reste tranché par le domaine, pas par cette table.
    resp_hospital: AMV, resp_shelter: AMV, resp_morgue: AMV, resp_unit: AMV, resp_equipment: AMV,
  },
};

/** Développe un code de cellule en liste d'actions. */
function expand(cell: Cell): Action[] {
  const out: Action[] = [];
  if (cell.includes("V")) out.push("view");
  if (cell.includes("A")) out.push("create");
  if (cell.includes("M")) out.push("update");
  if (cell.includes("R")) out.push("archive");
  // `delete` n'est JAMAIS accordé par la matrice — réservé au superadmin.
  return out;
}

/** Construit la dotation effective de chaque rôle à partir des deux tables. */
function buildRolePermissions(): Record<Role, Permission[] | "*"> {
  const out = {} as Record<Role, Permission[] | "*">;
  for (const role of ROLES) out[role] = role === "superadmin" ? "*" : [];
  const apply = (table: Record<string, Partial<Record<Role, Cell>>>) => {
    for (const [feature, byRole] of Object.entries(table)) {
      for (const [role, cell] of Object.entries(byRole) as [Role, Cell][]) {
        const grant = out[role];
        if (grant === "*") continue;
        for (const action of expand(cell)) grant.push(`${feature as Feature}:${action}`);
      }
    }
  };
  apply(MATRIX);
  apply(LEGACY);
  return out;
}

/**
 * Attribution des permissions par rôle. `"*"` = toutes les permissions (le
 * Super Administrateur, seul habilité à supprimer).
 * Tout ce qui n'est pas explicitement accordé est refusé (default-deny).
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[] | "*"> = buildRolePermissions();

/** Résout la liste effective des permissions d'un rôle. */
export function permissionsForRole(role: Role): Permission[] {
  const grant = ROLE_PERMISSIONS[role];
  return grant === "*" ? [...PERMISSIONS] : grant;
}

/** Contrôle RBAC : le rôle possède-t-il la permission demandée ? */
export function roleHasPermission(role: Role, perm: Permission): boolean {
  const grant = ROLE_PERMISSIONS[role];
  return grant === "*" || grant.includes(perm);
}

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Règles d'attribution de rôles à la création/modification d'un utilisateur.
// Appliquées côté serveur (frontière de sécurité) ; le frontend les reflète.
// ---------------------------------------------------------------------------

/**
 * Rôles qu'un créateur a le droit d'attribuer :
 * - le Super Administrateur peut attribuer tous les rôles ;
 * - l'Administrateur peut attribuer tous les rôles SAUF superadmin et admin ;
 * - tout autre rôle ne peut attribuer aucun rôle.
 */
export function assignableRoles(creator: Role): Role[] {
  if (creator === "superadmin") return [...ROLES];
  if (creator === "admin") return ROLES.filter((r) => r !== "superadmin" && r !== "admin");
  return [];
}

/** Un Super Administrateur peut attribuer plusieurs rôles ; un Admin un seul. */
export function canAssignMultipleRoles(creator: Role): boolean {
  return creator === "superadmin";
}

// ---------------------------------------------------------------------------
// Modules : ce que l'administrateur BASCULE (ADR 0015).
//
// Deux vocabulaires cohabitent, à dessein :
//   - la FONCTIONNALITÉ (`Feature`) est le grain du RBAC — `hospinet:update`,
//     `victims:view`… — c'est ce que la garde vérifie sur chaque route ;
//   - le MODULE (`ModuleKey`) est le grain de l'administration — « Hospinet »,
//     « Incidents »… — c'est ce que coupe un drapeau global (Paramètres) ou la
//     matrice rôle → modules (Utilisateurs › Rôles). Ses clés sont celles de la
//     navigation du web, pour qu'un même mot désigne la même chose des deux côtés.
// `FEATURE_MODULE` relie les deux : couper un module coupe TOUTES ses
// fonctionnalités, côté serveur — le masquage du web n'est qu'un reflet.
// ---------------------------------------------------------------------------

export const MODULE_KEYS = [
  "incidents", "map", "seismic", "dispatch", "triage",
  "equip", "units", "personnel", "workorders",
  "hospitals", "ics", "damage", "shelters", "morgue",
  "orsec", "plans", "comms", "reports", "analytics", "assistant", "simulation",
  "trackers", "chemlib",
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

/**
 * Module qui porte chaque fonctionnalité. `null` : cœur toujours actif — le
 * tableau de bord, les comptes, les paramètres, l'audit et les boucles
 * opérationnelles ne se coupent ni globalement ni par rôle (sinon plus personne
 * ne pourrait rallumer quoi que ce soit).
 */
export const FEATURE_MODULE: Record<Feature, ModuleKey | null> = {
  dashboard: null,
  dash_incident: "incidents",
  dash_hospital: "hospitals",
  dash_shelter: "shelters",
  dash_morgue: "morgue",
  dash_unit: "units",
  map: "map",
  incidents: "incidents",
  subincidents: "incidents",
  victims: "incidents",
  hospinet: "hospitals",
  shelters: "shelters",
  morgue: "morgue",
  units: "units",
  equipment: "equip",
  teams: "units",
  comms: "comms",
  reports: "reports",
  analytics: "analytics",
  assistant: "assistant",
  users: null,
  settings: null,
  dispatch: "dispatch",
  triage: "triage",
  ics: "ics",
  damage: "damage",
  orsec: "orsec",
  plans: "plans",
  personnel: "personnel",
  workorders: "workorders",
  seismic: "seismic",
  audit: null,
  aviation: "map",
  nrbc: "chemlib",
  missions: null,
  tracking: "trackers",
  comms_admin: "comms",
  map_edit: "map",
};

/** Module d'une permission `fonctionnalité:action` ; `null` pour le cœur. */
export function moduleOfPermission(perm: Permission): ModuleKey | null {
  return FEATURE_MODULE[perm.split(":")[0] as Feature];
}

export function isModuleKey(v: unknown): v is ModuleKey {
  return typeof v === "string" && (MODULE_KEYS as readonly string[]).includes(v);
}

/** Ce que la matrice rôle → modules bascule : les modules. (Nom historique conservé.) */
export const MODULE_FEATURES = MODULE_KEYS;
export type ModuleFeature = ModuleKey;

/**
 * Modules ouverts par défaut à chaque rôle : un module est ouvert dès que le
 * rôle peut VISUALISER l'une de ses fonctionnalités. Un module sans
 * fonctionnalité RBAC (la simulation, écran d'exercice) est ouvert à tous —
 * la matrice ne dit rien contre. Reste pilotable par le Super Administrateur
 * depuis l'écran Utilisateurs.
 */
export const DEFAULT_ROLE_FEATURES: Record<Role, Record<ModuleKey, boolean>> = Object.fromEntries(
  ROLES.map((role) => [
    role,
    Object.fromEntries(
      MODULE_KEYS.map((m) => {
        const feats = FEATURES.filter((f) => FEATURE_MODULE[f] === m);
        return [m, feats.length === 0 || feats.some((f) => roleHasPermission(role, `${f}:view`))];
      }),
    ),
  ]),
) as Record<Role, Record<ModuleKey, boolean>>;

/** Copie profonde des défauts (état initial modifiable). */
export function defaultRoleFeatures(): Record<Role, Record<ModuleKey, boolean>> {
  return structuredClone(DEFAULT_ROLE_FEATURES);
}
