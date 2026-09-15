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
export type CreateIncidentBody = Json<NonNullable<paths["/api/incidents"]["post"]["requestBody"]>>;
export type UpdateIncidentBody = Json<NonNullable<paths["/api/incidents/{id}"]["patch"]["requestBody"]>>;
export type CreateSubIncidentBody = Json<NonNullable<paths["/api/incidents/{id}/sub-incidents"]["post"]["requestBody"]>>;
export type RegisterIncidentTypeBody = Json<NonNullable<paths["/api/incident-types"]["post"]["requestBody"]>>;
export type CreateUnitBody = Json<NonNullable<paths["/api/units"]["post"]["requestBody"]>>;
export type CreateShelterBody = Json<NonNullable<paths["/api/shelters"]["post"]["requestBody"]>>;
/** Postes d'opération sur la carte (lot #12). */
export type CreatePostBody = Json<NonNullable<paths["/api/incidents/{id}/posts"]["post"]["requestBody"]>>;
export type UpdatePostBody = Json<NonNullable<paths["/api/incidents/{id}/posts/{postId}"]["patch"]["requestBody"]>>;
/** Fiche d'une pièce jointe versée — le contenu vit côté serveur (lot COMMS). */
export type CommsAttachment = { id: string; name: string; mime: string; bytes: number };
// Traceurs GPS FMC920 (lot N-2). Le type de la RÉPONSE est exporté aussi : la
// carte et l'écran de gestion lisent la même forme, qui vient du contrat.
export type DeclareTrackerBody = Json<NonNullable<paths["/api/tracking/trackers"]["post"]["requestBody"]>>;
export type UpdateTrackerBody = Json<NonNullable<paths["/api/tracking/trackers/{id}"]["patch"]["requestBody"]>>;
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
    setRoleFeature: (role: ArgosRole, feature: ModuleFeature, enabled: boolean) =>
      client.PATCH("/api/iam/role-features/{role}", { params: { path: { role } }, body: { feature, enabled } }),
    // --- domaine opérationnel (Phase 2) ---
    getIncidents: () => client.GET("/api/incidents"),
    getIncidentTypes: () => client.GET("/api/incident-types"),
    getSubIncidentTypes: () => client.GET("/api/sub-incident-types"),
    registerIncidentType: (body: RegisterIncidentTypeBody) => client.POST("/api/incident-types", { body }),
    addSubIncident: (id: string, body: CreateSubIncidentBody) =>
      client.POST("/api/incidents/{id}/sub-incidents", { params: { path: { id } }, body }),
    removeSubIncident: (id: string, subId: string) =>
      client.DELETE("/api/incidents/{id}/sub-incidents/{subId}", { params: { path: { id, subId } } }),
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
    deployPost: (id: string, matricule: string) =>
      client.POST("/api/incidents/{id}/deployments", { params: { path: { id } }, body: { matricule } }),
    withdrawPost: (id: string, matricule: string) =>
      client.DELETE("/api/incidents/{id}/deployments/{matricule}", { params: { path: { id, matricule } } }),

    updateIncident: (id: string, body: UpdateIncidentBody) => client.PATCH("/api/incidents/{id}", { params: { path: { id } }, body }),
    getUnits: () => client.GET("/api/units"),
    createUnit: (body: CreateUnitBody) => client.POST("/api/units", { body }),
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
