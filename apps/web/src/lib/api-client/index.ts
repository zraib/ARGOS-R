// ============================================================================
// ARGOS — client API généré (contract-first, MASTER_PLAN §4.2)
// Types issus de l'OpenAPI de l'API (`openapi.d.ts`, généré par
// openapi-typescript). Le client typé s'appuie sur openapi-fetch : aucun `fetch`
// écrit à la main côté écrans, impossible de dériver du contrat.
//   npm run generate  (régénère openapi.d.ts depuis openapi.json)
// ============================================================================

import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "./openapi";

/** Corps de la demande de jeton dev, dérivé du contrat OpenAPI. */
export type DevTokenBody = NonNullable<paths["/api/auth/dev-token"]["post"]["requestBody"]>["content"]["application/json"];
export type ArgosRole = DevTokenBody["role"];

type Json<T> = T extends { content: { "application/json": infer C } } ? C : never;
/** Corps typés (dérivés du contrat) des mutations de gestion d'utilisateurs. */
export type LoginBody = Json<NonNullable<paths["/api/auth/login"]["post"]["requestBody"]>>;
export type CreateUserBody = Json<NonNullable<paths["/api/iam/users"]["post"]["requestBody"]>>;
export type UpdateUserBody = Json<NonNullable<paths["/api/iam/users/{id}"]["patch"]["requestBody"]>>;
export type RoleFeatureBody = Json<NonNullable<paths["/api/iam/role-features/{role}"]["patch"]["requestBody"]>>;
export type ModuleFeature = RoleFeatureBody["feature"];
/** Fonctionnalité de l'API commutable par rôle (ADR 0022, lot 2). */
export type RoleGrantBody = Json<NonNullable<paths["/api/iam/role-grants/{role}"]["patch"]["requestBody"]>>;
export type ApiFeature = RoleGrantBody["feature"];
export type CreateIncidentBody = Json<NonNullable<paths["/api/incidents"]["post"]["requestBody"]>>;
export type UpdateIncidentBody = Json<NonNullable<paths["/api/incidents/{id}"]["patch"]["requestBody"]>>;
export type CreateSubIncidentBody = Json<NonNullable<paths["/api/incidents/{id}/sub-incidents"]["post"]["requestBody"]>>;
export type CreateIncidentActionBody = Json<NonNullable<paths["/api/incidents/{id}/actions"]["post"]["requestBody"]>>;
export type UpdateIncidentActionBody = Json<NonNullable<paths["/api/incidents/{id}/actions/{aid}"]["patch"]["requestBody"]>>;
export type RegisterIncidentTypeBody = Json<NonNullable<paths["/api/incident-types"]["post"]["requestBody"]>>;
export type CreateUnitBody = Json<NonNullable<paths["/api/units"]["post"]["requestBody"]>>;
export type CreateShelterBody = Json<NonNullable<paths["/api/shelters"]["post"]["requestBody"]>>;
/** Chaîne de commandement et ressources (ADR 0016). */
export type AssignUnitBody = Json<NonNullable<paths["/api/incidents/{id}/assignments"]["post"]["requestBody"]>>;
export type CreatePersonBody = Json<NonNullable<paths["/api/resources/persons"]["post"]["requestBody"]>>;
export type UpdatePersonBody = Json<NonNullable<paths["/api/resources/persons/{id}"]["patch"]["requestBody"]>>;
export type CreateTeamBody = Json<NonNullable<paths["/api/resources/teams"]["post"]["requestBody"]>>;
export type UpdateTeamBody = Json<NonNullable<paths["/api/resources/teams/{id}"]["patch"]["requestBody"]>>;
export type CreateVehicleBody = Json<NonNullable<paths["/api/resources/vehicles"]["post"]["requestBody"]>>;
export type UpdateVehicleBody = Json<NonNullable<paths["/api/resources/vehicles/{id}"]["patch"]["requestBody"]>>;
export type CreateSupplyBody = Json<NonNullable<paths["/api/resources/supplies"]["post"]["requestBody"]>>;
export type UpdateSupplyBody = Json<NonNullable<paths["/api/resources/supplies/{id}"]["patch"]["requestBody"]>>;
export type CreateOwnedEquipBody = Json<NonNullable<paths["/api/resources/equipment"]["post"]["requestBody"]>>;
export type UpdateOwnedEquipBody = Json<NonNullable<paths["/api/resources/equipment/{id}"]["patch"]["requestBody"]>>;
export type ResourceOwner = CreatePersonBody["owner"];
/** Pose d'une ressource sur le terrain (ADR 0018). */
export type PlaceResourceBody = Json<NonNullable<paths["/api/resources/{kind}/{id}/position"]["put"]["requestBody"]>>;
export type CreateDrawingBody = Json<NonNullable<paths["/api/drawings"]["post"]["requestBody"]>>;
export type UpdateIncidentTypeBody = Json<NonNullable<paths["/api/incident-types/{id}"]["patch"]["requestBody"]>>;
export type PublishSimulationBody = Json<NonNullable<paths["/api/simulations"]["post"]["requestBody"]>>;
export type UpdateDrawingBody = Json<NonNullable<paths["/api/drawings/{id}"]["patch"]["requestBody"]>>;
export type AppMode = Json<NonNullable<paths["/api/domain/mode"]["patch"]["requestBody"]>>["mode"];
/** Postes d'opération sur la carte (lot #12). */
export type CreatePostBody = Json<NonNullable<paths["/api/incidents/{id}/posts"]["post"]["requestBody"]>>;
export type UpdatePostBody = Json<NonNullable<paths["/api/incidents/{id}/posts/{postId}"]["patch"]["requestBody"]>>;
/** Export du centre de communication, tel que l'import le reprend (ADR 0021). */
export type ImportCommsBody = Json<NonNullable<paths["/api/comms/import"]["post"]["requestBody"]>>;
/** Déploiement d'un hôpital de campagne à un point de la carte. */
export type DeployFieldHospitalBody = Json<NonNullable<paths["/api/field-hospitals"]["post"]["requestBody"]>>;
/** Fiche d'une pièce jointe versée — le contenu vit côté serveur (lot COMMS). */
export type CommsAttachment = { id: string; name: string; mime: string; bytes: number };
// Traceurs GPS FMC920 (lot N-2). Le type de la RÉPONSE est exporté aussi : la
// carte et l'écran de gestion lisent la même forme, qui vient du contrat.
export type DeclareTrackerBody = Json<NonNullable<paths["/api/tracking/trackers"]["post"]["requestBody"]>>;
export type UpdateTrackerBody = Json<NonNullable<paths["/api/tracking/trackers/{id}"]["patch"]["requestBody"]>>;
/** Position partagée depuis l'application (ADR 0008, révision). */
export type SharePositionBody = Json<NonNullable<paths["/api/tracking/trackers/{id}/position"]["post"]["requestBody"]>>;
export type CreateHospitalBody = Json<NonNullable<paths["/api/hospitals"]["post"]["requestBody"]>>;
export type UpdateHospitalBody = Json<NonNullable<paths["/api/hospitals/{id}"]["patch"]["requestBody"]>>;
export type UpdateUnitBody = Json<NonNullable<paths["/api/units/{id}"]["patch"]["requestBody"]>>;
export type UpdateShelterBody = Json<NonNullable<paths["/api/shelters/{id}"]["patch"]["requestBody"]>>;
export type UpdateMorgueBody = Json<NonNullable<paths["/api/morgues/{id}"]["patch"]["requestBody"]>>;
export type AdmitBodyBody = Json<NonNullable<paths["/api/morgues/{id}/records"]["post"]["requestBody"]>>;
export type UpdateRecordBody = Json<NonNullable<paths["/api/morgues/{id}/records/{rid}"]["patch"]["requestBody"]>>;
export type DeployMobileMorgueBody = Json<NonNullable<paths["/api/morgues/mobile"]["post"]["requestBody"]>>;
export type CreateMorgueBody = Json<NonNullable<paths["/api/morgues"]["post"]["requestBody"]>>;
export type CreateVictimBody = Json<NonNullable<paths["/api/incidents/{id}/victims"]["post"]["requestBody"]>>;
export type UpdateVictimBody = Json<NonNullable<paths["/api/incidents/{id}/victims/{vid}"]["patch"]["requestBody"]>>;
export type TransferBodyBody = Json<NonNullable<paths["/api/morgues/{id}/records/{rid}/transfer"]["post"]["requestBody"]>>;
export type HospitalDeathBody = Json<NonNullable<paths["/api/hospitals/{id}/deceased"]["post"]["requestBody"]>>;
export type CreateEquipBody = Json<NonNullable<paths["/api/equipment-parks/{id}/items"]["post"]["requestBody"]>>;
export type UpdateEquipBody = Json<NonNullable<paths["/api/equipment-parks/{id}/items/{eid}"]["patch"]["requestBody"]>>;
export type CreateWardBody = Json<NonNullable<paths["/api/hospitals/{id}/wards"]["post"]["requestBody"]>>;
export type UpdateWardBody = Json<NonNullable<paths["/api/hospitals/{id}/wards/{wid}"]["patch"]["requestBody"]>>;
export type AddAircraftBody = Json<NonNullable<paths["/api/aviation/aircraft"]["post"]["requestBody"]>>;
export type PublishSitrepBody = Json<NonNullable<paths["/api/sitreps"]["post"]["requestBody"]>>;
export type IssueMissionBody = Json<NonNullable<paths["/api/missions"]["post"]["requestBody"]>>;

export interface ArgosClientOptions {
  /** Origine de l'API, SANS le préfixe /api (ex. http://localhost:4000). */
  baseUrl: string;
  /** Fournit le jeton porteur courant (ou null si non authentifié). */
  getToken?: () => string | null;
  /**
   * Appelé quand un endpoint authentifié répond 401 (jeton expiré/invalide,
   * hors /auth/login). Permet de purger la session et de renvoyer vers l'écran
   * de connexion au lieu de rester bloqué sur une coquille vide.
   */
  onUnauthorized?: () => void;
}

/** Instancie un client typé pour l'API ARGOS. */
export function createArgosClient(opts: ArgosClientOptions) {
  const client = createClient<paths>({ baseUrl: opts.baseUrl });

  const authMiddleware: Middleware = {
    onRequest({ request }) {
      const token = opts.getToken?.();
      if (token) request.headers.set("Authorization", `Bearer ${token}`);
      return request;
    },
    onResponse({ request, response }) {
      // 401 hors /auth/login (mauvais mot de passe) = jeton expiré/invalide :
      // on purge la session pour éviter de rester bloqué sur une coquille vide.
      if (response.status === 401 && !request.url.includes("/auth/login")) {
        opts.onUnauthorized?.();
      }
      return response;
    },
  };
  client.use(authMiddleware);

  return {
    health: () => client.GET("/api/health"),
    /** Jeton de développement (mode dev de l'API uniquement). */
    devToken: (body: DevTokenBody) => client.POST("/api/auth/dev-token", { body }),
    me: () => client.GET("/api/iam/me"),
    // --- authentification / cycle de vie des comptes gérés ---
    login: (body: LoginBody) => client.POST("/api/auth/login", { body }),
    changePassword: (newPassword: string) => client.POST("/api/auth/change-password", { body: { newPassword } }),
    /** « Mot de passe oublié », sans session — la réponse ne dit pas si le compte existe. */
    requestPasswordReset: (matricule: string) => client.POST("/api/auth/password-reset-request", { body: { matricule } }),
    getProfile: () => client.GET("/api/auth/profile"),
    updateProfile: (patch: { nom?: string; photo?: string | null }) => client.PATCH("/api/auth/profile", { body: patch }),
    selectRole: (role: ArgosRole) => client.POST("/api/auth/select-role", { body: { role } }),
    // --- gestion des utilisateurs (Phase 2) ---
    listUsers: () => client.GET("/api/iam/users"),
    createUser: (body: CreateUserBody) => client.POST("/api/iam/users", { body }),
    updateUser: (id: string, body: UpdateUserBody) => client.PATCH("/api/iam/users/{id}", { params: { path: { id } }, body }),
    deleteUser: (id: string) => client.DELETE("/api/iam/users/{id}", { params: { path: { id } } }),
    setUserActive: (id: string, active: boolean) => client.POST("/api/iam/users/{id}/active", { params: { path: { id } }, body: { active } }),
    resetUserCode: (id: string) => client.POST("/api/iam/users/{id}/reset-code", { params: { path: { id } } }),
    revealUserCode: (id: string) => client.GET("/api/iam/users/{id}/temp-code", { params: { path: { id } } }),
    listRoles: () => client.GET("/api/iam/roles"),
    listPermissions: () => client.GET("/api/iam/permissions"),
    getRoleFeatures: () => client.GET("/api/iam/role-features"),
    /** Les modules par défaut de chaque rôle (dérivés de la matrice RBAC) — ce que « réinitialiser » restaure. */
    getDefaultRoleFeatures: () => client.GET("/api/iam/role-features/defaults"),
    setRoleFeature: (role: ArgosRole, feature: ModuleFeature, enabled: boolean) =>
      client.PATCH("/api/iam/role-features/{role}", { params: { path: { role } }, body: { feature, enabled } }),
    resetRoleFeatures: (role: ArgosRole) => client.POST("/api/iam/role-features/{role}/reset", { params: { path: { role } } }),
    /** Fonctionnalités de l'API commutables par rôle (ADR 0022, lot 2). */
    getRoleGrants: () => client.GET("/api/iam/role-grants"),
    getDefaultRoleGrants: () => client.GET("/api/iam/role-grants/defaults"),
    setRoleGrant: (role: ArgosRole, feature: RoleGrantBody["feature"], enabled: boolean) =>
      client.PATCH("/api/iam/role-grants/{role}", { params: { path: { role } }, body: { feature, enabled } }),
    resetRoleGrants: (role: ArgosRole) => client.POST("/api/iam/role-grants/{role}/reset", { params: { path: { role } } }),
    /** Bascule d'un module pour UN compte (ADR 0016) ; `enabled: null` rend la main au rôle. */
    setUserModule: (id: string, module: ModuleFeature, enabled: boolean | null) =>
      client.PATCH("/api/iam/users/{id}/modules", { params: { path: { id } }, body: { module, enabled } }),
    // --- domaine opérationnel (Phase 2) ---
    getIncidents: () => client.GET("/api/incidents"),
    /** Tous les incidents actifs, pour la carte de chacun (ADR 0020) — la liste reste sous la doctrine de visibilité. */
    getMapIncidents: () => client.GET("/api/incidents/map"),
    getIncidentTypes: () => client.GET("/api/incident-types"),
    getSubIncidentTypes: () => client.GET("/api/sub-incident-types"),
    registerIncidentType: (body: RegisterIncidentTypeBody) => client.POST("/api/incident-types", { body }),
    /** Modifier un type d'incident AJOUTÉ (libellés, icône) — ADR 0029. */
    updateIncidentType: (id: string, body: UpdateIncidentTypeBody) => client.PATCH("/api/incident-types/{id}", { params: { path: { id } }, body }),
    addSubIncident: (id: string, body: CreateSubIncidentBody) =>
      client.POST("/api/incidents/{id}/sub-incidents", { params: { path: { id } }, body }),
    removeSubIncident: (id: string, subId: string) =>
      client.DELETE("/api/incidents/{id}/sub-incidents/{subId}", { params: { path: { id, subId } } }),
    // Actions entreprises : le journal de conduite de l'incident (ADR 0032).
    addIncidentAction: (id: string, body: CreateIncidentActionBody) =>
      client.POST("/api/incidents/{id}/actions", { params: { path: { id } }, body }),
    updateIncidentAction: (id: string, aid: string, body: UpdateIncidentActionBody) =>
      client.PATCH("/api/incidents/{id}/actions/{aid}", { params: { path: { id, aid } }, body }),
    deleteIncidentAction: (id: string, aid: string) =>
      client.DELETE("/api/incidents/{id}/actions/{aid}", { params: { path: { id, aid } } }),
    getDashboardStats: () => client.GET("/api/dashboard/stats"),
    /** Prédictions risques calculées côté serveur (moteur déterministe, F-04). */
    getDashboardRisk: () => client.GET("/api/dashboard/risk"),
    createIncident: (body: CreateIncidentBody) => client.POST("/api/incidents", { body }),
    /**
     * Ouvrir un abri (OPSnet). Comme pour les unités, la création d'une entité
     * revient à son administrateur ou à son responsable — pas à la conduite,
     * qui la consulte et l'emploie.
     */
    createShelter: (body: CreateShelterBody) => client.POST("/api/shelters", { body }),

    // --- centre de communication (lot COMMS) ---
    getPresence: () => client.GET("/api/comms/presence"),
    /** Annuaire des comptes joignables — pour composer un canal (permission `comms:view`). */
    getCommsDirectory: () => client.GET("/api/comms/directory"),
    /** Qui tient quoi — titulaire de chaque entité et de chaque poste déployé (permission `comms:view`). */
    getResponsables: () => client.GET("/api/comms/responsables"),
    /** Alertes gardées pour le compte connecté — la plus récente d'abord. */
    getNotices: () => client.GET("/api/comms/notices"),
    /** Postes posés sur la carte des opérations visibles (permission `map:view`). */
    getPosts: () => client.GET("/api/posts"),
    // Simulations partagées : le scénario, rejoué par chaque poste (ADR 0029).
    getSimulations: () => client.GET("/api/simulations"),
    publishSimulation: (body: PublishSimulationBody) => client.POST("/api/simulations", { body }),
    deleteSimulation: (id: string) => client.DELETE("/api/simulations/{id}", { params: { path: { id } } }),
    // Croquis dessinés sur la carte (mode dessin).
    getDrawings: () => client.GET("/api/drawings"),
    createDrawing: (body: CreateDrawingBody) => client.POST("/api/drawings", { body }),
    updateDrawing: (id: string, body: UpdateDrawingBody) => client.PATCH("/api/drawings/{id}", { params: { path: { id } }, body }),
    deleteDrawing: (id: string) => client.DELETE("/api/drawings/{id}", { params: { path: { id } } }),
    createPost: (id: string, body: CreatePostBody) => client.POST("/api/incidents/{id}/posts", { params: { path: { id } }, body }),
    updatePost: (id: string, postId: string, body: UpdatePostBody) =>
      client.PATCH("/api/incidents/{id}/posts/{postId}", { params: { path: { id, postId } }, body }),
    deletePost: (id: string, postId: string) => client.DELETE("/api/incidents/{id}/posts/{postId}", { params: { path: { id, postId } } }),
    /** Ouvre (ou retrouve) la conversation directe avec un compte — rend le canal. */
    openDirectChannel: (matricule: string) =>
      client.POST("/api/comms/direct/{matricule}", { params: { path: { matricule } } }),
    /**
     * Crée un canal. `matricules` fournis → canal RESTREINT à ces comptes dès sa
     * naissance ; absents → canal ouvert, comme les canaux thématiques.
     */
    createCommsChannel: (categoryId: string, name: string, matricules?: string[]) =>
      client.POST("/api/comms/channels", { body: { categoryId, name, ...(matricules?.length ? { matricules } : {}) } }),
    /** Convoque des comptes dans un canal existant. Un canal OUVERT devient restreint dès le premier. */
    addChannelMembers: (id: string, matricules: string[]) =>
      client.POST("/api/comms/channels/{id}/members", { params: { path: { id } }, body: { matricules } }),
    /** Retire un participant. Le canal reste restreint, même vidé de ses membres. */
    removeChannelMember: (id: string, matricule: string) =>
      client.DELETE("/api/comms/channels/{id}/members/{matricule}", { params: { path: { id, matricule } } }),
    renameCommsChannel: (id: string, name: string) =>
      client.PATCH("/api/comms/channels/{id}", { params: { path: { id } }, body: { name } }),
    deleteCommsChannel: (id: string) =>
      client.DELETE("/api/comms/channels/{id}", { params: { path: { id } } }),
    /** Traçabilité (ADR 0021) : archiver et rouvrir un canal (`comms_admin:update`). */
    archiveCommsChannel: (id: string) => client.POST("/api/comms/channels/{id}/archive", { params: { path: { id } } }),
    unarchiveCommsChannel: (id: string) => client.POST("/api/comms/channels/{id}/unarchive", { params: { path: { id } } }),
    /** Le document d'export d'un canal (`comms:view`, une conversation directe par ses membres) ou de tout le centre (`comms_admin:view`). */
    exportCommsChannel: (id: string) => client.GET("/api/comms/channels/{id}/export", { params: { path: { id } } }),
    exportComms: () => client.GET("/api/comms/export"),
    /** Reprend un export en archives (`comms_admin:create`). */
    importComms: (doc: ImportCommsBody) => client.POST("/api/comms/import", { body: doc }),
    createCommsCategory: (name: string) => client.POST("/api/comms/categories", { body: { name } }),
    /**
     * Suppression DÉFINITIVE d'un incident — `incidents:delete`, que la matrice
     * n'accorde à personne : seul le joker du Super Administrateur la détient.
     * L'API reste l'autorité, l'écran ne fait que masquer un geste qu'elle
     * refuserait. Cascade sur les sous-incidents, les boucles et le canal.
     */
    deleteIncident: (id: string) => client.DELETE("/api/incidents/{id}", { params: { path: { id } } }),

    // --- déploiement des postes (V-2) ---
    // Armer une opération est un acte de commandement, pas une modification de
    // fiche : d'où des routes dédiées plutôt qu'un PATCH sur le compte.
    getDeployments: (id: string) => client.GET("/api/incidents/{id}/deployments", { params: { path: { id } } }),
    /** Tableau de bord d'UNE opération (V-3) — gardé par la portée, pas seulement par le rôle. */
    getIncidentDashboard: (id: string) =>
      client.GET("/api/incidents/{id}/dashboard", { params: { path: { id } } }),
    getDeployablePosts: () => client.GET("/api/deployable-posts"),

    // --- bibliothèque de substances dangereuses (N-3) ---
    /**
     * Bibliothèque de substances : recherche libre, feuilletage alphabétique et
     * plafond de résultats. Le plafond est SERVEUR (lot N-5) : la bibliothèque
     * entière pèse 2,2 Mo de résumés, intransportable à chaque frappe. La
     * réponse porte `matched` (le compte réel) et `index` (l'effectif par
     * lettre sur toute la bibliothèque).
     */
    getChemLibrary: (opts: { q?: string; letter?: string; limit?: number; lang?: "fr" | "en" | "ar" } = {}) =>
      client.GET("/api/nrbc/library", {
        params: {
          query: {
            ...(opts.q ? { q: opts.q } : {}),
            ...(opts.letter ? { letter: opts.letter } : {}),
            ...(opts.limit ? { limit: String(opts.limit) } : {}),
            ...(opts.lang ? { lang: opts.lang } : {}),
          },
        },
      }),
    getSubstance: (id: string) => client.GET("/api/nrbc/substances/{id}", { params: { path: { id } } }),

    // --- traceurs GPS FMC920 (lot N-2) ---
    /**
     * Traceurs déclarés, avec leur dernière position connue. `last` est la
     * dernière position EXPLOITABLE, `lastSeenAt` le dernier contact — un
     * boîtier peut émettre depuis un sous-sol sans jamais se localiser.
     */
    getTrackers: (includeArchived = false) =>
      client.GET("/api/tracking/trackers", {
        params: { query: includeArchived ? { includeArchived: true } : {} },
      }),
    getTracker: (id: string) => client.GET("/api/tracking/trackers/{id}", { params: { path: { id } } }),
    /**
     * Déclarer un traceur. Ce n'est pas un rangement d'inventaire : le registre
     * EST la liste blanche de l'écouteur TCP, et un IMEI non déclaré est refusé
     * à la poignée de main (ADR 0008).
     */
    declareTracker: (body: DeclareTrackerBody) => client.POST("/api/tracking/trackers", { body }),
    updateTracker: (id: string, body: UpdateTrackerBody) =>
      client.PATCH("/api/tracking/trackers/{id}", { params: { path: { id } }, body }),
    deleteTracker: (id: string) => client.DELETE("/api/tracking/trackers/{id}", { params: { path: { id } } }),
    /** Le partage de position de MON compte (null si aucun) — ouvert à tout compte connecté. */
    getMyTracker: () => client.GET("/api/tracking/trackers/mine"),
    /** Verser la position de mon téléphone sur MON partage ; refusé sur un boîtier ou le partage d'un autre compte. */
    sharePosition: (id: string, body: SharePositionBody) =>
      client.POST("/api/tracking/trackers/{id}/position", { params: { path: { id } }, body }),
    deployPost: (id: string, matricule: string) =>
      client.POST("/api/incidents/{id}/deployments", { params: { path: { id } }, body: { matricule } }),
    withdrawPost: (id: string, matricule: string) =>
      client.DELETE("/api/incidents/{id}/deployments/{matricule}", { params: { path: { id, matricule } } }),

    updateIncident: (id: string, body: UpdateIncidentBody) => client.PATCH("/api/incidents/{id}", { params: { path: { id } }, body }),
    getUnits: () => client.GET("/api/units"),
    createUnit: (body: CreateUnitBody) => client.POST("/api/units", { body }),
    /**
     * Suppressions définitives (ADR 0015) — Super Administrateur seulement.
     * L'API répond 409 avec la liste de ce qui retient l'entité ; `force`
     * passe outre en connaissance de cause.
     */
    deleteUnit: (id: string, force = false) =>
      client.DELETE("/api/units/{id}", { params: { path: { id }, query: force ? { force: "true" } : {} } }),
    deleteShelter: (id: string, force = false) =>
      client.DELETE("/api/shelters/{id}", { params: { path: { id }, query: force ? { force: "true" } : {} } }),
    deleteMorgue: (id: string, force = false) =>
      client.DELETE("/api/morgues/{id}", { params: { path: { id }, query: force ? { force: "true" } : {} } }),
    deleteHospital: (id: string, force = false) =>
      client.DELETE("/api/hospitals/{id}", { params: { path: { id }, query: force ? { force: "true" } : {} } }),
    /** Retirer un hôpital de campagne — qui déploie retire (ADR 0030) ; 409 s'il soigne ou sert une opération active. */
    deleteFieldHospital: (id: string, force = false) =>
      client.DELETE("/api/field-hospitals/{id}", { params: { path: { id }, query: force ? { force: "true" } : {} } }),
    /** Profil de données de la station, mode en service et volume du domaine (écran Paramètres). */
    getDataProfile: () => client.GET("/api/domain/profile"),
    /** Changer le mode de la station (ADR 0016) — signé ; l'API redémarre d'elle-même en production. */
    setMode: (mode: AppMode, password: string) => client.PATCH("/api/domain/mode", { body: { mode, password } }),
    /** Mode de l'application (ADR 0022) : classique ou direx — Super Administrateur, signé. */
    setProfile: (profile: "classique" | "direx", password: string) => client.PATCH("/api/domain/profile", { body: { profile, password } }),
    // --- chaîne de commandement (ADR 0016) : affectation et déploiement des unités ---
    getAssignments: (id: string) => client.GET("/api/incidents/{id}/assignments", { params: { path: { id } } }),
    assignUnit: (id: string, body: AssignUnitBody) => client.POST("/api/incidents/{id}/assignments", { params: { path: { id } }, body }),
    unassignUnit: (id: string, unitId: string) =>
      client.DELETE("/api/incidents/{id}/assignments/{unitId}", { params: { path: { id, unitId } } }),
    deployUnit: (id: string, unitId: string) =>
      client.POST("/api/incidents/{id}/assignments/{unitId}/deploy", { params: { path: { id, unitId } } }),
    withdrawUnit: (id: string, unitId: string) =>
      client.POST("/api/incidents/{id}/assignments/{unitId}/withdraw", { params: { path: { id, unitId } } }),
    // --- ressources d'une entité (ADR 0016) ---
    getResources: (owner?: ResourceOwner) =>
      client.GET("/api/resources", { params: { query: owner ? { ownerKind: owner.kind, ownerId: owner.id } : {} } }),
    addPerson: (body: CreatePersonBody) => client.POST("/api/resources/persons", { body }),
    updatePerson: (id: string, body: UpdatePersonBody) => client.PATCH("/api/resources/persons/{id}", { params: { path: { id } }, body }),
    removePerson: (id: string) => client.DELETE("/api/resources/persons/{id}", { params: { path: { id } } }),
    addTeam: (body: CreateTeamBody) => client.POST("/api/resources/teams", { body }),
    updateTeam: (id: string, body: UpdateTeamBody) => client.PATCH("/api/resources/teams/{id}", { params: { path: { id } }, body }),
    removeTeam: (id: string) => client.DELETE("/api/resources/teams/{id}", { params: { path: { id } } }),
    addVehicle: (body: CreateVehicleBody) => client.POST("/api/resources/vehicles", { body }),
    updateVehicle: (id: string, body: UpdateVehicleBody) => client.PATCH("/api/resources/vehicles/{id}", { params: { path: { id } }, body }),
    removeVehicle: (id: string) => client.DELETE("/api/resources/vehicles/{id}", { params: { path: { id } } }),
    addSupply: (body: CreateSupplyBody) => client.POST("/api/resources/supplies", { body }),
    updateSupply: (id: string, body: UpdateSupplyBody) => client.PATCH("/api/resources/supplies/{id}", { params: { path: { id } }, body }),
    removeSupply: (id: string) => client.DELETE("/api/resources/supplies/{id}", { params: { path: { id } } }),
    addOwnedEquip: (body: CreateOwnedEquipBody) => client.POST("/api/resources/equipment", { body }),
    updateOwnedEquip: (id: string, body: UpdateOwnedEquipBody) => client.PATCH("/api/resources/equipment/{id}", { params: { path: { id } }, body }),
    removeOwnedEquip: (id: string) => client.DELETE("/api/resources/equipment/{id}", { params: { path: { id } } }),
    /** Les détenteurs dont le compte voit les ressources (ADR 0019) — ce que l'écran Ressources propose. */
    getResourceOwners: () => client.GET("/api/resources/owners"),
    // --- terrain : équipes, véhicules, équipements posés sur la carte (ADR 0018) ---
    getPlaced: () => client.GET("/api/resources/placed"),
    getPlaceable: () => client.GET("/api/resources/placeable"),
    placeResource: (kind: string, id: string, body: PlaceResourceBody) =>
      client.PUT("/api/resources/{kind}/{id}/position", { params: { path: { kind, id } }, body }),
    unplaceResource: (kind: string, id: string) => client.DELETE("/api/resources/{kind}/{id}/position", { params: { path: { kind, id } } }),
    /** Acquitter une alerte adressée (`all` : toutes) — l'acquittement survit au rechargement (ADR 0016). */
    ackNotice: (id: string | "all") => client.POST("/api/comms/notices/{id}/ack", { params: { path: { id } } }),
    /** Remise à zéro du domaine, signée par le mot de passe du Super Administrateur ; le réseau hospitalier reste. */
    purgeDomain: (password: string) => client.POST("/api/domain/purge", { body: { password } }),
    getHospitals: () => client.GET("/api/hospitals"),
    createHospital: (body: CreateHospitalBody) => client.POST("/api/hospitals", { body }),
    updateHospital: (id: string, body: UpdateHospitalBody) =>
      client.PATCH("/api/hospitals/{id}", { params: { path: { id } }, body }),
    getWards: (id: string) => client.GET("/api/hospitals/{id}/wards", { params: { path: { id } } }),
    createWard: (id: string, body: CreateWardBody) =>
      client.POST("/api/hospitals/{id}/wards", { params: { path: { id } }, body }),
    updateWard: (id: string, wid: string, body: UpdateWardBody) =>
      client.PATCH("/api/hospitals/{id}/wards/{wid}", { params: { path: { id, wid } }, body }),
    deleteWard: (id: string, wid: string) =>
      client.DELETE("/api/hospitals/{id}/wards/{wid}", { params: { path: { id, wid } } }),
    updateUnit: (id: string, body: UpdateUnitBody) =>
      client.PATCH("/api/units/{id}", { params: { path: { id } }, body }),
    getShelters: () => client.GET("/api/shelters"),
    updateShelter: (id: string, body: UpdateShelterBody) =>
      client.PATCH("/api/shelters/{id}", { params: { path: { id } }, body }),
    getMorgues: () => client.GET("/api/morgues"),
    updateMorgue: (id: string, body: UpdateMorgueBody) =>
      client.PATCH("/api/morgues/{id}", { params: { path: { id } }, body }),
    getMortuaryRecords: (id: string) => client.GET("/api/morgues/{id}/records", { params: { path: { id } } }),
    admitBody: (id: string, body: AdmitBodyBody) =>
      client.POST("/api/morgues/{id}/records", { params: { path: { id } }, body }),
    updateMortuaryRecord: (id: string, rid: string, body: UpdateRecordBody) =>
      client.PATCH("/api/morgues/{id}/records/{rid}", { params: { path: { id, rid } }, body }),
    // Service morgue : registre de tous les sites, morgues mobiles, chaîne de garde.
    getMortuaryRegistry: (incidentId?: string) =>
      client.GET("/api/morgues/registry", { params: { query: incidentId ? { incidentId } : {} } }),
    createMorgue: (body: CreateMorgueBody) => client.POST("/api/morgues", { body }),
    // Bilan des victimes d'un incident : décédés (préliminaire), blessés, disparus.
    getVictims: (id: string) => client.GET("/api/incidents/{id}/victims", { params: { path: { id } } }),
    addVictim: (id: string, body: CreateVictimBody) => client.POST("/api/incidents/{id}/victims", { params: { path: { id } }, body }),
    updateVictim: (id: string, vid: string, body: UpdateVictimBody) =>
      client.PATCH("/api/incidents/{id}/victims/{vid}", { params: { path: { id, vid } }, body }),
    removeVictim: (id: string, vid: string) => client.DELETE("/api/incidents/{id}/victims/{vid}", { params: { path: { id, vid } } }),
    assignVictimMorgue: (id: string, vid: string, mid: string) =>
      client.POST("/api/incidents/{id}/victims/{vid}/morgue", { params: { path: { id, vid } }, body: { mid } }),
    deployMobileMorgue: (body: DeployMobileMorgueBody) => client.POST("/api/morgues/mobile", { body }),
    recallMorgue: (id: string) => client.POST("/api/morgues/{id}/recall", { params: { path: { id } } }),
    receiveBody: (id: string, rid: string) => client.POST("/api/morgues/{id}/records/{rid}/receive", { params: { path: { id, rid } } }),
    transferBody: (id: string, rid: string, body: TransferBodyBody) =>
      client.POST("/api/morgues/{id}/records/{rid}/transfer", { params: { path: { id, rid } }, body }),
    declareHospitalDeath: (id: string, body: HospitalDeathBody) =>
      client.POST("/api/hospitals/{id}/deceased", { params: { path: { id } }, body }),
    getParkItems: (id: string) => client.GET("/api/equipment-parks/{id}/items", { params: { path: { id } } }),
    addParkItem: (id: string, body: CreateEquipBody) =>
      client.POST("/api/equipment-parks/{id}/items", { params: { path: { id } }, body }),
    updateParkItem: (id: string, eid: string, body: UpdateEquipBody) =>
      client.PATCH("/api/equipment-parks/{id}/items/{eid}", { params: { path: { id, eid } }, body }),
    removeParkItem: (id: string, eid: string) =>
      client.DELETE("/api/equipment-parks/{id}/items/{eid}", { params: { path: { id, eid } } }),
    getFieldHospitals: () => client.GET("/api/field-hospitals"),
    /** Déploie un hôpital de campagne au point choisi sur la carte (`hospinet:create`). */
    deployFieldHospital: (body: DeployFieldHospitalBody) => client.POST("/api/field-hospitals", { body }),
    getFeed: () => client.GET("/api/feed"),
    getDispatchQueue: () => client.GET("/api/dispatch/queue"),
    getDispatchMovements: () => client.GET("/api/dispatch/movements"),
    getCatalog: () => client.GET("/api/catalog"),
    getComms: () => client.GET("/api/comms"),
    /** Envoie un message, avec ou sans pièce jointe déjà versée. */
    sendMessage: (channelId: string, txt: string, attachment?: CommsAttachment) =>
      client.POST("/api/comms/messages", { body: { channelId, txt, ...(attachment ? { attachment } : {}) } }),
    /** Accusé « remis » / « lu » d'une conversation directe, jusqu'à ce message. */
    sendReceipt: (channelId: string, state: "delivered" | "read", upToId: number) =>
      client.POST("/api/comms/channels/{id}/receipts", { params: { path: { id: channelId } }, body: { state, upToId } }),
    /** « En train d'écrire » — un signal transitoire, jamais gardé. */
    sendTyping: (channelId: string) => client.POST("/api/comms/channels/{id}/typing", { params: { path: { id: channelId } } }),
    createCommCategory: (name: string) => client.POST("/api/comms/categories", { body: { name } }),
    createCommChannel: (categoryId: string, name: string, matricules?: string[]) =>
      client.POST("/api/comms/channels", { body: { categoryId, name, ...(matricules?.length ? { matricules } : {}) } }),
    getReference: () => client.GET("/api/reference"),
    getSeismicEvents: (minmag = 2.5, region: "morocco" | "world" = "world") =>
      client.GET("/api/seismic/events", { params: { query: { minmag: String(minmag), region } } }),
    getSeismicAlertConfig: () => client.GET("/api/seismic/alert-config"),
    updateSeismicAlertConfig: (body: { maMinMag: number; globalMinMag: number; contacts: { name: string; phone: string; email: string }[] }) =>
      client.PATCH("/api/seismic/alert-config", { body }),
    getSeismicNotifications: () => client.GET("/api/seismic/notifications"),

    // --- suivi aérien (feux de forêt) ---
    /** Aéronefs inscrits à la surveillance. */
    getAircraft: () => client.GET("/api/aviation/aircraft", {}),
    /** Positions courantes des seuls aéronefs inscrits (+ nom du flux en service). */
    getAircraftStates: () => client.GET("/api/aviation/states", {}),
    addAircraft: (body: AddAircraftBody) => client.POST("/api/aviation/aircraft", { body }),
    archiveAircraft: (id: string) =>
      client.POST("/api/aviation/aircraft/{id}/archive", { params: { path: { id } } }),
    deleteAircraft: (id: string) =>
      client.DELETE("/api/aviation/aircraft/{id}", { params: { path: { id } } }),
    // --- niveau d'alerte + comptes rendus (ADR 0007, P3) ---
    getAlertLevel: () => client.GET("/api/alert-level", {}),
    setAlertLevel: (level: 1 | 2 | 3 | 4) => client.PATCH("/api/alert-level", { body: { level } }),
    getSitreps: (entityId?: string) =>
      client.GET("/api/sitreps", { params: { query: entityId ? { entityId } : {} } }),
    getMissingSitreps: () => client.GET("/api/sitreps/missing", {}),
    publishSitrep: (body: PublishSitrepBody) => client.POST("/api/sitreps", { body }),

    // --- missions : la boucle fermée (ADR 0007) ---
    /** Boucles ouvertes attendant MON geste (destinataire résolu côté serveur). */
    getMissionInbox: () => client.GET("/api/missions/inbox", {}),
    /** Boucles ouvertes que j'ai émises — le suivi de mes demandes. */
    getMissionOutbox: () => client.GET("/api/missions/outbox", {}),
    /** Missions d'un incident (couche carte, fiche incident). */
    getMissions: (incidentId?: string, openOnly = false) =>
      client.GET("/api/missions", {
        params: { query: { ...(incidentId ? { incidentId } : {}), ...(openOnly ? { openOnly: true } : {}) } },
      }),
    issueMission: (body: IssueMissionBody) => client.POST("/api/missions", { body }),
    acceptMission: (id: string) => client.POST("/api/missions/{id}/accept", { params: { path: { id } } }),
    declineMission: (id: string, reason: string) =>
      client.POST("/api/missions/{id}/decline", { params: { path: { id } }, body: { reason } }),
    missionMilestone: (id: string, key: "en_route" | "on_site" | "handover") =>
      client.POST("/api/missions/{id}/milestone", { params: { path: { id } }, body: { key } }),
    completeMission: (id: string) => client.POST("/api/missions/{id}/complete", { params: { path: { id } } }),
    cancelMission: (id: string, reason: string) =>
      client.POST("/api/missions/{id}/cancel", { params: { path: { id } }, body: { reason } }),

    // --- capacité NRBC (panache chimique, ADR 0005) ---
    /** Catalogue des substances chimiques (table 1 de l'ERG 2024). */
    getNrbcSubstances: () => client.GET("/api/nrbc/substances", {}),
    /** Panache estimé d'un incident NRBC : référentiels choisis, échéance H+n. */
    getNrbcPlume: (incidentId: string, models: string, hour: number) =>
      client.GET("/api/nrbc/plume/{incidentId}", {
        params: { path: { incidentId }, query: { models, hour: String(hour) } },
      }),
    getWeatherCities: () => client.GET("/api/weather/cities"),
    getWeatherGrid: () => client.GET("/api/weather/grid"),
    // --- crues : Google Flood Hub par le courtier de l'API (ADR 0010) ---
    getFloodStatus: () => client.GET("/api/floods/status"),
    getFloodGauges: () => client.GET("/api/floods/gauges"),
    getFloodForecast: (id: string) => client.GET("/api/floods/gauges/{id}/forecast", { params: { path: { id } } }),
    getFloodPolygon: (id: string) => client.GET("/api/floods/polygons/{id}", { params: { path: { id } } }),
    getWeatherGridWorld: () => client.GET("/api/weather/grid-world"),
    getWeatherForecast: (lat: number, lon: number) =>
      client.GET("/api/weather/forecast", { params: { query: { lat: String(lat), lon: String(lon) } } }),
    getFlags: () => client.GET("/api/flags"),
    setFlag: (key: string, enabled: boolean) => client.PATCH("/api/flags/{key}", { params: { path: { key } }, body: { enabled } }),
    getAudit: (limit = 100) => client.GET("/api/audit", { params: { query: { limit: String(limit) } } }),
    verifyAudit: () => client.GET("/api/audit/verify"),
  };
}

export type ArgosClient = ReturnType<typeof createArgosClient>;
export type { paths } from "./openapi";
