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
export type CreateHospitalBody = Json<NonNullable<paths["/api/hospitals"]["post"]["requestBody"]>>;
export type UpdateHospitalBody = Json<NonNullable<paths["/api/hospitals/{id}"]["patch"]["requestBody"]>>;
export type UpdateUnitBody = Json<NonNullable<paths["/api/units/{id}"]["patch"]["requestBody"]>>;
export type UpdateShelterBody = Json<NonNullable<paths["/api/shelters/{id}"]["patch"]["requestBody"]>>;
export type UpdateMorgueBody = Json<NonNullable<paths["/api/morgues/{id}"]["patch"]["requestBody"]>>;
export type AdmitBodyBody = Json<NonNullable<paths["/api/morgues/{id}/records"]["post"]["requestBody"]>>;
export type UpdateRecordBody = Json<NonNullable<paths["/api/morgues/{id}/records/{rid}"]["patch"]["requestBody"]>>;
export type CreateEquipBody = Json<NonNullable<paths["/api/equipment-parks/{id}/items"]["post"]["requestBody"]>>;
export type UpdateEquipBody = Json<NonNullable<paths["/api/equipment-parks/{id}/items/{eid}"]["patch"]["requestBody"]>>;
export type CreateWardBody = Json<NonNullable<paths["/api/hospitals/{id}/wards"]["post"]["requestBody"]>>;
export type UpdateWardBody = Json<NonNullable<paths["/api/hospitals/{id}/wards/{wid}"]["patch"]["requestBody"]>>;

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
    createIncident: (body: CreateIncidentBody) => client.POST("/api/incidents", { body }),
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
    sendMessage: (channelId: string, txt: string) => client.POST("/api/comms/messages", { body: { channelId, txt } }),
    createCommCategory: (name: string) => client.POST("/api/comms/categories", { body: { name } }),
    createCommChannel: (categoryId: string, name: string) => client.POST("/api/comms/channels", { body: { categoryId, name } }),
    getReference: () => client.GET("/api/reference"),
    getSeismicEvents: (minmag = 2.5, region: "morocco" | "world" = "world") =>
      client.GET("/api/seismic/events", { params: { query: { minmag: String(minmag), region } } }),
    getSeismicAlertConfig: () => client.GET("/api/seismic/alert-config"),
    updateSeismicAlertConfig: (body: { maMinMag: number; globalMinMag: number; contacts: { name: string; phone: string; email: string }[] }) =>
      client.PATCH("/api/seismic/alert-config", { body }),
    getSeismicNotifications: () => client.GET("/api/seismic/notifications"),
    getWeatherCities: () => client.GET("/api/weather/cities"),
    getWeatherGrid: () => client.GET("/api/weather/grid"),
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
