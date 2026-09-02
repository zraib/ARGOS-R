// ============================================================================
// lib/store/slices/ai.ts — assistant IA : journal, réglages, priorité opérateur, prédictions de risque, conscience situationnelle
//
// Tranche du magasin Zustand. `set`/`get` portent sur l'état COMPLET
// (ArgosState) : une tranche peut lire les autres, jamais les importer.
// ============================================================================

import type { StateCreator } from "zustand";
import type { ArgosState } from "@/lib/store";
import { warmModel } from "@/lib/ai/provider";
import { AI_DEFAULT_SETTINGS, type AiSettings, aiSystemPrompt, resolveProvider, type LlmProviderConfig } from "@/lib/ai/config";
import type { RiskPrediction } from "@/lib/ai/risk/types";
import type { SituationalAwareness } from "@/lib/ai/situational/types";
import {
  AI_SETTINGS_KEY,
  saveAiLogFor,
  clearAiLogFor,
  fetchRiskPredictions,
  AiMessage,
  aiGarde,
  attendreOperateur,
  signatureEntreesIA,
} from "@/lib/store/shared";

export interface AiSlice {
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
  /** Signale qu'une question de l'opérateur est en cours : les calculs IA de fond patientent. */
  setAiOperatorBusy: (busy: boolean) => void;
  pushAi: (msg: Omit<AiMessage, "id" | "at">) => string;
  /**
   * `persist: false` pendant un flux : chaque jeton reçu réécrivait TOUT le
   * journal dans `localStorage` (sérialisation synchrone sur le fil principal,
   * des dizaines de fois par seconde). On ne persiste qu'à la fin du flux.
   */
  updateAi: (id: string, patch: Partial<AiMessage>, opts?: { persist?: boolean }) => void;
  clearAi: () => void;
  setAiSettings: (patch: Partial<AiSettings>) => void;
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
}

export const createAiSlice: StateCreator<ArgosState, [], [], AiSlice> = (set, get) => ({
  aiLog: [],
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
  aiSettings: AI_DEFAULT_SETTINGS,
  setAiOperatorBusy: (busy) => {
    aiGarde.operateurEnCours = busy;
    if (busy) {
      // Un calcul de fond déjà parti ne peut pas être dépassé : on l'ANNULE.
      // Il repartira une fois l'opérateur servi (empreinte remise à zéro).
      aiGarde.fondCtrl?.abort();
      aiGarde.fondCtrl = null;
      return;
    }
    // Opérateur servi : on redonne leur tour aux calculs de fond, en série.
    setTimeout(() => {
      void (async () => {
        await get().recomputeRiskPredictionsAI();
        await get().recomputeSituationalAwarenessAI();
      })();
    }, 1_000);
  },
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
  updateAi: (id, patch, opts) =>
    set((s) => {
      const next = s.aiLog.map((mo) => (mo.id === id ? { ...mo, ...patch } : mo));
      if (opts?.persist !== false) saveAiLogFor(s.sessionUser?.matricule, next);
      return { aiLog: next };
    }),
  clearAi: () => {
    const state = get();
    clearAiLogFor(state.sessionUser?.matricule);
    set({ aiLog: [] });
  },
  setAiSettings: (patch) => {
    set((s) => {
      const aiSettings = { ...s.aiSettings, ...patch };
      if (typeof window !== "undefined") localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(aiSettings));
      return { aiSettings };
    });
    // Un modèle nouvellement choisi est préchargé tout de suite : la première
    // question ne doit pas payer les ~80 s de chargement mesurés ici.
    if (patch.model || patch.endpoint || patch.providerId) {
      const st = get();
      void warmModel(resolveProvider(st.aiSettings), aiSystemPrompt(st.lang, st.aiSettings.systemPrompt));
    }
  },
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
    const signature = signatureEntreesIA(s);
    // Mêmes entrées, ou calcul déjà en cours : on rend ce qu'on a.
    if (aiGarde.riskEnCours || (signature === aiGarde.riskSignature && s.riskPredictions.length > 0)) {
      return s.riskPredictions;
    }
    aiGarde.riskEnCours = true;
    await attendreOperateur();
    const ctrl = new AbortController();
    aiGarde.fondCtrl = ctrl;
    aiGarde.riskSignature = signature;
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
        cfg, ctrl.signal);
      // Interrompu au profit d'une question : on garde les prédictions courantes,
      // on oublie l'empreinte pour recalculer plus tard, et on ne signale rien.
      if (res.aborted) {
        aiGarde.riskSignature = "";
        set({ riskLoadingAI: false });
        return s.riskPredictions;
      }
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
    } finally {
      aiGarde.riskEnCours = false;
    }
  },
  recomputeSituationalAwarenessAI: async () => {
    const s = get();
    const signature = signatureEntreesIA(s);
    if (aiGarde.situationEnCours || (signature === aiGarde.situationSignature && s.situationalAwareness)) {
      return s.situationalAwareness as SituationalAwareness;
    }
    aiGarde.situationEnCours = true;
    aiGarde.situationSignature = signature;
    await attendreOperateur();
    const ctrl = new AbortController();
    aiGarde.fondCtrl = ctrl;
    set({ situationalLoadingAI: true });
    try {
      const cfg: LlmProviderConfig = resolveProvider(s.aiSettings);
      const { computeSituationalAwarenessAI } = await import("@/lib/ai/situational/engine");
      const { data, model, aborted } = await computeSituationalAwarenessAI(
        {
          incidents: s.incidents,
          hospitals: s.hospitals,
          units: s.units,
          dashStats: s.dashStats,
          equipment: s.catalog.equipment,
        },
        cfg,
        ctrl.signal,
      );
      if (aborted) {
        aiGarde.situationSignature = "";
        set({ situationalLoadingAI: false });
        return (s.situationalAwareness ?? data) as SituationalAwareness;
      }
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
    } finally {
      aiGarde.situationEnCours = false;
    }
  },
});
