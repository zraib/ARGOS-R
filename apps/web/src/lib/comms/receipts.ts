// ============================================================================
// ARGOS — accusés d'une conversation directe : ce que les coches disent
//
// Une coche : envoyé (le serveur l'a). Deux : remis (le poste du correspondant
// l'a reçu). Deux, colorées : lu (il l'avait sous les yeux). L'état se lit
// sur les listes `deliveredBy` / `readBy` du message, pour le correspondant
// d'en face ; pur, pour être testé seul.
// ============================================================================

import type { CommMessage } from "@/lib/types";

export type ReceiptState = "sent" | "delivered" | "read";

const porte = (liste: readonly string[] | undefined, matricule: string) =>
  !!liste?.some((x) => x.toLowerCase() === matricule.toLowerCase());

/** L'état d'un de MES messages vis-à-vis du correspondant `other`. */
export function receiptState(m: CommMessage, other: string | undefined): ReceiptState {
  if (!other) return "sent";
  if (porte(m.readBy, other)) return "read";
  if (porte(m.deliveredBy, other)) return "delivered";
  return "sent";
}

/**
 * Applique un accusé reçu par le flux : `by` a reçu (ou lu) MES messages
 * jusqu'à `upToId`. Lire implique avoir reçu ; un brouillon (identifiant
 * négatif) n'est pas concerné. Rend la même liste si rien ne change — un
 * rendu de moins.
 */
export function applyReceipt(messages: readonly CommMessage[], by: string, state: "delivered" | "read", upToId: number): readonly CommMessage[] {
  let changed = false;
  const out = messages.map((m) => {
    if (!m.mine || m.id < 0 || m.id > upToId) return m;
    const deliveredBy = porte(m.deliveredBy, by) ? m.deliveredBy : [...(m.deliveredBy ?? []), by];
    const readBy = state === "read" && !porte(m.readBy, by) ? [...(m.readBy ?? []), by] : m.readBy;
    if (deliveredBy === m.deliveredBy && readBy === m.readBy) return m;
    changed = true;
    return { ...m, deliveredBy, readBy };
  });
  return changed ? out : messages;
}

/** Le dernier message de l'AUTRE (identifiant serveur) — jusqu'où accuser lecture ; 0 s'il n'y en a pas. */
export function lastForeignId(messages: readonly CommMessage[]): number {
  let best = 0;
  for (const m of messages) if (!m.mine && m.id > best) best = m.id;
  return best;
}
