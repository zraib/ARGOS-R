"use client";

// ============================================================================
// ARGOS — responsabilité de la session
//
// Résout « de quoi ce compte est-il responsable, et sur quelle entité ? » à
// partir du rôle actif et des affectations servies par l'API à la connexion.
//
// RAPPEL DE SÉCURITÉ : ce module ne protège rien. Il oriente l'interface. Le
// cantonnement réel est appliqué par l'API (ScopeGuard) — un utilisateur qui
// contournerait l'écran se heurterait à un 403.
// ============================================================================

import { useArgos } from "@/lib/store";
import { RESPONSIBILITY_OF_ROLE, type ResponsibilityKind, type Role } from "@/lib/roles";
import type { Hospital } from "@/lib/types";

/** Responsabilité résolue de la session courante. */
export interface SessionResponsibility {
  /** Nature d'entité pilotée, ou `null` si le rôle actif n'est pas un responsable. */
  kind: ResponsibilityKind | null;
  /** Identifiant de l'entité affectée, ou `null` si aucune. */
  entityId: string | null;
}

/** Responsabilité du rôle ACTIF (un compte multi-rôles en change en session). */
export function useResponsibility(): SessionResponsibility {
  const role = useArgos((s) => s.role);
  const sessionUser = useArgos((s) => s.sessionUser);
  const kind = RESPONSIBILITY_OF_ROLE[role] ?? null;
  return { kind, entityId: kind ? (sessionUser?.assignments?.[kind] ?? null) : null };
}

/** L'hôpital dont la session a la responsabilité, ou `null`. */
export function useMyHospital(): Hospital | null {
  const { kind, entityId } = useResponsibility();
  const hospitals = useArgos((s) => s.hospitals);
  if (kind !== "hospital" || !entityId) return null;
  return hospitals.find((h) => h.id === entityId) ?? null;
}

/** Le rôle est-il rattaché à une entité (et donc concerné par « Ma responsabilité ») ? */
export function isResponsibleRole(role: Role): boolean {
  return RESPONSIBILITY_OF_ROLE[role] !== undefined;
}

/** Classe de barre selon le taux d'occupation (seuils opérationnels partagés). */
export function loadBarClass(pct: number): string {
  if (pct >= 90) return "bg-danger-500";
  if (pct >= 75) return "bg-or-500";
  return "bg-green-500";
}
