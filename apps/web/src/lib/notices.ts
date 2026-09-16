// ============================================================================
// ARGOS — alertes adressées : ce qui reste à voir, et l'heure à afficher
// ============================================================================

import type { Notice } from "@/lib/types";

/** Les alertes que l'opérateur n'a pas encore ouvertes ni acquittées (ADR 0016). */
export function unseenNotices(notices: readonly Notice[], seen: readonly string[]): Notice[] {
  const vu = new Set(seen);
  return notices.filter((n) => !n.acked && !vu.has(n.id));
}

/** Marque une alerte acquittée (ou toutes) dans la liste, sans muter. */
export function ackNotices(notices: readonly Notice[], id: string | "all"): Notice[] {
  return notices.map((n) => (id === "all" || n.id === id ? { ...n, acked: true } : n));
}

/** Fusionne une alerte reçue : en tête, sans doublon d'identifiant. */
export function mergeNotice(notices: readonly Notice[], incoming: Notice): Notice[] {
  return notices.some((n) => n.id === incoming.id) ? [...notices] : [incoming, ...notices];
}

/** « HH:MM » local d'une alerte ; l'horodatage illisible rend « — ». */
export function noticeTime(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
