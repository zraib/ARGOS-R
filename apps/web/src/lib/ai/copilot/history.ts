// ============================================================================
// lib/ai/copilot/history.ts — l'historique que l'on montre au modèle
//
// LE BUDGET DE FENÊTRE EST UNE CONTRAINTE DURE. Qwen 2.5 14b : 32 768 jetons
// au total, imposés par le GGUF ; Ollama refuse au-delà. Système ~1 500,
// message utilisateur ~3 500, réponse 4 000 : il reste peu pour l'historique.
// Deux tours (quatre messages), chacun tronqué, tiennent dans ~1 000 jetons —
// facteur de sécurité ×3 sur la fenêtre.
// ============================================================================

/** Ce que l'historique a besoin de savoir d'un message du journal. */
export interface LogEntryLike {
  id: string;
  role: string;
  text: string;
  refused?: boolean;
}

export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };

/** Tours conservés dans l'invite (un tour = question + réponse). */
export const MAX_TURNS = 2;
/** Au-delà de ce nombre de messages, le journal est purgé au prochain tour. */
export const PURGE_ABOVE = 8;
/** Ce que la purge garde : les 4 derniers messages (deux tours). */
export const PURGE_KEEP = 4;
export const MAX_ASSISTANT_CHARS = 800;
export const MAX_USER_CHARS = 600;

/**
 * Construit les messages d'historique à partir du journal.
 *
 * Les refus du garde-fou sont exclus : rejouer un refus apprendrait au modèle
 * la forme du refus, pas la conversation. La troncature est DURE : jamais
 * 40 000 jetons d'ancien markdown ne remontent dans l'invite.
 */
export function buildLlmHistory(log: LogEntryLike[], maxTurns = MAX_TURNS): LlmMessage[] {
  const out: LlmMessage[] = [];
  for (const m of log.slice(-(maxTurns * 2))) {
    if (!m.text || !m.text.trim() || m.refused) continue;
    let content = m.text;
    if (m.role === "assistant" && content.length > MAX_ASSISTANT_CHARS) content = content.slice(0, MAX_ASSISTANT_CHARS) + "\n[…tronqué…]";
    if (m.role === "user" && content.length > MAX_USER_CHARS) content = content.slice(0, MAX_USER_CHARS) + "\n[…trop long tronqué…]";
    if (m.role === "user" || m.role === "assistant") out.push({ role: m.role, content });
  }
  return out;
}

/**
 * Purge douce du journal : au-delà de `PURGE_ABOVE` messages, ne garde que les
 * `PURGE_KEEP` derniers messages IA. Les entrées qui ne sont pas des messages
 * IA (identifiant sans préfixe `ai-`) sont toujours conservées.
 *
 * Rend le même tableau si rien ne change, pour que l'appelant sache s'il doit
 * écrire dans le magasin.
 */
export function purgeLog<T extends LogEntryLike>(all: T[], visible: LogEntryLike[]): T[] {
  if (visible.length <= PURGE_ABOVE) return all;
  const keep = new Set(visible.slice(visible.length - PURGE_KEEP).map((m) => m.id));
  const purged = all.filter((m) => keep.has(m.id) || !m.id.startsWith("ai-"));
  return purged.length === all.length ? all : purged;
}
