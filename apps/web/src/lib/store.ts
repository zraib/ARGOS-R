"use client";

// ============================================================================
// ARGOS — store client global (Zustand)
// Regroupe l'état que le prototype gardait dans son Component : session, thème,
// langue, barre latérale, incidents/hôpitaux de campagne/fil, couches et
// sélection de la carte, et centre de communication. L'état serveur (simulé
// aujourd'hui, REST/WS demain) provient de lib/data/seed.ts.
// ============================================================================

import { create } from "zustand";
import { openRealtimeStream, type StreamHandle } from "@/lib/realtime/stream";
import type {
  Channel,
  CommCategory,
  CommMessage,
  PresenceUser,
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
  AircraftRole,
  TrackedAircraftState,
  Mission,
  MissionMilestoneKey,
  NrbcPlume,
  NrbcSubstance,
  Unit,
  VehRoute,
  WeatherGridSeries,
} from "@/lib/types";
import { pointInMorocco } from "@/lib/map/morocco";
import { hospKind } from "@/lib/hospitals";
import type { Dict } from "@/lib/i18n/translations";
import type { ModulesDict } from "@/lib/i18n/modules";
import { FR_DICT } from "@/lib/i18n/translations.fr";
import { FR_MODULES } from "@/lib/i18n/modules.fr";
import { loadLangResources } from "@/lib/i18n/loader";
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
import { AI_DEFAULT_SETTINGS, type AiSettings, resolveProvider, type LlmProviderConfig } from "@/lib/ai/config";
import { DEFAULT_FLAGS } from "@/lib/nav";
import type { Assignments, Role } from "@/lib/roles";
import { defaultRoleFeatures } from "@/lib/data/users";
import type { RiskPrediction } from "@/lib/ai/risk/types";
import type { SituationalAwareness } from "@/lib/ai/situational/types";

const THEME_KEY = "kanban_rdia_theme";
const LANG_KEY = "argos_lang";
const AUTH_KEY = "argos_auth";
const AI_SETTINGS_KEY = "argos_ai_settings";
const FLAGS_KEY = "argos_flags";
const TOKEN_KEY = "argos_token";
const SESSION_USER_KEY = "argos_session_user";
const SESSION_ROLE_KEY = "argos_session_role";
/**
 * Historique Copilot · ségrégé PAR UTILISATEUR.
 *
 * Chaque compte possède son propre journal ; personne ne voit les échanges
 * d'un autre. La clé porte le matricule du compte connecté pour garantir
 * l'isolation inter-comptes (§ RGPD/journalisation audit).
 *
 * - Persistance : localStorage (survit F5 et fermeture de l'onglet)
 * - Format clé : argos_ai_log_<matricule>
 * - Compte « démo » / hors session : argos_ai_log_demo
 */
const AI_LOG_PREFIX = "argos_ai_log_";
function aiLogKey(matricule: string | null | undefined): string {
  return `${AI_LOG_PREFIX}${matricule ?? "demo"}`;
}
function loadAiLogFor(userId: string | null | undefined): AiMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(aiLogKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AiMessage[]) : [];
  } catch {
    return [];
  }
}
function saveAiLogFor(userId: string | null | undefined, log: AiMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(aiLogKey(userId), JSON.stringify(log));
  } catch {
    /* quota exceeded : on ignore */
  }
}
function clearAiLogFor(userId: string | null | undefined): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(aiLogKey(userId));
  } catch {
    /* */
  }
}

/**
 * Prédictions risques depuis l'API (F-04, branche fusion).
 *
 * Le moteur déterministe tourne désormais côté serveur, UNE fois pour tous les
 * postes, sur les données faisant foi — au lieu de N recalculs dans N
 * navigateurs. Le client ne fait plus que charger le résultat. L'estampille
 * `origin` reste posée ici, à l'identique de l'ancien comportement.
 */
async function fetchRiskPredictions(): Promise<RiskPrediction[]> {
  const res = await api.getDashboardRisk();
  const env = res.data as { predictions?: RiskPrediction[] } | undefined;
  return (env?.predictions ?? []).map((p) => ({ ...p, origin: "deterministic" as const }));
}

/** Rôle de la session (aligné sur l'API/Keycloak). En production : claim OIDC (§4.3). Défini dans lib/roles. */
export type { Role };

/** Identité de la session courante (pour l'affichage coquille + sélecteur de rôle). */
export interface SessionUser {
  matricule: string;
  nom: string;
  roles: Role[];
  /**
   * Entités affectées (portée ABAC), servies par l'API à la connexion.
   * Sert UNIQUEMENT à orienter l'interface vers la bonne responsabilité ; le
   * cantonnement réel est appliqué par l'API (ScopeGuard).
   */
  assignments?: Assignments;
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
  /** Réseau hospitalier militaire (service de santé militaire). */
  hospitals: boolean;
  /** Réseau hospitalier public civil (CHU / CHR / CHP / locaux). */
  hospitalsCiv: boolean;
  incidents: boolean;
  vehicles: boolean;
  field: boolean;
  /** Aéronefs inscrits au suivi (bombardiers d'eau, hélicoptères…). */
  aircraft: boolean;
  /** Boucles opérationnelles : liens unité → incident des ordres en cours. */
  missions: boolean;
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
  /** true si réponse = Couche 1 (regex/ARGOS data) ET Couche 2 a échoué (erreur LLM) */
  deterministic?: boolean;
  /** Si couche 2 a échoué : cause courte lisible (sans JSON brut) */
  llmError?: string;
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
  /**
   * Dictionnaires de la langue ACTIVE, portés par l'état (F-11).
   *
   * Seul le français est lié statiquement ; les autres langues arrivent par
   * import dynamique à la bascule. `setLang` committe dictionnaire ET langue
   * dans un même set() : `dir="rtl"` ne peut donc jamais s'appliquer avant
   * l'arrivée des libellés arabes.
   */
  dict: Dict;
  modulesDict: ModulesDict;
  dark: boolean;
  sbOpen: boolean;
  /**
   * Tiroir de navigation MOBILE (< lg), distinct de `sbOpen`.
   *
   * Sur grand écran, `sbOpen` replie la barre latérale sans jamais la masquer.
   * Sur mobile il n'y a pas la place : la navigation devient un tiroir posé
   * PAR-DESSUS le contenu, fermé par défaut. Deux états séparés, car un
   * opérateur qui replie sa barre au bureau ne doit pas retrouver son tiroir
   * ouvert sur téléphone.
   */
  navOpen: boolean;
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
  /** incident à centrer sur la carte (même pattern que quakeFocus) ; consommé puis remis à null */
  incidentFocus: Incident | null;
  /** incrémentée à chaque demande focusIncident, utilisée par MapCanvas pour détecter un focus arrivé avant son mount */
  incidentFocusAt: number;
  /** centrage générique carte : demandé par un composant (Copilot) ; consommé par MapCanvas puis remis à null */
  mapCenterRequest: { ll: [number, number]; zoom: number; at: number; label?: string } | null;
  /** séisme sélectionné (bandeau de détail flottant sur la carte) ; null = aucun */
  quakeSelected: SeismicEvent | null;
  /** configuration des alertes (seuils + autorités), chargée depuis l'API */
  seisConfig: SeismicAlertConfig | null;

  // --- missions : la boucle fermée (ADR 0007) ---
  /** Boucles ouvertes attendant MON geste — alimente « Ordres reçus ». */
  missionInbox: Mission[];
  /** Boucles ouvertes que j'ai émises — suivi côté répartiteur. */
  missionOutbox: Mission[];
  /** Vrai pendant un geste de boucle, pour désarmer les boutons. */
  missionBusy: boolean;
  /**
   * Demandes de moyens OUVERTES, toutes entités confondues — la file
   * montante du répartiteur (lot P2-a). Distinctes de l'inbox : une demande
   * concerne la conduite dans son ensemble, pas une personne nommée.
   */
  resourceRequests: Mission[];

  // --- niveau d'alerte et comptes rendus (lot P3) ---
  /** Niveau d'alerte national, servi par l'API (plus une constante figée). */
  alertLevel: 1 | 2 | 3 | 4;
  /** Entités en retard de compte rendu — le silence rendu visible. */
  sitrepMissing: { entityKind: string; entityId: string; nom: string; lastAt: string | null; overdueMin: number }[];
  /** Cadence attendue en minutes, dérivée du niveau d'alerte. */
  sitrepCadenceMin: number;

  // --- capacité NRBC : catalogue de substances + panache carte (ADR 0005) ---
  /** Catalogue des substances chimiques (API /nrbc/substances), chargé au besoin. */
  nrbcSubstances: NrbcSubstance[];
  /** Incident dont le panache est affiché sur la carte ; null = couche éteinte. */
  plumeIncidentId: string | null;
  /** Référentiels sélectionnés — combinables (le premier actif est le « primaire »). */
  plumeModels: { atp45: boolean; erg: boolean };
  /** Enveloppe prudente : toutes les zones remplies (plus de hiérarchie visuelle). */
  plumeEnvelope: boolean;
  /** Échéance affichée : H+0 … H+6 (heures de prévision). */
  plumeHour: number;
  /** Dernier panache reçu de l'API — consommé par MapCanvas et le panneau. */
  plumeData: NrbcPlume | null;
  /**
   * Les 7 échéances PRÉ-CHARGÉES (H+0…H+6) — la lecture animée interpole
   * entre elles. Sans préchargement, chaque pas déclencherait un aller-retour
   * réseau et l'animation saccaderait (lot V1).
   */
  plumeSteps: (NrbcPlume | null)[];
  /** Lecture en cours : le panache défile dans le temps. */
  plumePlaying: boolean;
  /** Rendu volumique : nappe 3D quand la carte est inclinée (lot V2). */
  plume3d: boolean;
  /**
   * Nappe de fumée animée (lot N-4) plutôt que le remplissage géométrique.
   * Le CONTOUR du gabarit reste tracé dans les deux cas : on voit le nuage, et
   * la ligne sur laquelle on pose le barrage.
   */
  plumeSmoke: boolean;
  /**
   * Zone de VIGILANCE affichée (le grand cercle jaune de l'ATP-45).
   *
   * L'ATP-45 la trace quand le vent est trop faible ou trop variable pour
   * désigner un secteur : elle couvre 10 km dans TOUTES les directions. À
   * l'échelle d'une ville elle recouvre tout le reste, et le commandement qui
   * travaille sur la zone d'isolement veut pouvoir la retirer sans perdre le
   * panache. C'est un choix d'AFFICHAGE : le modèle, lui, continue de la
   * calculer, et la retirer de l'écran ne la retire pas de la doctrine.
   */
  plumeVigilance: boolean;
  plumeBusy: boolean;

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
  // --- temps réel (lot COMMS) ---
  /** Comptes RÉELLEMENT connectés : la présence est la connexion, pas un drapeau. */
  rtOnline: PresenceUser[];
  rtStatus: "connecting" | "open" | "closed";
  /** Non-lus par canal — remis à zéro quand le canal est ouvert à l'écran. */
  rtUnread: Record<string, number>;
  /** Canal actuellement affiché ; ses messages ne comptent jamais comme non lus. */
  rtActiveChannel: string | null;
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

  // --- Module IA Prédictions Risques ---
  /** Prédictions calculées par computeRiskPredictions ou IA LLM (100% réel, 0 invention). Triées score décroissant. */
  riskPredictions: RiskPrediction[];
  /** true = module activé (feature flag). Toggleable par Super Admin dans settings. */
  riskModuleOn: boolean;
  /** Moteur actuellement utilisé : poids déterministes OU inférence modèle IA local (Ollama/vLLM). */
  riskEngine: "deterministic" | "ai_model";
  /** Nom du modèle IA qui a généré la dernière prédiction (si origin=ai_model). */
  riskAIModel?: string;
  /** Erreur LLM (affichée dans RiskPanel) quand fallback vers déterministe. */
  riskAIError?: string;
  /** true = IA en cours d'inférence (spinner UI RiskPanel). */
  riskLoadingAI: boolean;

  // --- Module IA Conscience Situationnelle ---
  situationalAwareness: SituationalAwareness | null;
  situationalLoadingAI: boolean;
  situationalModel?: string;

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
  // --- suivi aérien : aéronefs inscrits + positions ---
  /** Aéronefs inscrits, enrichis de leur position quand le flux les voit. */
  aircraft: TrackedAircraftState[];
  /** Fournisseur de positions en service (« OpenSky Network », « Exercice… »). */
  aircraftFeed: string;
  /** Vrai pendant une inscription/suppression, pour désarmer les boutons. */
  aircraftBusy: boolean;
  /** Dernière erreur de saisie, affichée sous le formulaire ; null = aucune. */
  aircraftError: string | null;
  loadAircraft: () => Promise<void>;
  addAircraft: (input: { code: string; label: string; role: AircraftRole }) => Promise<boolean>;
  removeAircraft: (id: string) => Promise<void>;
  // --- missions ---
  /** Recharge inbox + outbox (appelé au tick de la coquille). */
  loadMissions: () => Promise<void>;
  /** Recharge le niveau d'alerte et les comptes rendus manquants. */
  loadPosture: () => Promise<void>;
  /** Publie un compte rendu pour son entité. */
  publishSitrep: (input: {
    entityKind: "hospital" | "unit" | "shelter" | "morgue";
    entityId: string;
    state: "nominal" | "strained" | "overwhelmed";
    needs?: string;
    nextPoint?: string;
  }) => Promise<boolean>;

  /** Demander un moyen depuis son entité — entre dans la file du répartiteur. */
  requestResource: (input: {
    incidentId: string;
    label: string;
    capability: string;
    urgency: "low" | "medium" | "high";
  }) => Promise<boolean>;

  /** Accepter / refuser / jalonner / clore / annuler — recharge ensuite. */
  actOnMission: (
    id: string,
    action: "accept" | "decline" | "milestone" | "complete" | "cancel",
    arg?: string,
  ) => Promise<boolean>;

  // --- capacité NRBC ---
  /** Charge le catalogue de substances une seule fois (idempotent). */
  ensureNrbcSubstances: () => Promise<void>;
  /** Active le panache d'un incident sur la carte et lance son chargement. */
  showPlume: (incidentId: string) => void;
  hidePlume: () => void;
  setPlumeModels: (patch: Partial<{ atp45: boolean; erg: boolean }>) => void;
  setPlumeEnvelope: (v: boolean) => void;
  setPlumeHour: (h: number) => void;
  /** Précharge les 7 échéances pour permettre la lecture animée (V1). */
  loadPlumeSteps: () => Promise<void>;
  /** Démarre / arrête la lecture animée du panache. */
  setPlumePlaying: (v: boolean) => void;
  /** Bascule le rendu volumique (nappe 3D). */
  setPlume3d: (v: boolean) => void;
  setPlumeSmoke: (v: boolean) => void;
  setPlumeVigilance: (v: boolean) => void;

  /** (Re)charge le panache selon l'état courant (incident, modèles, échéance). */
  loadPlume: () => Promise<void>;
  loadQuakes: () => Promise<void>;
  loadSeisConfig: () => Promise<void>;
  setSeisConfig: (cfg: SeismicAlertConfig) => void;
  setQuakesOn: (v: boolean) => void;
  setQuakesFilter: (minmag: number, region: "morocco" | "world") => void;
  dismissQuakeAlert: () => void;
  /** Demande le centrage de la carte sur un séisme (active la couche) ; null pour purger. */
  focusQuake: (ev: SeismicEvent | null) => void;
  /** Demande le centrage de la carte sur un incident (active la couche incidents) ; null pour purger. */
  focusIncident: (inc: Incident | null) => void;
  /** Demande un centrage générique de la carte (ex: zone géographique). Consommé par MapCanvas. null = purge. */
  setMapCenter: (ll: [number, number] | null, zoom?: number, label?: string) => void;
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
  toggleNav: () => void;
  closeNav: () => void;
  toggleNavGroup: (g: keyof NavGroups) => void;
  openNavGroup: (g: keyof NavGroups) => void;
  showToast: (msg: string) => void;
  // --- temps réel (lot COMMS) ---
  /** Ouvre le flux. Idempotent : appelée à chaque montage de la coquille. */
  rtConnect: () => void;
  rtDisconnect: () => void;
  /** Marque le canal ouvert à l'écran et solde ses non-lus. */
  rtSetActiveChannel: (id: string | null) => void;
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
  /** Mise à jour locale optimiste d'un hôpital (services, capacités…) */
  patchHospital: (id: string, patch: Partial<Hospital>) => void;

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

  // --- Module IA Prédictions Risques ---
  /** Force un recalcul COMPLET des prédictions (après loadDomain, addIncident, deployFieldHospital). */
  recomputeRiskPredictions: () => void;
  /** Valide une prédiction par un opérateur humain (obligatoire per spec). */
  validateRiskPrediction: (id: string, validator?: string) => void;
  /** Ignore/masque une prédiction (considérée non pertinente par l'opérateur). */
  dismissRiskPrediction: (id: string) => void;
  /** Active/désactive globalement le module (feature flag). */
  toggleRiskModule: (enabled?: boolean) => void;
  /**
   * Déclenche l'INFÉRENCE MODÈLE IA LOCAL (Ollama / vLLM via provider settings).
   * Retourne toujours 1..12 RiskPrediction valides :
   *  → SUCCÈS LLM → predictions origin="ai_model".
   *  → ÉCHEC LLM (injoignable, timeout, JSON invalide) → FALLBACK vers
   *    computeRiskPredictions (déterministe 100% réel), origin="deterministic".
   * Fallback garanti : AUCUNE invention, JAMAIS tableau vide.
   */
  recomputeRiskPredictionsAI: () => Promise<RiskPrediction[]>;

  // --- Module IA Conscience Situationnelle ---
  /** Recalcule conscience situationnelle IA (Ollama local) · fallback déterministe si échec. */
  recomputeSituationalAwarenessAI: () => Promise<SituationalAwareness>;

  simTick: () => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Poignée du flux temps réel — DEHORS de l'état.
 *
 * Elle porte un `AbortController` et des minuteurs : la ranger dans le store la
 * ferait comparer à chaque rendu et sérialiser à la persistance, pour un objet
 * qui n'a rien à voir avec ce que l'écran affiche.
 */
let rtHandle: StreamHandle | null = null;

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
  dict: FR_DICT,
  modulesDict: FR_MODULES,
  dark: true,
  sbOpen: true,
  navOpen: false,
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
  incidentFocus: null,
  incidentFocusAt: 0,
  mapCenterRequest: null,
  quakeSelected: null,

  missionInbox: [],
  missionOutbox: [],
  missionBusy: false,
  resourceRequests: [],
  alertLevel: 3,
  sitrepMissing: [],
  sitrepCadenceMin: 240,

  nrbcSubstances: [],
  plumeIncidentId: null,
  // Les deux référentiels combinés par défaut : l'opérateur voit d'emblée le
  // gabarit OTAN ET la table substance, puis affine depuis le panneau carte.
  // (Sans substance déclarée, l'API omet l'ERG et la réponse l'indique.)
  plumeModels: { atp45: true, erg: true },
  plumeEnvelope: false,
  plumeHour: 0,
  plumeData: null,
  plumeSteps: [],
  plumePlaying: false,
  plume3d: true,
  plumeSmoke: true,
  plumeVigilance: true,
  plumeBusy: false,

  wxGrid: null,
  wxWorld: null,
  wxLayers: { temp: false, wind: false, precip: false },

  selUnit: null,
  selHosp: null,

  // Le réseau civil (106 établissements) est masqué par défaut : il se
  // rallume d'un clic quand l'opérateur cherche une capacité d'accueil.
  layers: { units: true, hospitals: true, hospitalsCiv: false, incidents: true, vehicles: true, field: true, aircraft: true, missions: true },
  map3d: false,
  mapSat: true,
  selMarker: null,

  comCats: [],
  comMsgs: {},
  comMembers: EMPTY_MEMBERS,
  rtOnline: [],
  rtStatus: "closed",
  rtUnread: {},
  rtActiveChannel: null,
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

  // --- Module IA Prédictions Risques ---
  riskPredictions: [],
  riskModuleOn: true,
  riskEngine: "deterministic",
  riskAIModel: undefined,
  riskAIError: undefined,
  riskLoadingAI: false,

  situationalAwareness: null,
  situationalLoadingAI: false,
  situationalModel: undefined,
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
    // Re-calcul IA prédictions risques (100% données ARGOS réel chargées · IA Ollama
    // en local si dispo, sinon repli AUTOMATIQUE sur le moteur déterministe).
    void get().recomputeRiskPredictionsAI();
    void get().recomputeSituationalAwarenessAI();
  },

  // Recharge les séismes depuis l'API (proxy EMSC) et détecte les nouveaux
  // événements pour déclencher l'alerte globale (hors 1er chargement / couche off).
  aircraft: [],
  aircraftFeed: "",
  aircraftBusy: false,
  aircraftError: null,

  /**
   * Recharge la liste et les positions. L'API ne renvoie que les aéronefs
   * inscrits : le trafic aérien non désigné n'atteint jamais le navigateur.
   */
  loadAircraft: async () => {
    const res = await api.getAircraftStates();
    const data = res.data as
      | {
          feed?: string;
          feedHealth?: { available: boolean; reason?: string; retryAt?: string } | null;
          aircraft?: TrackedAircraftState[];
        }
      | undefined;
    if (!data) return;
    // Une liste vide se lit « aucun appareil dans l'emprise » ; ce peut être
    // « le fournisseur nous a refusés ». Deux situations opposées pour un
    // état-major — on remonte donc l'indisponibilité au lieu de la taire.
    const sante = data.feedHealth;
    set({
      aircraft: data.aircraft ?? [],
      aircraftFeed: data.feed ?? "",
      aircraftError: sante && !sante.available ? (sante.reason ?? "indisponible") : null,
    });
  },

  // --- missions : la boucle fermée (ADR 0007) ---
  loadMissions: async () => {
    // Les deux corbeilles dégradent indépendamment : un rôle sans droit de
    // lecture rend simplement une liste vide, jamais une erreur bloquante.
    const [inbox, outbox, open] = await Promise.allSettled([
      api.getMissionInbox(),
      api.getMissionOutbox(),
      // Toutes les boucles ouvertes : on y puise les demandes de moyens, qui
      // s'adressent à la conduite en général et non à un destinataire nommé.
      api.getMissions(undefined, true),
    ]);
    const pick = (r: PromiseSettledResult<{ data?: unknown }>): Mission[] => {
      if (r.status !== "fulfilled") return [];
      const d = r.value.data as { missions?: Mission[] } | undefined;
      return d?.missions ?? [];
    };
    set({
      missionInbox: pick(inbox),
      missionOutbox: pick(outbox),
      resourceRequests: pick(open).filter((m) => m.kind === "resource_request"),
    });
  },

  loadPosture: async () => {
    const [lvl, missing] = await Promise.allSettled([api.getAlertLevel(), api.getMissingSitreps()]);
    const patch: Partial<{ alertLevel: 1 | 2 | 3 | 4; sitrepMissing: never[]; sitrepCadenceMin: number }> = {};
    if (lvl.status === "fulfilled") {
      const d = lvl.value.data as { level?: 1 | 2 | 3 | 4 } | undefined;
      if (d?.level) patch.alertLevel = d.level;
    }
    if (missing.status === "fulfilled") {
      const d = missing.value.data as { missing?: never[]; cadenceMin?: number } | undefined;
      if (d?.missing) patch.sitrepMissing = d.missing;
      if (d?.cadenceMin) patch.sitrepCadenceMin = d.cadenceMin;
    }
    set(patch);
  },

  publishSitrep: async (input) => {
    const res = await api.publishSitrep(input);
    if (res.error) return false;
    await get().loadPosture();
    return true;
  },

  requestResource: async (input) => {
    set({ missionBusy: true });
    try {
      const res = await api.issueMission({
        incidentId: input.incidentId,
        label: input.label,
        // La demande s'adresse à la CONDUITE, pas à quelqu'un en particulier :
        // c'est une file partagée, pas un message privé.
        to: { role: "tacom" },
        payload: { kind: "resource_request", capability: input.capability, urgency: input.urgency },
      });
      if (res.error) return false;
      await get().loadMissions();
      return true;
    } finally {
      set({ missionBusy: false });
    }
  },

  actOnMission: async (id, action, arg) => {
    set({ missionBusy: true });
    try {
      const res =
        action === "accept" ? await api.acceptMission(id)
        : action === "decline" ? await api.declineMission(id, arg ?? "")
        : action === "milestone" ? await api.missionMilestone(id, (arg ?? "en_route") as MissionMilestoneKey)
        : action === "complete" ? await api.completeMission(id)
        : await api.cancelMission(id, arg ?? "");
      if (res.error) return false;
      // La boucle a bougé : les corbeilles ET le domaine (posture d'unité,
      // fil d'événements) sont rafraîchis.
      await get().loadMissions();
      await get().loadDomain();
      return true;
    } finally {
      set({ missionBusy: false });
    }
  },

  // --- capacité NRBC (ADR 0005) ---
  ensureNrbcSubstances: async () => {
    if (get().nrbcSubstances.length > 0) return;
    const res = await api.getNrbcSubstances();
    const data = res.data as { substances?: NrbcSubstance[] } | undefined;
    if (data?.substances) set({ nrbcSubstances: data.substances });
  },

  showPlume: (incidentId) => {
    set({ plumeIncidentId: incidentId, plumeData: null, plumeSteps: [], plumePlaying: false, plumeHour: 0 });
    // Le cadrage n'est PAS demandé ici : un panache de quelques kilomètres est
    // invisible à l'échelle nationale, mais c'est MapCanvas qui ajuste la
    // caméra sur l'emprise réelle des zones dès qu'elles arrivent — seul
    // endroit qui connaisse l'état du canevas (voir fitPlumeRef).
    void get().loadPlume();
    // Préchargement en tâche de fond : la lecture animée est prête quand
    // l'opérateur appuie sur ▶, sans l'avoir fait attendre.
    void get().loadPlumeSteps();
  },

  hidePlume: () => set({ plumeIncidentId: null, plumeData: null, plumeSteps: [], plumePlaying: false }),

  setPlumeModels: (patch) => {
    const models = { ...get().plumeModels, ...patch };
    // Toujours au moins un référentiel actif : une couche vide serait lue
    // comme « pas de danger », le contresens qu'on ne peut pas se permettre.
    if (!models.atp45 && !models.erg) return;
    set({ plumeModels: models });
    void get().loadPlume();
  },

  setPlumeEnvelope: (v) => set({ plumeEnvelope: v }),

  setPlumeHour: (h) => {
    set({ plumeHour: Math.max(0, Math.min(6, h)) });
    void get().loadPlume();
  },

  loadPlumeSteps: async () => {
    const { plumeIncidentId, plumeModels } = get();
    if (!plumeIncidentId) return;
    const models = [plumeModels.atp45 ? "atp45" : null, plumeModels.erg ? "erg" : null].filter(Boolean).join(",");
    // Les 7 échéances en parallèle : l'API les sert depuis son cache météo,
    // donc c'est une seule fenêtre d'attente et non sept.
    const res = await Promise.allSettled(
      Array.from({ length: 7 }, (_, h) => api.getNrbcPlume(plumeIncidentId, models, h)),
    );
    const steps = res.map((r) =>
      r.status === "fulfilled" ? ((r.value.data as unknown as NrbcPlume) ?? null) : null,
    );
    // Réponse d'un panache abandonné entre-temps : ignorée.
    if (get().plumeIncidentId === plumeIncidentId) set({ plumeSteps: steps });
  },

  setPlumePlaying: (v) => set({ plumePlaying: v }),
  setPlume3d: (v) => set({ plume3d: v }),

  // --- temps réel (lot COMMS) ------------------------------------------------
  rtConnect: () => {
    // Un seul flux par onglet : rappeler `rtConnect` ne doit pas en ouvrir un
    // second, sinon chaque navigation ajouterait une session fantôme à la
    // liste des présents.
    if (rtHandle) return;
    rtHandle = openRealtimeStream(
      (e) => {
        const s = get();
        if (e.kind === "presence") {
          set({ rtOnline: (e.data as { online: PresenceUser[] }).online ?? [] });
          return;
        }
        if (e.kind === "message") {
          const d = e.data as { channelId: string; message: CommMessage };
          if (!d?.channelId || !d.message) return;
          // `mine` est posé par le SERVEUR pour l'auteur ; sur le flux il
          // arrive à tout le monde. On le recalcule ici, sans quoi chacun
          // verrait tous les messages comme les siens.
          const message: CommMessage = { ...d.message, mine: d.message.who === s.sessionUser?.matricule };
          const liste = s.comMsgs[d.channelId] ?? [];
          // Le message peut déjà être là : l'auteur l'a inséré à l'envoi et le
          // reçoit ensuite par le flux. Dédoublonner sur l'identifiant évite
          // qu'il s'affiche deux fois.
          if (liste.some((m) => m.id === message.id)) return;
          set({
            comMsgs: { ...s.comMsgs, [d.channelId]: [...liste, message] },
            rtUnread:
              message.mine || d.channelId === s.rtActiveChannel
                ? s.rtUnread
                : { ...s.rtUnread, [d.channelId]: (s.rtUnread[d.channelId] ?? 0) + 1 },
          });
          return;
        }
        if (e.kind === "channel") {
          // La structure a changé sous nos pieds : on la recharge plutôt que de
          // la rejouer à la main, une reconstitution partielle valant pire
          // qu'un aller-retour.
          void get().loadDomain();
        }
      },
      (rtStatus) => set({ rtStatus }),
    );
  },

  rtDisconnect: () => {
    rtHandle?.close();
    rtHandle = null;
    set({ rtStatus: "closed", rtOnline: [] });
  },

  rtSetActiveChannel: (id) =>
    set((s) => {
      if (!id) return { rtActiveChannel: null };
      const { [id]: _solde, ...reste } = s.rtUnread;
      return { rtActiveChannel: id, rtUnread: reste };
    }),
  setPlumeSmoke: (v) => set({ plumeSmoke: v }),
  setPlumeVigilance: (v) => set({ plumeVigilance: v }),

  loadPlume: async () => {
    const { plumeIncidentId, plumeModels, plumeHour } = get();
    if (!plumeIncidentId) return;
    const models = [plumeModels.atp45 ? "atp45" : null, plumeModels.erg ? "erg" : null].filter(Boolean).join(",");
    set({ plumeBusy: true });
    try {
      const res = await api.getNrbcPlume(plumeIncidentId, models, plumeHour);
      const data = res.data as unknown as NrbcPlume | undefined;
      // Réponse d'une requête périmée (l'opérateur a déjà changé d'incident) : ignorée.
      if (data && get().plumeIncidentId === data.incidentId) set({ plumeData: data });
    } finally {
      set({ plumeBusy: false });
    }
  },

  /** Inscrit un aéronef. Retourne `false` et publie le motif si l'API refuse. */
  addAircraft: async (input) => {
    set({ aircraftBusy: true, aircraftError: null });
    try {
      const res = await api.addAircraft(input);
      if (res.error) {
        const msg = (res.error as { message?: string | string[] } | undefined)?.message;
        set({ aircraftError: Array.isArray(msg) ? msg.join(" ") : (msg ?? "Inscription refusée.") });
        return false;
      }
      await get().loadAircraft();
      return true;
    } finally {
      set({ aircraftBusy: false });
    }
  },

  /** Retire un aéronef du suivi (archivage : geste réversible, non destructif). */
  removeAircraft: async (id) => {
    set({ aircraftBusy: true });
    try {
      await api.archiveAircraft(id);
      await get().loadAircraft();
    } finally {
      set({ aircraftBusy: false });
    }
  },

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

  // « Voir sur la carte » : centre sur un incident (pattern identique à focusQuake)
  focusIncident: (inc) => set((s) => {
    if (!inc) return { incidentFocus: null };
    const layers = s.layers.incidents ? s.layers : { ...s.layers, incidents: true };
    return {
      incidentFocus: inc,
      incidentFocusAt: Date.now(),
      selMarker: { kind: "inc", id: inc.id },
      layers,
    };
  }),

  // Centre générique carte (ex: zone géographique, ville) — consommé par MapCanvas useEffect
  // zoom par défaut = 7 (niveau national) sinon explicit.
  setMapCenter: (ll, zoom, label) => set({ mapCenterRequest: ll ? { ll, zoom: zoom ?? 7, at: Date.now(), label } : null }),

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
    // Lors d'une déconnexion : le Copilot revient à un historique NEUF.
    // L'historique du compte qui s'en va reste préservé dans sa clé dédiée
    // (ré-hydraté au prochain login du même compte).
    set({
      authed: false,
      apiConnected: false,
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
      sessionUser,
      role: storedRole ?? s.role,
      aiLog,
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

  // ============================================================
  // Module IA · Prédictions Risques
  // ============================================================
  recomputeRiskPredictions: () => {
    if (!get().riskModuleOn) {
      set({ riskPredictions: [] });
      return;
    }
    void fetchRiskPredictions()
      .then((preds) => set({ riskPredictions: preds, riskEngine: "deterministic", riskAIError: undefined }))
      .catch(() => {
        /* API injoignable : on garde les dernières prédictions affichées. */
      });
  },
  validateRiskPrediction: (id, validator) =>
    set((s) => ({
      riskPredictions: s.riskPredictions.map((p) =>
        p.id === id ? { ...p, validatedByHuman: true, validatedBy: validator ?? p.validatedBy } : p,
      ),
    })),
  dismissRiskPrediction: (id) =>
    set((s) => ({
      riskPredictions: s.riskPredictions.map((p) =>
        p.id === id ? { ...p, dismissed: true } : p,
      ),
    })),
  toggleRiskModule: (enabled) =>
    set((s) => {
      const next = typeof enabled === "boolean" ? enabled : !s.riskModuleOn;
      // Réactivation : on vide puis on charge depuis l'API — les prédictions
      // arrivent une fraction de seconde plus tard, identiques pour tous les postes.
      if (next) {
        void fetchRiskPredictions()
          .then((preds) => set({ riskPredictions: preds }))
          .catch(() => {});
      }
      return {
        riskModuleOn: next,
        riskPredictions: [],
        riskEngine: "deterministic",
        riskAIError: undefined,
      };
    }),
  recomputeRiskPredictionsAI: async () => {
    const s = get();
    if (!s.riskModuleOn) {
      set({ riskPredictions: [], riskLoadingAI: false });
      return [];
    }
    set({ riskLoadingAI: true });
    try {
      const cfg: LlmProviderConfig = resolveProvider(s.aiSettings);
      // Import au premier usage : ~500 lignes de prédicteur quittent le graphe
      // initial de toutes les routes ; le module est mis en cache ensuite.
      const { predictRiskPredictionsAI } = await import("@/lib/ai/risk/modelPredictor");
      const res = await predictRiskPredictionsAI(
        {
          incidents: s.incidents,
          hospitals: s.hospitals,
          units: s.units,
          movements: s.movements,
          dashStats: s.dashStats,
        },
        cfg,
      );
      // F-04 : si le LLM a échoué, modelPredictor a recalculé EN LOCAL son repli
      // déterministe. On lui préfère le résultat de l'API — même moteur, mais
      // exécuté une fois côté serveur et identique pour tous les postes. Le
      // calcul local reste l'ultime filet si l'API est injoignable.
      const predictions =
        res.origin === "deterministic"
          ? await fetchRiskPredictions().catch(() => res.predictions)
          : res.predictions;
      set({
        riskPredictions: predictions,
        riskEngine: res.origin,
        riskAIModel: res.model,
        riskAIError: res.error,
        riskLoadingAI: false,
      });
      return predictions;
    } catch (e) {
      // Dernier filet de sécurité: si tout casse (y compris fallback déterministe),
      // on retombe sur le déterministe (aucune invention, zéro crash).
      const preds: RiskPrediction[] = await fetchRiskPredictions().catch(() => []);
      set({
        riskPredictions: preds,
        riskEngine: "deterministic",
        riskAIModel: undefined,
        riskAIError: e instanceof Error ? e.message : "erreur inconnue",
        riskLoadingAI: false,
      });
      return preds;
    }
  },

  recomputeSituationalAwarenessAI: async () => {
    const s = get();
    set({ situationalLoadingAI: true });
    try {
      const cfg: LlmProviderConfig = resolveProvider(s.aiSettings);
      const { computeSituationalAwarenessAI } = await import("@/lib/ai/situational/engine");
      const { data, model } = await computeSituationalAwarenessAI(
        {
          incidents: s.incidents,
          hospitals: s.hospitals,
          units: s.units,
          dashStats: s.dashStats,
          equipment: s.catalog.equipment,
        },
        cfg,
      );
      set({
        situationalAwareness: data,
        situationalModel: model,
        situationalLoadingAI: false,
      });
      return data;
    } catch (e) {
      const { computeSituationalAwarenessFallback } = await import("@/lib/ai/situational/engine");
      const fallback = computeSituationalAwarenessFallback({
        incidents: s.incidents,
        hospitals: s.hospitals,
        units: s.units,
        dashStats: s.dashStats,
        equipment: s.catalog.equipment,
      });
      set({
        situationalAwareness: fallback,
        situationalModel: undefined,
        situationalLoadingAI: false,
      });
      return fallback;
    }
  },

  setLang: (lang) => {
    if (typeof window !== "undefined") localStorage.setItem(LANG_KEY, lang);
    // Chargement PUIS commit : tant que le dictionnaire demandé n'est pas là,
    // rien ne bouge (ni libellés, ni direction RTL). En cas d'échec réseau on
    // reste simplement sur la langue courante — jamais d'interface muette.
    void loadLangResources(lang)
      .then((res) => set({ lang, dict: res.dict, modulesDict: res.modules }))
      .catch(() => {});
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
  toggleNav: () => set((s) => ({ navOpen: !s.navOpen })),
  closeNav: () => set({ navOpen: false }),
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

  addIncident: (inc) => {
    set((s) => {
      const d = new Date();
      const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      return {
        incidents: [inc, ...s.incidents],
        feed: [{ time, c: "bg-danger-500", txt: `${inc.id} — ${inc.titre}` }, ...s.feed].slice(0, 8),
      };
    });
    // Recalcul IA prédictions
    get().recomputeRiskPredictions();
  },

  deployFieldHospital: (h) => {
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
    });
    get().recomputeRiskPredictions();
  },

  patchHospital: (id, patch) => {
    set((s) => ({
      hospitals: s.hospitals.map((h) => (h.id === id ? { ...h, ...patch } : h)),
    }));
    get().recomputeRiskPredictions();
  },

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

  engageUnit: (unitId, incidentId, reason, via, score) => {
    const s = get();
    const d = new Date();
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const others = s.engagements.filter((e) => e.unitId !== unitId);
    const eng: Engagement = { id: `ENG-${Date.now()}`, unitId, incidentId, reason, via, score, time };
    // Affichage immédiat : le répartiteur ne doit pas attendre le réseau pour
    // voir son geste pris en compte.
    set({ engagements: [eng, ...others] });

    // ...et l'engagement OUVRE UNE BOUCLE côté serveur (ADR 0007, P1-b).
    // Avant, il ne vivait que dans ce store : l'unité n'était jamais prévenue,
    // et rien n'en restait au rechargement. La mission est désormais la trace
    // qui fait foi ; le fil et le canal de l'incident sont alimentés par
    // l'API, d'où l'absence de ligne de fil locale ici.
    const unit = s.units.find((u) => u.id === unitId);
    void api
      .issueMission({
        incidentId,
        label: `${unit?.nom ?? unitId} — ${reason}`,
        to: { role: "resp_unit", entity: unitId },
        payload: { kind: "order", unitId, ...(score !== undefined ? { etaMin: Math.round(score) } : {}) },
      })
      .then((res) => {
        if (res.error) {
          // Émission refusée (droits, incident inconnu) : on le dit plutôt que
          // de laisser croire qu'un ordre est parti.
          get().showToast(`Ordre non émis pour ${unitId}`);
          return;
        }
        void get().loadMissions();
        void get().loadDomain();
      });
  },

  relieveUnit: (unitId) => set((s) => ({ engagements: s.engagements.filter((e) => e.unitId !== unitId) })),

  resolveQueueItem: (id) => set((s) => ({ queue: s.queue.filter((q) => q.id !== id) })),

  pushAi: (msg) => {
    const d = new Date();
    const at = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const id = `AI-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const state = get();
    const userMatricule = state.sessionUser?.matricule;
    const next = [...state.aiLog, { ...msg, id, at }];
    saveAiLogFor(userMatricule, next);
    set({ aiLog: next });
    return id;
  },
  updateAi: (id, patch) =>
    set((s) => {
      const next = s.aiLog.map((mo) => (mo.id === id ? { ...mo, ...patch } : mo));
      saveAiLogFor(s.sessionUser?.matricule, next);
      return { aiLog: next };
    }),
  clearAi: () => {
    const state = get();
    clearAiLogFor(state.sessionUser?.matricule);
    set({ aiLog: [] });
  },

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
  return useArgos((s) => s.dict);
}

/** Chaînes des modules pour la langue active (modules opérationnels). */
export function useModules(): ModulesDict {
  return useArgos((s) => s.modulesDict);
}

// Accès console en développement UNIQUEMENT (tests manuels : simuler une
// alerte sismique, inspecter l'état). Jamais exposé en production.
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  (window as unknown as { __argos?: typeof useArgos }).__argos = useArgos;
}
