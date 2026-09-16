// ============================================================================
// ARGOS — suppression d'entité : ce que les contrôleurs partagent
//
// Un `?force=true` lu de la même façon partout, et un 409 qui dit CE QUI
// retient l'entité — l'opérateur sait quoi défaire, ou choisit de forcer.
// ============================================================================

import { ConflictException } from "@nestjs/common";

/** `?force=true` / `?force=1` : passer outre les garde-fous. */
export function isForced(q: string | undefined): boolean {
  return q === "true" || q === "1";
}

/** 409 structuré : la liste des garde-fous, et le moyen de passer outre. */
export function entityDeleteConflict(blockers: string[]): ConflictException {
  return new ConflictException({
    statusCode: 409,
    error: "Conflict",
    message: `Suppression refusée : ${blockers.join(" ; ")}. Ajoutez ?force=true pour passer outre.`,
    blockers,
  });
}
