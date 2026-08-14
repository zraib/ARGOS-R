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
}

async function withTimeout(ms: number): Promise<{ signal: AbortSignal; done: () => void }> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(id) };
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

// Paramètres mémoire stricts pour éviter l'OOM (signal: killed) sur macOS :
// - num_ctx ≤ 16384 (÷2 vs 32768 → KV cache ÷2, économie ~1.5-2Go)
// - num_batch = 128 (÷4 vs 512 → pic évaluation prompt ÷4)
const OLLAMA_OPTIONS = {
  temperature: 0.2,
  num_ctx: 16384,
  num_batch: 128,
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
export async function chatComplete(cfg: LlmProviderConfig, messages: LlmMessage[]): Promise<LlmResult> {
  const { signal, done } = await withTimeout(AI_TIMEOUT_MS);
  try {
    if (cfg.id === "ollama") {
      const r = await fetch(`${cfg.endpoint}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: cfg.model, messages, stream: false, options: OLLAMA_OPTIONS }),
        signal,
      });
      if (!r.ok) {
        let body = "";
        try { body = await r.text(); } catch { /* ignore */ }
        return { ok: false, text: "", provider: cfg.id, error: simplifyOllamaError(r.status, body) };
      }
      const data = await r.json();
      return { ok: true, text: data?.message?.content ?? "", provider: cfg.id };
    }
    if (cfg.id === "vllm") {
      const r = await fetch(`${cfg.endpoint}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: cfg.model, messages, temperature: 0.2, stream: false }),
        signal,
      });
      if (!r.ok) return { ok: false, text: "", provider: cfg.id, error: `HTTP ${r.status}` };
      const data = await r.json();
      return { ok: true, text: data?.choices?.[0]?.message?.content ?? "", provider: cfg.id };
    }
    return { ok: false, text: "", provider: cfg.id, error: "Fournisseur non pris en charge côté client" };
  } catch (e) {
    return { ok: false, text: "", provider: cfg.id, error: e instanceof Error ? e.message : "réseau" };
  } finally {
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
      body: JSON.stringify({ model: cfg.model, messages, stream: true, options: OLLAMA_OPTIONS }),
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
    for (;;) {
      const { done: streamDone, value } = await reader.read();
      if (streamDone) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const j = JSON.parse(line);
          const chunk: string = j?.message?.content ?? "";
          if (chunk) {
            acc += chunk;
            opts.onToken(acc);
          }
        } catch {
          /* ligne partielle ignorée */
        }
      }
    }
    return { ok: true, text: acc, provider: cfg.id };
  } catch (e) {
    return { ok: false, text: "", provider: cfg.id, error: e instanceof Error ? e.message : "réseau" };
  } finally {
    done();
  }
}
