// ============================================================================
// ARGOS — adaptateurs de fournisseurs LLM (§6.17 Couche 2)
// Interface commune + adaptateurs Ollama (local) et vLLM (local, API compatible
// OpenAI). En production, ces appels passent par l'API ARGOS (les outils
// s'exécutent sous les permissions de l'utilisateur) ; dans le prototype
// frontend, ils sont émis côté client vers un runtime local.
// ============================================================================

import { AI_TIMEOUT_MS, type LlmProviderConfig, type LlmProviderId } from "@/lib/ai/config";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmResult {
  ok: boolean;
  text: string;
  provider: LlmProviderId;
  error?: string;
  /** Mesures rendues par le runtime : ce qui a VRAIMENT coûté, pas une estimation. */
  stats?: LlmStats;
  /** Appel INTERROMPU par l'appelant (priorité à l'opérateur) — ni succès, ni panne. */
  aborted?: boolean;
}

export interface LlmStats {
  /** Jetons du prompt réellement évalués (0 si le préfixe était en cache). */
  promptTokens: number;
  promptSec: number;
  outputTokens: number;
  outputSec: number;
}

/** Extrait les mesures du dernier fragment NDJSON d'Ollama (`done: true`). */
function statsOllama(j: Record<string, unknown>): LlmStats | undefined {
  if (!j || j.done !== true) return undefined;
  const n = (k: string) => (typeof j[k] === "number" ? (j[k] as number) : 0);
  return {
    promptTokens: n("prompt_eval_count"),
    promptSec: n("prompt_eval_duration") / 1e9,
    outputTokens: n("eval_count"),
    outputSec: n("eval_duration") / 1e9,
  };
}

async function withTimeout(ms: number): Promise<{ signal: AbortSignal; done: () => void; ctrl: AbortController }> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(id), ctrl };
}

/** Liste les modèles réellement installés sur le runtime local. */
export async function listModels(cfg: LlmProviderConfig): Promise<string[]> {
  const { signal, done } = await withTimeout(3000);
  try {
    if (cfg.id === "ollama") {
      const r = await fetch(`${cfg.endpoint}/api/tags`, { signal });
      if (!r.ok) return [];
      const d = await r.json();
      return (d?.models ?? []).map((mo: { name: string }) => mo.name).filter(Boolean);
    }
    if (cfg.id === "vllm") {
      const r = await fetch(`${cfg.endpoint}/v1/models`, { signal });
      if (!r.ok) return [];
      const d = await r.json();
      return (d?.data ?? []).map((mo: { id: string }) => mo.id).filter(Boolean);
    }
    return [];
  } catch {
    return [];
  } finally {
    done();
  }
}

/** Teste la disponibilité d'un runtime (sans consommer de tokens). */
export async function probeProvider(cfg: LlmProviderConfig): Promise<boolean> {
  const { signal, done } = await withTimeout(3000);
  try {
    if (cfg.id === "ollama") {
      const r = await fetch(`${cfg.endpoint}/api/tags`, { signal });
      return r.ok;
    }
    if (cfg.id === "vllm") {
      const r = await fetch(`${cfg.endpoint}/v1/models`, { signal });
      return r.ok;
    }
    return false;
  } catch {
    return false;
  } finally {
    done();
  }
}

/**
 * Précharge le modèle ET met son préfixe en cache.
 *
 * Mesuré sur ce poste : charger 23 Go prend ~80 s ; évaluer une consigne système
 * de ~500 jetons, ~1 s. Ollama garde en cache la clé/valeur du PRÉFIXE identique
 * d'un appel au suivant : en envoyant dès l'ouverture de session la consigne
 * système réelle avec une réponse d'un seul jeton, la première vraie question ne
 * paie plus ni le chargement ni la consigne. Appel « perdu », jamais affiché.
 */
export async function warmModel(cfg: LlmProviderConfig, systemPrompt?: string): Promise<void> {
  if (cfg.id !== "ollama") return;
  const { signal, done } = await withTimeout(180_000);
  try {
    const messages: LlmMessage[] = systemPrompt
      ? [{ role: "system", content: systemPrompt }, { role: "user", content: "OK" }]
      : [{ role: "user", content: "OK" }];
    await fetch(`${cfg.endpoint}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: cfg.model, messages, stream: false, think: false, keep_alive: "30m", options: { ...OLLAMA_OPTIONS, num_predict: 1 } }),
      signal,
    });
  } catch {
    // Le préchauffage est une commodité : son échec ne doit rien casser.
  } finally {
    done();
  }
}

// Paramètres mémoire stricts pour éviter l'OOM (signal: killed) sur macOS :
// - num_ctx ≤ 16384 (÷2 vs 32768 → KV cache ÷2, économie ~1.5-2Go)
// - num_batch = 128 (÷4 vs 512 → pic évaluation prompt ÷4)
const OLLAMA_OPTIONS = {
  temperature: 0.2,
  num_ctx: 16384,
  num_batch: 128,
  // PLAFOND DE GÉNÉRATION. Mesuré ici à ~45 jetons/s : sans borne, une réponse
  // qui s'étale coûte une seconde toutes les 45 jetons. La consigne demande
  // « concis » ; 900 jetons (~20 s au pire) suffisent à un compte rendu complet
  // et coupent net une divagation.
  num_predict: 900,
  num_thread: Math.max(4, Math.min(8, typeof navigator !== "undefined" && "hardwareConcurrency" in navigator ? (navigator.hardwareConcurrency ?? 4) - 2 : 4)),
};

/** Extrait un message lisible depuis un body d'erreur Ollama (JSON ou texte). */
function simplifyOllamaError(status: number, bodyRaw: string): string {
  let short = bodyRaw.trim().slice(0, 600);
  if (!short) return `HTTP ${status}`;
  try {
    const j = JSON.parse(short);
    const msg: unknown = j?.error ?? j?.message ?? j?.detail;
    if (typeof msg === "string") short = msg;
  } catch {
    /* pas JSON → on garde texte brut */
  }
  // Normalisations courtes connues
  if (short.includes("signal: killed")) short = "mémoire saturée (processus tué par le système — OOM)";
  else if (short.includes("context size too large")) short = "taille contexte demandée trop grande pour le modèle";
  else if (short.includes("context window")) short = "prompt dépasse la fenêtre de contexte du modèle";
  return `HTTP ${status} · ${short}`;
}

/** Complétion de chat. Renvoie `ok:false` (avec `error`) si le runtime est injoignable. */
export async function chatComplete(
  cfg: LlmProviderConfig,
  messages: LlmMessage[],
  opts: { signal?: AbortSignal } = {},
): Promise<LlmResult> {
  const { signal, done, ctrl } = await withTimeout(AI_TIMEOUT_MS);
  // INTERRUPTIBLE. Le runtime sert les appels un à la fois : un calcul de fond
  // déjà parti ne peut pas être « dépassé » par la question d'un opérateur — il
  // ne peut qu'être ANNULÉ. Couper la requête HTTP libère la place côté runtime,
  // qui cesse de générer pour un client disparu.
  const relais = () => ctrl.abort();
  if (opts.signal?.aborted) return { ok: false, text: "", provider: cfg.id, error: "annulé", aborted: true };
  opts.signal?.addEventListener("abort", relais, { once: true });
  try {
    if (cfg.id === "ollama") {
      const r = await fetch(`${cfg.endpoint}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `think: false` — DÉCISIF. Les modèles à raisonnement (qwen3, gemma4…)
        // écrivent leur réflexion dans un champ `thinking` SÉPARÉ et laissent
        // `content` vide tant qu'ils n'ont pas conclu. ARGOS ne lit que
        // `content` : l'assistant paraissait donc muet alors que le modèle
        // répondait — l'un des symptômes les plus trompeurs qui soient, puisque
        // rien n'échoue. Le drapeau est ignoré sans dommage par les modèles qui
        // ne raisonnent pas ; il est donc envoyé dans tous les cas.
        body: JSON.stringify({
          model: cfg.model,
          messages,
          stream: false,
          think: false,
          // MAINTIEN EN MÉMOIRE. Ollama décharge le modèle après cinq minutes
          // d'inactivité ; le rappel suivant doit alors relire une vingtaine de
          // gigaoctets — mesuré ici à 84 s, contre 9 s à modèle chaud. Gonfler
          // le délai d'attente pour l'absorber ferait tourner l'écran deux
          // minutes sur un appel réellement cassé ; mieux vaut ne pas décharger.
          // Un poste de commandement consulte l'assistant par salves, pas une
          // fois par heure : garder le modèle résident correspond à l'usage.
          keep_alive: "30m",
          options: { ...OLLAMA_OPTIONS, temperature: cfg.temperature ?? OLLAMA_OPTIONS.temperature },
        }),
        signal,
      });
      if (!r.ok) {
        let body = "";
        try { body = await r.text(); } catch { /* ignore */ }
        return { ok: false, text: "", provider: cfg.id, error: simplifyOllamaError(r.status, body) };
      }
      const data = await r.json();
      const texte = (data?.message?.content ?? "") as string;
      // UNE RÉPONSE VIDE N'EST PAS UNE RÉUSSITE. Rendre `ok: true` avec une
      // chaîne vide fait paraître l'assistant cassé sans que rien ne le dise —
      // exactement ce qui a rendu ce défaut difficile à trouver. On nomme la
      // cause la plus probable plutôt que de laisser un blanc.
      if (!texte.trim()) {
        const raison = data?.message?.thinking
          ? "le modèle a raisonné sans conclure (budget de jetons atteint)"
          : "réponse vide du modèle";
        return { ok: false, text: "", provider: cfg.id, error: `${cfg.model} : ${raison}` };
      }
      return { ok: true, text: texte, provider: cfg.id };
    }
    if (cfg.id === "vllm") {
      const r = await fetch(`${cfg.endpoint}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: cfg.model, messages, temperature: cfg.temperature ?? 0.2, stream: false }),
        signal,
      });
      if (!r.ok) return { ok: false, text: "", provider: cfg.id, error: `HTTP ${r.status}` };
      const data = await r.json();
      return { ok: true, text: data?.choices?.[0]?.message?.content ?? "", provider: cfg.id };
    }
    return { ok: false, text: "", provider: cfg.id, error: "Fournisseur non pris en charge côté client" };
  } catch (e) {
    if (opts.signal?.aborted) return { ok: false, text: "", provider: cfg.id, error: "annulé", aborted: true };
    return { ok: false, text: "", provider: cfg.id, error: e instanceof Error ? e.message : "réseau" };
  } finally {
    opts.signal?.removeEventListener("abort", relais);
    done();
  }
}

/**
 * Complétion en streaming : `onToken` reçoit le texte cumulé à chaque fragment.
 * Ollama renvoie du NDJSON ; vLLM n'est pas streamé ici et retombe sur `chatComplete`.
 */
export async function chatStream(
  cfg: LlmProviderConfig,
  messages: LlmMessage[],
  opts: { onToken: (acc: string) => void },
): Promise<LlmResult> {
  if (cfg.id !== "ollama") return chatComplete(cfg, messages);
  const { signal, done } = await withTimeout(180000);
  try {
    const r = await fetch(`${cfg.endpoint}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `think: false` — le flux en avait BESOIN encore plus que l'appel bloquant :
      // un modèle à raisonnement écrit d'abord dans `thinking`, et `content` reste
      // vide fragment après fragment. Mesuré : 1er jeton visible à T+79,6 s, tout
      // le raisonnement caché. Avec le drapeau, 1er jeton à ~0,2 s à chaud.
      body: JSON.stringify({
        model: cfg.model,
        messages,
        stream: true,
        think: false,
        keep_alive: "30m",
        options: { ...OLLAMA_OPTIONS, temperature: cfg.temperature ?? OLLAMA_OPTIONS.temperature },
      }),
      signal,
    });
    if (!r.ok || !r.body) {
      let body = "";
      try { if (r.body) body = await r.text(); } catch { /* ignore */ }
      return { ok: false, text: "", provider: cfg.id, error: simplifyOllamaError(r.status, body) };
    }
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let acc = "";
    let buffer = "";
    let stats: LlmStats | undefined;
    for (;;) {
      const { done: streamDone, value } = await reader.read();
      if (streamDone) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const j = JSON.parse(line) as Record<string, unknown> & { message?: { content?: string } };
          const chunk: string = j?.message?.content ?? "";
          if (chunk) {
            acc += chunk;
            opts.onToken(acc);
          }
          stats = statsOllama(j) ?? stats;
        } catch {
          /* ligne partielle ignorée */
        }
      }
    }
    // Un flux sans un seul fragment de texte N'EST PAS une réussite : le dire
    // évite l'écran muet qui a rendu ce défaut si long à trouver.
    if (!acc.trim()) return { ok: false, text: "", provider: cfg.id, error: `${cfg.model} : réponse vide du modèle`, stats };
    return { ok: true, text: acc, provider: cfg.id, stats };
  } catch (e) {
    return { ok: false, text: "", provider: cfg.id, error: e instanceof Error ? e.message : "réseau" };
  } finally {
    done();
  }
}
