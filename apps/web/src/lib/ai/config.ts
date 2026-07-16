// ============================================================================
// ARGOS — configuration de l'assistant IA (§6.17 Couche 2)
// Fournisseurs de LLM enfichables. Par souveraineté (MASTER_PLAN §A1/§4.3), le
// modèle open-weight AUTO-HÉBERGÉ (Ollama/vLLM) est le défaut. L'assistant est
// flag-gated : désactivé, aucun appel n'est fait et l'écran n'apparaît pas.
// ============================================================================

export type LlmProviderId = "ollama" | "vllm";

export interface LlmProviderConfig {
  id: LlmProviderId;
  label: string;
  /** point d'accès HTTP du runtime */
  endpoint: string;
  /** identifiant du modèle servi */
  model: string;
  /** true = exécuté dans le périmètre (air-gap possible) */
  local: boolean;
}

/** Feature flag (piloté par le Super Admin, §6.15). */
export const AI_ENABLED = true;

/** Fournisseur par défaut : LLM local d'abord (souveraineté). */
export const AI_DEFAULT_PROVIDER: LlmProviderId = "ollama";

export const AI_PROVIDERS: Record<LlmProviderId, LlmProviderConfig> = {
  ollama: { id: "ollama", label: "Ollama (local)", endpoint: "http://localhost:11434", model: "llama3.1:8b-instruct-q4_K_M", local: true },
  vllm: { id: "vllm", label: "vLLM (local)", endpoint: "http://localhost:8000", model: "Qwen2.5-7B-Instruct", local: true },
};

/**
 * Réglages LLM modifiables à l'exécution (page Paramètres, Super Admin) et
 * persistés. Ils surchargent les valeurs statiques ci-dessus.
 */
export interface AiSettings {
  providerId: LlmProviderId;
  endpoint: string;
  model: string;
}

export const AI_DEFAULT_SETTINGS: AiSettings = {
  providerId: AI_DEFAULT_PROVIDER,
  endpoint: AI_PROVIDERS[AI_DEFAULT_PROVIDER].endpoint,
  model: AI_PROVIDERS[AI_DEFAULT_PROVIDER].model,
};

/** Fusionne la base statique d'un fournisseur avec les réglages runtime. */
export function resolveProvider(s: AiSettings): LlmProviderConfig {
  const base = AI_PROVIDERS[s.providerId];
  return { ...base, endpoint: s.endpoint.trim() || base.endpoint, model: s.model.trim() || base.model };
}

/** Délai maximal d'un appel LLM (ms) avant repli sur la réponse déterministe. */
export const AI_TIMEOUT_MS = 12000;

/**
 * Consigne système : le LLM ne fait que rédiger en français À PARTIR des données
 * fournies par la Couche 1. Il ne décide rien, n'exécute aucune action et
 * n'invente aucun chiffre (garde-fous MASTER_PLAN §6.17 / §7 Phase 7).
 */
export const AI_SYSTEM_PROMPT = [
  "Tu es l'assistant opérationnel d'ARGOS, plateforme militaire de gestion des catastrophes.",
  "Tu réponds STRICTEMENT en français, de façon concise et factuelle.",
  "Tu ne t'appuies QUE sur les données structurées fournies (résultat du moteur Couche 1).",
  "Tu n'inventes aucun chiffre, aucune unité, aucun lieu absent des données.",
  "Tu ne décides rien et n'exécutes aucune action : toute action reste confirmée par un humain.",
  "Si les données sont vides, dis-le clairement.",
].join(" ");
