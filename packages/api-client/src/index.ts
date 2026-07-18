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
export type CreateUnitBody = Json<NonNullable<paths["/api/units"]["post"]["requestBody"]>>;
export type CreateHospitalBody = Json<NonNullable<paths["/api/hospitals"]["post"]["requestBody"]>>;

export interface ArgosClientOptions {
  /** Origine de l'API, SANS le préfixe /api (ex. http://localhost:4000). */
  baseUrl: string;
  /** Fournit le jeton porteur courant (ou null si non authentifié). */
  getToken?: () => string | null;
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
    getDashboardStats: () => client.GET("/api/dashboard/stats"),
    createIncident: (body: CreateIncidentBody) => client.POST("/api/incidents", { body }),
    getUnits: () => client.GET("/api/units"),
    createUnit: (body: CreateUnitBody) => client.POST("/api/units", { body }),
    getHospitals: () => client.GET("/api/hospitals"),
    createHospital: (body: CreateHospitalBody) => client.POST("/api/hospitals", { body }),
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
    getFlags: () => client.GET("/api/flags"),
    setFlag: (key: string, enabled: boolean) => client.PATCH("/api/flags/{key}", { params: { path: { key } }, body: { enabled } }),
    getAudit: (limit = 100) => client.GET("/api/audit", { params: { query: { limit: String(limit) } } }),
    verifyAudit: () => client.GET("/api/audit/verify"),
  };
}

export type ArgosClient = ReturnType<typeof createArgosClient>;
export type { paths } from "./openapi";
