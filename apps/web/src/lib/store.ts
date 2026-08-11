"use client";

// ============================================================================
// ARGOS — store client global (Zustand)
// Regroupe l'état que le prototype gardait dans son Component : session, thème,
// langue, barre latérale, incidents/hôpitaux de campagne/fil, couches et
// sélection de la carte, et centre de communication. L'état serveur (simulé
// aujourd'hui, REST/WS demain) provient de lib/data/seed.ts.
// ============================================================================

import { create } from "zustand";
import type {
  Channel,
  CommCategory,
  CommMessage,
  DashStats,
  FieldHospital,
  FeedItem,
  Hospital,
  City,
  Incident,
  IncidentTypeDef,
  SubIncidentCatalog,
  Lang,
  MapSelection,
  MarkerKind,
  Member,
  Province,
  SeismicAlertConfig,
  SeismicEvent,
  Unit,
  VehRoute,
  WeatherGridSeries,
} from "@/lib/types";
import { pointInMorocco } from "@/lib/map/morocco";
import { hospKind } from "@/lib/hospitals";
import { LANGS, type Dict } from "@/lib/i18n/translations";
import { MODULES, type ModulesDict } from "@/lib/i18n/modules";
import { FEED_POOL } from "@/lib/data/seed";
import type { AiIncidentRow, AiHospitalRow, AiTopEquip, AiAnswerStats, AiCrossBlock, AiSuggestion } from "@/lib/ai/assistant";

/** Présence du centre de communication (interlocuteurs + salle vocale). */
export interface CommMembers {
  online: Member[];
  offline: Member[];
  voice: { n: string; initials: string; av: string; speaking: boolean }[];
}
const EMPTY_MEMBERS: CommMembers = { online: [], offline: [], voice: [] };
import { api, loadSessionContext } from "@/lib/api";
import type { QueueItem, TransportMovement } from "@/lib/data/dispatch";
import { EMPTY_CATALOG, type Catalog } from "@/lib/data/modules";
import type { AiUnitResult } from "@/lib/ai/assistant";
import { AI_DEFAULT_SETTINGS, type AiSettings } from "@/lib/ai/config";
import { DEFAULT_FLAGS } from "@/lib/nav";
import type { Role } from "@/lib/roles";
import { defaultRoleFeatures } from "@/lib/data/users";

const THEME_KEY = "kanban_rdia_theme";
const LANG_KEY = "argos_lang";
const AUTH_KEY = "argos_auth";
const AI_SETTINGS_KEY = "argos_ai_settings";
const FLAGS_KEY = "argos_flags";
const TOKEN_KEY = "argos_token";
const SESSION_USER_KEY = "argos_session_user";
const SESSION_ROLE_KEY = "argos_session_role";

/** Rôle de la session (aligné sur l'API/Keycloak). En production : claim OIDC (§4.3). Défini dans lib/roles. */
export type { Role };

/** Identité de la session courante (pour l'affichage coquille + sélecteur de rôle). */
export interface SessionUser {
  matricule: string;
  nom: string;
  roles: Role[];
  /** Photo de profil (data URL) ; initiales en repli */
  photo?: string;
}

/** Charge utile d'ouverture de session (réponse de /auth/login résolue par l'API). */
export interface SessionInit {
  token: string;
  role: Role;
  sessionUser: SessionUser;
  mustChangePassword: boolean;
  mustChooseRole: boolean;
}

export interface LayerState {
  units: boolean;
  /** Réseau hospitalier militaire (Service de Santé des FAR). */
  hospitals: boolean;
  /** Réseau hospitalier public civil (CHU / CHR / CHP / locaux). */
  hospitalsCiv: boolean;
  incidents: boolean;
  vehicles: boolean;
  field: boolean;
}

interface NavGroups {
  res: boolean;
  dis: boolean;
  cmd: boolean;
}

export interface Engagement {
  id: string;
  unitId: string;
  incidentId: string;
  reason: string;
  /** manière dont l'affectation a été décidée (manuelle vs reco appliquée) */
  via: "manual" | "reco";
  score?: number;
  time: string;
}

/** Entrée du journal de l'assistant IA (audit : chaque échange est tracé, §6.17). */
export interface AiMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: string;
  /** origine de la rédaction : « déterministe » ou l'id du fournisseur LLM */
  provider?: string;
  /** requête Couche 1 réellement exécutée (transparence) */
  layer1?: string;
  units?: AiUnitResult[];
  /** Données structurées renvoyées par la Couche 1 (tableaux sous le markdown */
  incidents?: AiIncidentRow[];
  hospitals?: AiHospitalRow[];
  quakes?: { id: string; region: string; mag: number; depth: number; time: string }[];
  equipment?: AiTopEquip[];
  stats?: AiAnswerStats;
  cross?: AiCrossBlock;
  suggestions?: (string | AiSuggestion)[];
  /** true si cible cette réponse est un refus d'injection détecté côté frontend */
  refused?: boolean;
}

interface ArgosState {
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
  lang: Lang;
  dark: boolean;
  sbOpen: boolean;
  navGroups: NavGroups;
  toast: string | null;
  wizOpen: boolean;
  /** true = la modale Copilot général est ouverte (⌘K / Ctrl+K) */
  copilotOpen: boolean;
  /** Incident en cours d'édition dans l'assistant (null = création). */
  wizEdit: Incident | null;
  /** Coordonnées [lng, lat] pré-remplies quand le wizard est ouvert depuis la carte */
  wizInitLL: [number, number] | null;

  // --- domaine (état serveur, chargé depuis l'API) ---
  incidents: Incident[];
  units: Unit[];
  hospitals: Hospital[];
  fieldHosps: FieldHospital[];
  feed: FeedItem[];
  /** catalogue des modules opérationnels (inventaire, triage, ORSEC, …) depuis l'API */
  catalog: Catalog;
  /** true une fois le domaine chargé depuis l'API (au moins une fois) */
  domainLoaded: boolean;
  /** Catalogue paramétrable des types d'incident (API /incident-types) */
  incidentTypes: IncidentTypeDef[];
  subCatalog: SubIncidentCatalog;
  /** Statistiques de commandement (API /dashboard/stats) */
  dashStats: DashStats | null;
  tick: number;

  // --- flux sismique (EMSC) : partagé par la page /seismologie, la carte et l'alerte globale ---
  quakes: SeismicEvent[];
  /** couche séismes active (carte) + surveillance de l'alerte */
  quakesOn: boolean;
  quakesMinMag: number;
  quakesRegion: "morocco" | "world";
  /** dernier nouveau séisme détecté (déclenche la pop-up d'alerte) ; null = aucune alerte */
  quakeAlert: SeismicEvent | null;
  /** séisme à centrer sur la carte (« voir sur la carte ») ; consommé puis remis à null */
  quakeFocus: SeismicEvent | null;
  /** séisme sélectionné (bandeau de détail flottant sur la carte) ; null = aucun */
  quakeSelected: SeismicEvent | null;
  /** configuration des alertes (seuils + autorités), chargée depuis l'API */
  seisConfig: SeismicAlertConfig | null;

  // --- couches météo de la carte opérationnelle (grille de prévisions 24 h) ---
  wxGrid: WeatherGridSeries | null;
  /** grille mondiale grossière (pas 10°) : couverture planétaire des couches */
  wxWorld: WeatherGridSeries | null;
  /** couches météo actives sur la carte (indépendantes, superposables) */
  wxLayers: { temp: boolean; wind: boolean; precip: boolean };

  // --- sélection de détail ressource / hôpital (partagée avec la carte) ---
  selUnit: string | null;
  selHosp: string | null;

  // --- carte ---
  layers: LayerState;
  map3d: boolean;
  mapSat: boolean;
  selMarker: MapSelection | null;

  // --- communications (depuis l'API) ---
  comCats: CommCategory[];
  comMsgs: Record<string, CommMessage[]>;
  comMembers: CommMembers;
  comSel: string;
  comCollapsed: Record<string, boolean>;

  // --- données de référence (depuis l'API) ---
  provinces: Province[];
  cities: City[];
  vehRoutes: VehRoute[];

  // --- dispatching (Répartiteur) ---
  engagements: Engagement[];
  movements: TransportMovement[];
  queue: QueueItem[];

  // --- assistant IA (journal d'audit) ---
  aiLog: AiMessage[];

  // --- paramètres (Super Admin) ---
  aiSettings: AiSettings;
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
  /** Met à jour l'identité de session après édition du profil (nom, photo). */
  setProfile: (patch: { nom?: string; photo?: string | null }) => void;
  /** Charge les entités de domaine depuis l'API (incidents, unités, hôpitaux, fil). */
  loadDomain: () => Promise<void>;
  /** Recharge les séismes (EMSC) et détecte les nouveaux (→ alerte). */
  loadQuakes: () => Promise<void>;
  loadSeisConfig: () => Promise<void>;
  setSeisConfig: (cfg: SeismicAlertConfig) => void;
  setQuakesOn: (v: boolean) => void;
  setQuakesFilter: (minmag: number, region: "morocco" | "world") => void;
  dismissQuakeAlert: () => void;
  /** Demande le centrage de la carte sur un séisme (active la couche) ; null pour purger. */
  focusQuake: (ev: SeismicEvent | null) => void;
  /** Sélectionne un séisme pour le bandeau de détail (clic sur la carte) ; null ferme. */
  selectQuake: (ev: SeismicEvent | null) => void;
  /** Bascule une couche météo de la carte (charge la grille à la 1re activation). */
  toggleWxLayer: (k: "temp" | "wind" | "precip") => void;
  /** Charge la grille météo (conditions actuelles) depuis l'API. */
  loadWxGrid: () => Promise<void>;
  logout: () => void;
  /** 1er login finalisé (mot de passe posé côté API) → compte actif. */
  completePasswordChange: () => void;
  skipPasswordChange: () => void;
  /** Rôle actif choisi (compte multi-rôles) : nouveau jeton émis par l'API. */
  chooseRole: (token: string, role: Role) => void;
  /** Bascule le rôle actif d'une session multi-rôles SANS déconnexion (nouveau jeton). */
  switchRole: (role: Role) => Promise<boolean>;
  hydratePrefs: () => void;
  setLang: (lang: Lang) => void;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  toggleNavGroup: (g: keyof NavGroups) => void;
  openNavGroup: (g: keyof NavGroups) => void;
  showToast: (msg: string) => void;
  openWizard: (initLL?: [number, number]) => void;
  /** Ouvre l'assistant en mode édition (pré-rempli depuis un incident existant). */
  openWizardEdit: (inc: Incident) => void;
  closeWizard: () => void;
  /** Ouvre/ferme la modale Copilot général (⌘K). */
  openCopilot: () => void;
  closeCopilot: () => void;
  toggleCopilot: () => void;

  toggleLayer: (k: keyof LayerState) => void;
  setMap3d: (v: boolean) => void;
  setMapSat: (v: boolean) => void;
  select: (kind: MarkerKind, id: string) => void;
  clearSelection: () => void;
  setSelUnit: (id: string | null) => void;
  setSelHosp: (id: string | null) => void;

  addIncident: (inc: Incident) => void;
  deployFieldHospital: (h: Hospital) => void;

  selectChannel: (id: string) => void;
  sendMessage: (txt: string) => void;
  addCategory: (name: string) => void;
  addChannel: (catId: string, name: string) => void;
  toggleCategory: (id: string) => void;

  engageUnit: (unitId: string, incidentId: string, reason: string, via: "manual" | "reco", score?: number) => void;
  relieveUnit: (unitId: string) => void;
  resolveQueueItem: (id: string) => void;

  pushAi: (msg: Omit<AiMessage, "id" | "at">) => string;
  updateAi: (id: string, patch: Partial<AiMessage>) => void;
  clearAi: () => void;

  setAiSettings: (patch: Partial<AiSettings>) => void;
  setFlag: (key: string, enabled: boolean) => void;

  simTick: () => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useArgos = create<ArgosState>((set, get) => ({
  authed: false,
  // Démo : la session est Super Admin pour permettre la configuration de la
  // plateforme. En production, le rôle provient des claims OIDC (Keycloak).
  role: "superadmin",
  sessionUser: null,
  mustChangePassword: false,
  mustChooseRole: false,
  token: null,
  apiConnected: false,
  lang: "fr",
  dark: true,
  sbOpen: true,
  navGroups: { res: false, dis: false, cmd: false },
  toast: null,
  wizOpen: false,
  copilotOpen: false,
  wizInitLL: null,
  wizEdit: null,

  incidents: [],
  units: [],
  hospitals: [],
  fieldHosps: [],
  feed: [],
  catalog: EMPTY_CATALOG,
  domainLoaded: false,
  incidentTypes: [],
  subCatalog: { types: [], byParent: {} },
  dashStats: null,
  tick: 0,

  quakes: [],
  quakesOn: true,
  quakesMinMag: 2.5,
  quakesRegion: "world",
  quakeAlert: null,
  seisConfig: null,
  quakeFocus: null,
  quakeSelected: null,

  wxGrid: null,
  wxWorld: null,
  wxLayers: { temp: false, wind: false, precip: false },

  selUnit: null,
  selHosp: null,

  // Le réseau civil (106 établissements) est masqué par défaut : il se
  // rallume d'un clic quand l'opérateur cherche une capacité d'accueil.
  layers: { units: true, hospitals: true, hospitalsCiv: false, incidents: true, vehicles: true, field: true },
  map3d: false,
  mapSat: true,
  selMarker: null,

  comCats: [],
  comMsgs: {},
  comMembers: EMPTY_MEMBERS,
  comSel: "c1",
  comCollapsed: {},

  provinces: [],
  cities: [],
  vehRoutes: [],

  engagements: [],
  movements: [],
  queue: [],

  aiLog: [],
  aiSettings: AI_DEFAULT_SETTINGS,
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
    });
  },

  setSession: (token, role) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(AUTH_KEY, "1");
      sessionStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem(SESSION_ROLE_KEY, role);
    }
    set({ authed: true, apiConnected: true, token, role, mustChangePassword: false, mustChooseRole: false });
  },
  setFlags: (flags) => set({ flags }),
  setRoleFeatures: (rf) => set({ roleFeatures: rf }),
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

  // Charge le domaine depuis l'API. Chaque entité dégrade proprement si le rôle
  // n'a pas la permission de lecture (tableau vide plutôt qu'erreur bloquante).
  loadDomain: async () => {
    const results = await Promise.allSettled([
      api.getIncidents(),
      api.getUnits(),
      api.getHospitals(),
      api.getFieldHospitals(),
      api.getFeed(),
      api.getDispatchQueue(),
      api.getDispatchMovements(),
      api.getCatalog(),
      api.getComms(),
      api.getReference(),
      api.getIncidentTypes(),
      api.getDashboardStats(),
      api.getSubIncidentTypes(),
    ]);
    const data = <T,>(i: number): T | undefined =>
      results[i].status === "fulfilled"
        ? ((results[i] as PromiseFulfilledResult<{ data?: unknown }>).value.data as T | undefined)
        : undefined;
    const comms = data<{ categories: CommCategory[]; messages: Record<string, CommMessage[]>; members: CommMembers }>(8);
    const reference = data<{ provinces: Province[]; cities: City[]; vehRoutes: VehRoute[] }>(9);
    set((s) => ({
      incidents: data<Incident[]>(0) ?? s.incidents,
      units: data<Unit[]>(1) ?? s.units,
      hospitals: data<Hospital[]>(2) ?? s.hospitals,
      fieldHosps: data<FieldHospital[]>(3) ?? s.fieldHosps,
      feed: data<FeedItem[]>(4) ?? s.feed,
      queue: data<QueueItem[]>(5) ?? s.queue,
      movements: data<TransportMovement[]>(6) ?? s.movements,
      catalog: data<Catalog>(7) ?? s.catalog,
      incidentTypes: data<IncidentTypeDef[]>(10) ?? s.incidentTypes,
      dashStats: data<DashStats>(11) ?? s.dashStats,
      subCatalog: data<SubIncidentCatalog>(12) ?? s.subCatalog,
      comCats: comms?.categories ?? s.comCats,
      comMsgs: comms?.messages ?? s.comMsgs,
      comMembers: comms?.members ?? s.comMembers,
      provinces: reference?.provinces ?? s.provinces,
      cities: reference?.cities ?? s.cities,
      vehRoutes: reference?.vehRoutes ?? s.vehRoutes,
      domainLoaded: true,
    }));
  },

  // Recharge les séismes depuis l'API (proxy EMSC) et détecte les nouveaux
  // événements pour déclencher l'alerte globale (hors 1er chargement / couche off).
  loadQuakes: async () => {
    const { quakesMinMag, quakesRegion, quakes: prev, quakesOn, seisConfig } = get();
    const res = await api.getSeismicEvents(quakesMinMag, quakesRegion);
    const list = ((res.data as SeismicEvent[] | undefined) ?? []).filter((q) => Number.isFinite(q.lat) && Number.isFinite(q.lon));
    const firstLoad = prev.length === 0;
    const prevIds = new Set(prev.map((q) => q.id));
    // Seuils d'alerte configurés (Paramètres) : un séisme NATIONAL alerte dès
    // maMinMag (alerte rouge + SMS/e-mail côté serveur), un séisme mondial
    // seulement dès globalMinMag (notification dans l'app). Un séisme national
    // prime toujours sur un mondial détecté au même balayage.
    const maMin = seisConfig?.maMinMag ?? 4.0;
    const glMin = seisConfig?.globalMinMag ?? 5.5;
    const fresh = list.filter(
      (q) => !prevIds.has(q.id) && (pointInMorocco(q.lon, q.lat) ? q.mag >= maMin : q.mag >= glMin),
    );
    const freshMa = fresh.filter((q) => pointInMorocco(q.lon, q.lat));
    const pick = (freshMa.length > 0 ? freshMa : fresh);
    set((s) => ({
      quakes: list,
      quakeAlert:
        quakesOn && !firstLoad && pick.length > 0
          ? pick.reduce((a, b) => (b.mag > a.mag ? b : a))
          : s.quakeAlert,
    }));
  },

  // Configuration des alertes sismiques (chargée une fois, rafraîchie après
  // enregistrement dans les Paramètres).
  loadSeisConfig: async () => {
    try {
      const res = await api.getSeismicAlertConfig();
      const cfg = res.data as SeismicAlertConfig | undefined;
      if (cfg && typeof cfg.maMinMag === "number") set({ seisConfig: cfg });
    } catch {
      // API injoignable : les seuils par défaut restent appliqués.
    }
  },

  setSeisConfig: (cfg) => set({ seisConfig: cfg }),

  setQuakesOn: (v) => set((s) => ({ quakesOn: v, quakeAlert: v ? s.quakeAlert : null })),

  // Changer de filtre repart d'une liste vide : le prochain chargement est traité
  // comme un 1er chargement (pas de fausse alerte sur le changement de périmètre).
  setQuakesFilter: (minmag, region) => set({ quakesMinMag: minmag, quakesRegion: region, quakes: [], quakeAlert: null }),

  dismissQuakeAlert: () => set({ quakeAlert: null }),

  // « Voir sur la carte » : centre (quakeFocus, consommé) + sélectionne pour le
  // bandeau de détail (quakeSelected, persistant) + active la couche séismes.
  focusQuake: (ev) => set((s) => ({ quakeFocus: ev, quakeSelected: ev ?? s.quakeSelected, quakesOn: ev ? true : s.quakesOn })),

  selectQuake: (ev) => set({ quakeSelected: ev }),

  // Grilles météo (nationale dense + mondiale grossière) : chargées
  // paresseusement à la première activation d'une couche. Les deux appels sont
  // INDÉPENDANTS (allSettled) : l'échec de l'un ne prive pas de l'autre, et la
  // carte re-tente périodiquement tant qu'une grille manque.
  loadWxGrid: async () => {
    const [res, resW] = await Promise.allSettled([api.getWeatherGrid(), api.getWeatherGridWorld()]);
    if (res.status === "fulfilled") {
      const g = res.value.data as WeatherGridSeries | undefined;
      if (g && Array.isArray(g.points) && g.points.length > 0) set({ wxGrid: g });
    }
    if (resW.status === "fulfilled") {
      const w = resW.value.data as WeatherGridSeries | undefined;
      if (w && Array.isArray(w.points) && w.points.length > 0) set({ wxWorld: w });
    }
  },

  toggleWxLayer: (k) => {
    const s = get();
    const wxLayers = { ...s.wxLayers, [k]: !s.wxLayers[k] };
    set({ wxLayers });
    // Recharge si L'UNE des deux grilles manque (échec précédent inclus).
    if (wxLayers[k] && (!s.wxGrid || !s.wxWorld)) void get().loadWxGrid();
  },

  logout: () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(AUTH_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(SESSION_USER_KEY);
      sessionStorage.removeItem(SESSION_ROLE_KEY);
    }
    set({ authed: false, apiConnected: false, token: null, sessionUser: null, mustChangePassword: false, mustChooseRole: false });
  },

  // 1er login finalisé côté API (POST /auth/change-password) → compte actif.
  completePasswordChange: () => set({ mustChangePassword: false }),
  skipPasswordChange: () => set({ mustChangePassword: false }),

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
      if (ctx.flags) get().setFlags(ctx.flags);
      if (ctx.roleFeatures) get().setRoleFeatures(ctx.roleFeatures as Record<Role, Record<string, boolean>>);
      return true;
    } catch {
      return false;
    }
  },

  chooseRole: (token, role) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem(SESSION_ROLE_KEY, role);
    }
    set({ token, role, mustChooseRole: false });
  },

  hydratePrefs: () => {
    if (typeof window === "undefined") return;
    const theme = localStorage.getItem(THEME_KEY);
    const dark = (theme || "dark") !== "light";
    const storedLang = localStorage.getItem(LANG_KEY) as Lang | null;
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
    set((s) => ({
      dark,
      lang: storedLang ?? s.lang,
      authed,
      aiSettings,
      flags,
      sessionUser,
      role: storedRole ?? s.role,
    }));
  },

  setAiSettings: (patch) =>
    set((s) => {
      const aiSettings = { ...s.aiSettings, ...patch };
      if (typeof window !== "undefined") localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(aiSettings));
      return { aiSettings };
    }),

  setFlag: (key, enabled) =>
    set((s) => {
      const flags = { ...s.flags, [key]: enabled };
      if (typeof window !== "undefined") localStorage.setItem(FLAGS_KEY, JSON.stringify(flags));
      return { flags };
    }),

  setLang: (lang) => {
    if (typeof window !== "undefined") localStorage.setItem(LANG_KEY, lang);
    set({ lang });
  },

  toggleTheme: () => {
    const dark = !get().dark;
    if (typeof window !== "undefined") {
      localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
      document.documentElement.classList.toggle("dark", dark);
    }
    set({ dark });
  },

  toggleSidebar: () => set((s) => ({ sbOpen: !s.sbOpen })),
  toggleNavGroup: (g) => set((s) => ({ navGroups: { ...s.navGroups, [g]: !s.navGroups[g] } })),
  openNavGroup: (g) => set((s) => ({ sbOpen: true, navGroups: { ...s.navGroups, [g]: true } })),

  showToast: (msg) => {
    clearTimeout(toastTimer);
    set({ toast: msg });
    toastTimer = setTimeout(() => set({ toast: null }), 4000);
  },
  openWizard: (initLL) => set({ wizOpen: true, wizInitLL: initLL ?? null, wizEdit: null }),
  openWizardEdit: (inc) => set({ wizOpen: true, wizInitLL: null, wizEdit: inc }),
  closeWizard: () => set({ wizOpen: false, wizInitLL: null, wizEdit: null }),

  openCopilot: () => set({ copilotOpen: true }),
  closeCopilot: () => set({ copilotOpen: false }),
  toggleCopilot: () => set((s) => ({ copilotOpen: !s.copilotOpen })),

  toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
  setMap3d: (v) => set({ map3d: v }),
  setMapSat: (v) => set({ mapSat: v }),
  select: (kind, id) => set({ selMarker: { kind, id } }),
  clearSelection: () => set({ selMarker: null }),
  setSelUnit: (id) => set({ selUnit: id }),
  setSelHosp: (id) => set({ selHosp: id }),

  addIncident: (inc) =>
    set((s) => {
      const d = new Date();
      const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      return {
        incidents: [inc, ...s.incidents],
        feed: [{ time, c: "bg-danger-500", txt: `${inc.id} — ${inc.titre}` }, ...s.feed].slice(0, 8),
      };
    }),

  deployFieldHospital: (h) =>
    set((s) => {
      const n = s.fieldHosps.filter((f) => f.hid === h.id).length + 1;
      // Le détachement hérite du réseau de son hôpital de rattachement :
      // HMC = hôpital militaire de campagne, HCC = hôpital civil de campagne.
      const mil = hospKind(h) === "mil";
      const entry: FieldHospital = {
        hid: h.id,
        kind: mil ? "mil_field" : "civ_field",
        nom: `${mil ? "HMC" : "HCC"} ${h.ville} — Détachement ${n}`,
        cap: 40,
        occ: 0,
        statut: "partial",
        depuis: "J+0",
        x: h.x + 8 + n * 4,
        y: h.y + 10 + n * 3,
        ll: [h.ll[0] + 0.05 * n, h.ll[1] - 0.04 * n],
      };
      return { fieldHosps: [...s.fieldHosps, entry] };
    }),

  selectChannel: (id) => set({ comSel: id }),

  sendMessage: (txt) => {
    const t = txt.trim();
    if (!t) return;
    const { comSel, comCats, sessionUser } = get();
    let chan: Channel | undefined;
    comCats.forEach((c) => c.chans.forEach((ch) => { if (ch.id === comSel) chan = ch; }));
    if (!chan || chan.kind === "voice") return;
    const d = new Date();
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const nom = sessionUser?.nom ?? "Moi";
    const initials = nom.replace(/^[A-Za-zÀ-ÿ]+\.?\s*/, "").split(/\s+/).map((p) => p[0]?.toUpperCase() ?? "").join("").slice(0, 2) || nom.slice(0, 2).toUpperCase();
    // Ajout optimiste local + persistance via l'API (POST /comms/messages).
    set((s) => ({
      comMsgs: {
        ...s.comMsgs,
        [comSel]: [
          ...(s.comMsgs[comSel] || []),
          { id: Date.now(), who: nom, initials, av: "bg-or-500 text-rdia-600", time, txt: t, mine: true },
        ],
      },
    }));
    void api.sendMessage(comSel, t).catch(() => {});
  },

  // Création persistée côté API, puis resynchronisation des canaux/messages.
  addCategory: (name) => {
    const clean = name.trim();
    if (!clean) return;
    void (async () => {
      const res = await api.createCommCategory(clean);
      if (res.error) return;
      const comms = await api.getComms();
      const d = comms.data as { categories?: CommCategory[] } | undefined;
      if (d?.categories) set({ comCats: d.categories });
    })();
  },

  addChannel: (catId, name) => {
    const slug = name.trim().toLowerCase().replace(/\s+/g, "-");
    if (!slug) return;
    void (async () => {
      const res = await api.createCommChannel(catId, slug);
      const created = res.data as { id?: string } | undefined;
      if (res.error || !created?.id) return;
      const comms = await api.getComms();
      const d = comms.data as { categories?: CommCategory[]; messages?: Record<string, CommMessage[]> } | undefined;
      set((s) => ({
        comCats: d?.categories ?? s.comCats,
        comMsgs: d?.messages ?? s.comMsgs,
        comSel: created.id as string,
      }));
    })();
  },

  toggleCategory: (id) => set((s) => ({ comCollapsed: { ...s.comCollapsed, [id]: !s.comCollapsed[id] } })),

  engageUnit: (unitId, incidentId, reason, via, score) =>
    set((s) => {
      const d = new Date();
      const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      const others = s.engagements.filter((e) => e.unitId !== unitId);
      const eng: Engagement = { id: `ENG-${Date.now()}`, unitId, incidentId, reason, via, score, time };
      return {
        engagements: [eng, ...others],
        feed: [{ time, c: "bg-or-500", txt: `Unité ${unitId} engagée sur ${incidentId}${via === "reco" ? " (reco appliquée)" : ""}` }, ...s.feed].slice(0, 8),
      };
    }),

  relieveUnit: (unitId) => set((s) => ({ engagements: s.engagements.filter((e) => e.unitId !== unitId) })),

  resolveQueueItem: (id) => set((s) => ({ queue: s.queue.filter((q) => q.id !== id) })),

  pushAi: (msg) => {
    const d = new Date();
    const at = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const id = `AI-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({ aiLog: [...s.aiLog, { ...msg, id, at }] }));
    return id;
  },
  updateAi: (id, patch) => set((s) => ({ aiLog: s.aiLog.map((mo) => (mo.id === id ? { ...mo, ...patch } : mo)) })),
  clearAi: () => set({ aiLog: [] }),

  simTick: () =>
    set((s) => {
      let feed = s.feed;
      if (s.tick > 0 && s.tick % 6 === 0) {
        const item = FEED_POOL[Math.floor(s.tick / 6) % FEED_POOL.length];
        const d = new Date();
        const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        feed = [{ time, c: item.c, txt: item.txt }, ...s.feed].slice(0, 8);
      }
      // Fait progresser les mouvements de transport vers leur destination.
      const movements = s.movements.map((mv) =>
        mv.progress >= 100 ? mv : { ...mv, progress: Math.min(100, mv.progress + 1), etaMin: Math.max(0, mv.etaMin - 1) },
      );
      return { tick: s.tick + 1, feed, movements };
    }),
}));

/** Hook pratique : dictionnaire courant pour la langue active. */
export function useDict(): Dict {
  const lang = useArgos((s) => s.lang);
  return LANGS[lang];
}

/** Chaînes des modules pour la langue active (modules opérationnels). */
export function useModules(): ModulesDict {
  const lang = useArgos((s) => s.lang);
  return MODULES[lang];
}

// Accès console en développement UNIQUEMENT (tests manuels : simuler une
// alerte sismique, inspecter l'état). Jamais exposé en production.
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  (window as unknown as { __argos?: typeof useArgos }).__argos = useArgos;
}
