"use client";

// Client API ARGOS (contract-first). Le jeton porteur est lu dans sessionStorage
// (posé à la connexion). Base réglable via NEXT_PUBLIC_API_URL.
// Client généré depuis l'OpenAPI ; source canonique dans packages/api-client,
// embarquée ici (copie) pour la compilation du bundle Next.
import { isProfileId, type Assignments, type ProfileId } from "@/lib/roles";
import { createArgosClient } from "@/lib/api-client";

/**
 * Base de l'API. `NEXT_PUBLIC_API_URL` prime toujours ; sinon on vise le port
 * 3005 sur L'HÔTE QUI A SERVI LA PAGE. Figée à 127.0.0.1, la base désignait
 * l'appareil du LECTEUR : depuis un téléphone du réseau local, chaque appel
 * partait vers le téléphone lui-même — d'où « API injoignable » alors que le
 * serveur tournait. (Côté serveur/SSR, repli local — le navigateur recalcule.)
 *
 * `same-origin` : l'API est servie sous l'origine de la page (déploiement
 * derrière le reverse proxy, `/api/...`). La base est alors vide et les
 * chemins du client — qui portent déjà `/api` — sont relatifs : l'image web
 * ne connaît pas l'adresse de la station, et n'a pas à la connaître.
 */
export function apiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured === "same-origin") return "";
  if (configured) return configured;
  return typeof window !== "undefined" ? `http://${window.location.hostname}:3005` : "http://127.0.0.1:3005";
}
export const API_BASE = apiBase();
export const TOKEN_KEY = "argos_token";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

// Purge de session sur 401 (jeton expiré/invalide) — évite de rester bloqué sur
// une coquille vide : on efface la session et on revient à l'écran de connexion.
let unauthorizedHandled = false;
function handleUnauthorized() {
  if (typeof window === "undefined" || unauthorizedHandled) return;
  unauthorizedHandled = true;
  for (const k of ["argos_auth", TOKEN_KEY, "argos_session_user", "argos_session_role", "argos_session_profile"]) {
    sessionStorage.removeItem(k);
  }
  window.location.assign("/");
}

export const api = createArgosClient({
  baseUrl: API_BASE,
  getToken: getStoredToken,
  onUnauthorized: handleUnauthorized,
});

/** Réponse de POST /auth/login (compte géré) — jeton + état du cycle de vie. */
export interface LoginResult {
  access_token: string;
  /** Mode de la session (ADR 0022). */
  profile: string;
  role: string;
  roles: string[];
  nom: string;
  matricule: string;
  photo?: string;
  /** Entités affectées (portée ABAC) — oriente l'interface vers sa responsabilité. */
  assignments?: Assignments;
  mustChangePassword: boolean;
  mustChooseRole: boolean;
}

export type FlagsMap = Record<string, boolean>;
export type RoleFeaturesMap = Record<string, Record<string, boolean>>;

/**
 * Charge le contexte de session après authentification : feature flags et
 * matrice rôle→fonctionnalités. Dégrade proprement (les rôles sans les
 * permissions de lecture conservent les valeurs par défaut du bootstrap).
 */
export interface SessionContext {
  flags?: FlagsMap;
  roleFeatures?: RoleFeaturesMap;
  /** Modules effectifs de CE compte (drapeaux ∧ rôle ∧ compte), servis par `/iam/me` (ADR 0016). */
  myModules?: Record<string, boolean>;
  /** Permissions effectives du compte (`fonctionnalité:action`), servies par `/iam/me`. */
  permissions?: string[];
  /** Mode de la session (ADR 0022), servi par `/iam/me`. */
  profile?: ProfileId;
  /** Mode de la station en service (ADR 0016). */
  appMode?: "demo" | "exercise" | "operational";
}

export async function loadSessionContext(): Promise<SessionContext> {
  const out: SessionContext = {};
  try {
    const me = await api.me();
    const d = me.data as { modules?: Record<string, boolean>; appMode?: SessionContext["appMode"]; permissions?: unknown; profile?: unknown } | undefined;
    if (d?.modules) out.myModules = d.modules;
    if (d?.appMode) out.appMode = d.appMode;
    if (Array.isArray(d?.permissions)) out.permissions = d.permissions.filter((p): p is string => typeof p === "string");
    if (isProfileId(d?.profile)) out.profile = d.profile;
  } catch {
    /* sans réponse, le rôle et les drapeaux décident */
  }
  try {
    const f = await api.getFlags();
    if (f.data) out.flags = f.data as FlagsMap;
  } catch {
    /* rôle sans admin:feature_flags:read → défauts */
  }
  try {
    const rf = await api.getRoleFeatures();
    if (rf.data) out.roleFeatures = rf.data as RoleFeaturesMap;
  } catch {
    /* rôle sans iam:roles:read → défauts */
  }
  return out;
}
