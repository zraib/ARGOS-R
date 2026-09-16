// ============================================================================
// lib/store/slices/session.ts — session, jeton, rôle actif, drapeaux et matrice rôle→fonctionnalités
//
// Tranche du magasin Zustand. `set`/`get` portent sur l'état COMPLET
// (ArgosState) : une tranche peut lire les autres, jamais les importer.
// ============================================================================

import type { StateCreator } from "zustand";
import type { ArgosState } from "@/lib/store";
import type {
  Lang,
  } from "@/lib/types";
import { api, loadSessionContext, type SessionContext } from "@/lib/api";
import { AI_DEFAULT_SETTINGS } from "@/lib/ai/config";
import { DEFAULT_FLAGS } from "@/lib/nav";
import type { Role } from "@/lib/roles";
import { defaultRoleFeatures } from "@/lib/data/users";
import {
  THEME_KEY,
  LANG_KEY,
  AUTH_KEY,
  AI_SETTINGS_KEY,
  FLAGS_KEY,
  TOKEN_KEY,
  SESSION_USER_KEY,
  SESSION_ROLE_KEY,
  SOUNDS_KEY,
  DEFAULT_SOUNDS,
  loadAiLogFor,
  SessionUser,
  SessionInit,
  SoundPrefs,
  } from "@/lib/store/shared";

export interface SessionSlice {
  // --- session / coquille ---
  authed: boolean;
  /** rôle actif (pour les gardes UI) ; en multi-rôles, celui choisi à la connexion */
  role: Role;
  /** identité du compte connecté (null pour un login API/démo hors registre) */
  sessionUser: SessionUser | null;
  /** 1er login non finalisé : l'utilisateur doit poser son mot de passe */
  mustChangePassword: boolean;
  /** compte multi-rôles : l'utilisateur doit choisir un rôle pour la session */
  mustChooseRole: boolean;
  /** JWT courant (mode API) ; null en mode démo hors-ligne */
  token: string | null;
  /** true si la session provient de l'API (JWT réel), false en démo */
  apiConnected: boolean;
  /** feature flags par module (§6.15) */
  flags: Record<string, boolean>;
  // --- IAM : matrice rôle→fonctionnalités (chargée depuis l'API, pilote la nav) ---
  /** fonctionnalités (modules) autorisées par rôle — source de vérité : API */
  roleFeatures: Record<Role, Record<string, boolean>>;
  // --- actions ---
  /** Ouvre la session depuis la réponse de l'API (/auth/login). */
  beginSession: (init: SessionInit) => void;
  setSession: (token: string, role: Role) => void;
  setFlags: (flags: Record<string, boolean>) => void;
  setRoleFeatures: (rf: Record<Role, Record<string, boolean>>) => void;
  /** Modules effectifs du compte connecté (drapeaux ∧ rôle ∧ compte, ADR 0016) ; `null` tant que l'API n'a pas répondu. */
  myModules: Record<string, boolean> | null;
  /** Mode de la station (ADR 0016) : décide de ce qui est simulé et de qui crée quoi. */
  appMode: "demo" | "exercise" | "operational" | null;
  /** Applique d'un coup le contexte de session (drapeaux, matrice, modules du compte, mode). */
  applySessionContext: (ctx: SessionContext) => void;
  /** Met à jour l'identité de session après édition du profil (nom, photo). */
  setProfile: (patch: { nom?: string; photo?: string | null }) => void;
  logout: () => void;
  /** 1er login finalisé (mot de passe posé côté API) → compte actif. */
  completePasswordChange: () => void;
  skipPasswordChange: () => void;
  /** Rôle actif choisi (compte multi-rôles) : nouveau jeton émis par l'API. */
  chooseRole: (token: string, role: Role) => void;
  /** Bascule le rôle actif d'une session multi-rôles SANS déconnexion (nouveau jeton). */
  switchRole: (role: Role) => Promise<boolean>;
  hydratePrefs: () => void;
  setFlag: (key: string, enabled: boolean) => void;
}

export const createSessionSlice: StateCreator<ArgosState, [], [], SessionSlice> = (set, get) => ({
  authed: false,
  // Démo : la session est Super Admin pour permettre la configuration de la
  // plateforme. En production, le rôle provient des claims OIDC (Keycloak).
  role: "superadmin",
  sessionUser: null,
  mustChangePassword: false,
  mustChooseRole: false,
  token: null,
  apiConnected: false,
  flags: DEFAULT_FLAGS,
  roleFeatures: defaultRoleFeatures(),
  // Ouvre la session à partir de la réponse de l'API (/auth/login). La persistance
  // se limite au jeton + à l'identité de session (aucune donnée de domaine locale).
  beginSession: (init) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(AUTH_KEY, "1");
      sessionStorage.setItem(TOKEN_KEY, init.token);
      sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(init.sessionUser));
      sessionStorage.setItem(SESSION_ROLE_KEY, init.role);
    }
    set({
      authed: true,
      apiConnected: true,
      token: init.token,
      role: init.role,
      sessionUser: init.sessionUser,
      mustChangePassword: init.mustChangePassword,
      mustChooseRole: init.mustChooseRole,
      // Séparateur inter-comptes : CHAQUE utilisateur voit SON historique
      // Copilot (et personne d'autre). Si le compte n'a pas encore utilisé
      // le Copilot → [], c'est un chat NEUF, pas l'historique du précédent.
      aiLog: loadAiLogFor(init.sessionUser?.matricule),
    });
  },
  setSession: (token, role) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(AUTH_KEY, "1");
      sessionStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem(SESSION_ROLE_KEY, role);
    }
    // Pas de sessionUser précisée ici : on charge l'historique du compte déjà
    // en mémoire (ou demo) pour préserver la continuité du chat en cours.
    set({
      authed: true,
      apiConnected: true,
      token,
      role,
      mustChangePassword: false,
      mustChooseRole: false,
      aiLog: loadAiLogFor(get().sessionUser?.matricule),
    });
  },
  setFlags: (flags) => set({ flags }),
  setRoleFeatures: (rf) => set({ roleFeatures: rf }),
  myModules: null,
  appMode: null,
  applySessionContext: (ctx) =>
    set((s) => ({
      flags: ctx.flags ?? s.flags,
      roleFeatures: (ctx.roleFeatures as Record<Role, Record<string, boolean>> | undefined) ?? s.roleFeatures,
      myModules: ctx.myModules ?? s.myModules,
      appMode: ctx.appMode ?? s.appMode,
    })),
  setProfile: (patch) =>
    set((s) => {
      if (!s.sessionUser) return {};
      const sessionUser: SessionUser = {
        ...s.sessionUser,
        ...(patch.nom !== undefined ? { nom: patch.nom } : {}),
        ...(patch.photo !== undefined ? { photo: patch.photo ?? undefined } : {}),
      };
      if (typeof window !== "undefined") sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(sessionUser));
      return { sessionUser };
    }),
  logout: () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(AUTH_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(SESSION_USER_KEY);
      sessionStorage.removeItem(SESSION_ROLE_KEY);
    }
    // Lors d'une déconnexion : le Copilot revient à un historique NEUF.
    // L'historique du compte qui s'en va reste préservé dans sa clé dédiée
    // (ré-hydraté au prochain login du même compte).
    set({
      authed: false,
      apiConnected: false,
      myModules: null,
      token: null,
      sessionUser: null,
      mustChangePassword: false,
      mustChooseRole: false,
      aiLog: [],
    });
  },
  // 1er login finalisé côté API (POST /auth/change-password) → compte actif.
  completePasswordChange: () => set({ mustChangePassword: false }),
  skipPasswordChange: () => set({ mustChangePassword: false }),
  chooseRole: (token, role) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem(SESSION_ROLE_KEY, role);
    }
    set({ token, role, mustChooseRole: false });
  },
  // Rôle actif choisi (compte multi-rôles) : l'API a émis un nouveau jeton.
  // Changement de rôle À CHAUD : l'API ré-émet un jeton portant le rôle choisi
  // (POST /auth/select-role), puis le contexte (flags, fonctionnalités par
  // rôle) est rechargé — aucune déconnexion nécessaire.
  switchRole: async (role) => {
    try {
      const res = await api.selectRole(role);
      const token = (res.data as { access_token?: string } | undefined)?.access_token;
      if (!token) return false;
      get().chooseRole(token, role);
      const ctx = await loadSessionContext();
      get().applySessionContext(ctx);
      return true;
    } catch {
      return false;
    }
  },
  hydratePrefs: () => {
    if (typeof window === "undefined") return;
    const theme = localStorage.getItem(THEME_KEY);
    const dark = (theme || "dark") !== "light";
    const storedLang = localStorage.getItem(LANG_KEY) as Lang | null;
    if (storedLang && storedLang !== "fr") get().setLang(storedLang);
    // La session survit au rafraîchissement/navigation dans l'onglet (porte de démo ; pas un jeton).
    const authed = sessionStorage.getItem(AUTH_KEY) === "1";
    // Réglages LLM persistés (page Paramètres, Super Admin).
    let aiSettings = AI_DEFAULT_SETTINGS;
    try {
      const raw = localStorage.getItem(AI_SETTINGS_KEY);
      if (raw) aiSettings = { ...AI_DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      /* réglages illisibles → défauts */
    }
    let flags = DEFAULT_FLAGS;
    try {
      const raw = localStorage.getItem(FLAGS_KEY);
      if (raw) flags = { ...DEFAULT_FLAGS, ...JSON.parse(raw) };
    } catch {
      /* flags illisibles → défauts */
    }
    // Préférences sonores du poste : tout activé tant que rien n'a été coupé.
    let sounds: SoundPrefs = DEFAULT_SOUNDS;
    try {
      const raw = localStorage.getItem(SOUNDS_KEY);
      if (raw) sounds = { ...DEFAULT_SOUNDS, ...JSON.parse(raw) };
    } catch {
      /* préférences illisibles → défauts */
    }
    document.documentElement.classList.toggle("dark", dark);
    // Restaure l'identité de session depuis sessionStorage (jeton + profil).
    // Les fonctionnalités par rôle et les flags sont rechargés depuis l'API par
    // AppFrame ; ici on ne fait que réhydrater l'identité pour l'affichage.
    const storedRole = sessionStorage.getItem(SESSION_ROLE_KEY) as Role | null;
    let sessionUser: SessionUser | null = null;
    try {
      const raw = sessionStorage.getItem(SESSION_USER_KEY);
      if (raw) sessionUser = JSON.parse(raw) as SessionUser;
    } catch {
      /* profil illisible → sera rechargé via /iam/me */
    }
    // Historique Copilot du COMPTE CONNECTÉ uniquement (isolation inter-comptes).
    // Au F5 on retrouve SON chat, personne d'autre. Si nouveau compte : [].
    const aiLog = loadAiLogFor(sessionUser?.matricule);
    set((s) => ({
      dark,
      authed,
      aiSettings,
      flags,
      sounds,
      sessionUser,
      role: storedRole ?? s.role,
      aiLog,
    }));
  },
  setFlag: (key, enabled) =>
    set((s) => {
      const flags = { ...s.flags, [key]: enabled };
      if (typeof window !== "undefined") localStorage.setItem(FLAGS_KEY, JSON.stringify(flags));
      return { flags };
    }),
});
