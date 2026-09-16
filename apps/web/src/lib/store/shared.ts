// ============================================================================
// lib/store/shared.ts — ce que les tranches du magasin ont en commun
//
// Types de session et d'interface, clés de persistance, journal IA par
// utilisateur, garde de priorité opérateur. Aucune tranche n'importe une autre
// tranche : elles ne partagent que ce fichier et le type ArgosState.
// ============================================================================

import { type StreamHandle } from "@/lib/realtime/stream";
import type {
  Member,
  } from "@/lib/types";
import type { AiIncidentRow, AiHospitalRow, AiTopEquip, AiAnswerStats, AiCrossBlock, AiSuggestion } from "@/lib/ai/assistant";
import { api } from "@/lib/api";
import type { AiUnitResult } from "@/lib/ai/assistant";
import type { Assignments, Role } from "@/lib/roles";
import type { RiskPrediction } from "@/lib/ai/risk/types";


/** Présence du centre de communication (interlocuteurs + salle vocale). */
export interface CommMembers {
  online: Member[];
  offline: Member[];
  voice: { n: string; initials: string; av: string; speaking: boolean }[];
}

export const EMPTY_MEMBERS: CommMembers = { online: [], offline: [], voice: [] };

export const THEME_KEY = "kanban_rdia_theme";

export const LANG_KEY = "argos_lang";

export const AUTH_KEY = "argos_auth";

export const AI_SETTINGS_KEY = "argos_ai_settings";

export const FLAGS_KEY = "argos_flags";

export const TOKEN_KEY = "argos_token";

export const SESSION_USER_KEY = "argos_session_user";

export const SESSION_ROLE_KEY = "argos_session_role";

/** Préférences sonores de CE poste (localStorage) : un opérateur en salle de veille coupe ce qu'il veut. */
export const SOUNDS_KEY = "argos_sounds";

/**
 * Deux signatures, deux réglages : le « pop » d'un message reçu, et le signal
 * des autres notifications (alertes adressées, séismes). Coupés séparément —
 * un poste qui suit une conversation soutenue garde les alertes.
 */
export interface SoundPrefs {
  messages: boolean;
  alerts: boolean;
}

export const DEFAULT_SOUNDS: SoundPrefs = { messages: true, alerts: true };

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
export const AI_LOG_PREFIX = "argos_ai_log_";

export function aiLogKey(matricule: string | null | undefined): string {
  return `${AI_LOG_PREFIX}${matricule ?? "demo"}`;
}

export function loadAiLogFor(userId: string | null | undefined): AiMessage[] {
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

export function saveAiLogFor(userId: string | null | undefined, log: AiMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(aiLogKey(userId), JSON.stringify(log));
  } catch {
    /* quota exceeded : on ignore */
  }
}

export function clearAiLogFor(userId: string | null | undefined): void {
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
export async function fetchRiskPredictions(): Promise<RiskPrediction[]> {
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
  /** Postes d'opération posés sur la carte (PC, cellules, abris, parcs). */
  posts: boolean;
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
  /** Sites mortuaires fixes et morgues mobiles déployées. */
  morgues: boolean;
  /** Abris d'hébergement qui portent une position. */
  shelters: boolean;
  /** Traceurs GPS (boîtiers) et positions partagées par l'application. */
  trackers: boolean;
}

export interface NavGroups {
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
  /** Intention détectée par la Couche 1 (si connue) — sert au déclenchement
   *  d'actions comme « Télécharger PDF » sur les synthèses de situation. */
  intent?: import("@/lib/ai/assistant/types").AiIntent;
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

/** Minuteur du toast courant — hors de l'état, réaffecté par la tranche `ui`. */
export const toastTimerRef: { current: ReturnType<typeof setTimeout> | undefined } = { current: undefined };

/**
 * Poignée du flux temps réel — DEHORS de l'état.
 *
 * Elle porte un `AbortController` et des minuteurs : la ranger dans le store la
 * ferait comparer à chaque rendu et sérialiser à la persistance, pour un objet
 * qui n'a rien à voir avec ce que l'écran affiche.
 */
export const rtHandleRef: { current: StreamHandle | null } = { current: null };

/**
 * Gardes des recalculs IA automatiques.
 *
 * Deux défauts se cumulaient : aucune protection contre un recalcul déjà EN
 * COURS (deux `loadDomain` rapprochés → quatre appels au modèle), et aucune
 * mémoire des ENTRÉES (mêmes incidents, mêmes unités → même réponse, recalculée
 * quand même). Chaque appel inutile fait la queue devant la question de
 * l'opérateur sur un runtime qui les sert un à la fois.
 */
export const aiGarde = {
  riskEnCours: false,
  riskSignature: "",
  situationEnCours: false,
  situationSignature: "",
  /** Une question de l'opérateur est en cours : les calculs de fond attendent. */
  operateurEnCours: false,
  /** Contrôleur du calcul de fond EN COURS — annulé quand l'opérateur pose une question. */
  fondCtrl: null as AbortController | null,
};

/**
 * PRIORITÉ À L'OPÉRATEUR. Le runtime sert les appels UN À LA FOIS : mesuré ici,
 * une question posée pendant les recalculs de fond attendait 26,9 s son premier
 * mot, contre 3,5 s une fois la voie libre. Les calculs de fond n'ont pas
 * d'urgence — une prédiction de risque peut arriver dix secondes plus tard ;
 * une réponse à un chef ne peut pas. Ils patientent donc tant qu'une question
 * est en cours, puis repartent. Borne de sécurité à deux minutes : un drapeau
 * qui resterait levé ne doit pas bloquer les modèles pour toujours.
 */
export async function attendreOperateur(): Promise<void> {
  const limite = Date.now() + 120_000;
  while (aiGarde.operateurEnCours && Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 400));
  }
}

/** Empreinte compacte des entrées des modèles — ce qui, s'il change, change la réponse. */
export function signatureEntreesIA(s: {
  incidents: { id: string; st: string; sev: string; archived?: boolean }[];
  units: { id: string; dispo: string; readiness: number }[];
  hospitals: { id: string; occ: number }[];
}): string {
  return (
    s.incidents.map((i) => `${i.id}:${i.st}:${i.sev}:${i.archived ? 1 : 0}`).join("|") +
    "#" +
    s.units.map((u) => `${u.id}:${u.dispo}:${u.readiness}`).join("|") +
    "#" +
    s.hospitals.map((h) => `${h.id}:${h.occ}`).join("|")
  );
}
