"use client";

// Client API ARGOS (contract-first). Le jeton porteur est lu dans sessionStorage
// (posé à la connexion). Base réglable via NEXT_PUBLIC_API_URL.
// Client généré depuis l'OpenAPI ; source canonique dans packages/api-client,
// embarquée ici (copie) pour la compilation du bundle Next.
import { createArgosClient } from "@/lib/api-client";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3005";
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
  for (const k of ["argos_auth", TOKEN_KEY, "argos_session_user", "argos_session_role"]) {
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
  role: string;
  roles: string[];
  nom: string;
  matricule: string;
  photo?: string;
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
export async function loadSessionContext(): Promise<{ flags?: FlagsMap; roleFeatures?: RoleFeaturesMap }> {
  const out: { flags?: FlagsMap; roleFeatures?: RoleFeaturesMap } = {};
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
