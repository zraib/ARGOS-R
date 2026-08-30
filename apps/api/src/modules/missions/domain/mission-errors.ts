// ============================================================================
// ARGOS — erreurs de domaine des missions
//
// Erreurs MÉTIER, pas des `HttpException` : le domaine et le service ignorent
// qu'ils sont exposés en HTTP. La traduction en 400/403/404/409 revient à
// l'adaptateur HTTP. Le même service peut donc être piloté par une commande,
// un consommateur de file ou un test.
// ============================================================================

import type { MissionState } from "@/modules/missions/domain/mission";

/** Erreur de base du domaine « missions ». */
export abstract class MissionDomainError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Donnée d'entrée invalide (champ vide, trop long, valeur hors énumération). */
export class MissionValidationError extends MissionDomainError {
  constructor(message: string) {
    super(message);
  }
}

/** Transition de cycle de vie interdite par la politique du domaine. */
export class MissionTransitionError extends MissionDomainError {
  constructor(
    readonly from: MissionState,
    readonly to: MissionState,
    message?: string,
  ) {
    super(message ?? `Transition interdite : « ${from} » → « ${to} ».`);
  }
}

/**
 * Le demandeur n'est pas la partie habilitée à ce geste.
 *
 * Ce n'est PAS le RBAC (qui dit « ce rôle peut agir sur les missions ») mais
 * la règle de boucle : seul le destinataire accepte ou refuse, seul l'émetteur
 * annule. Une permission ne remplace pas cette règle — un OPCOM habilité ne
 * peut pas accepter à la place de l'unité destinataire.
 */
export class MissionActorError extends MissionDomainError {
  constructor(message: string) {
    super(message);
  }
}

/** Mission introuvable. */
export class MissionNotFoundError extends MissionDomainError {
  constructor(readonly id: string) {
    super(`Mission introuvable : ${id}.`);
  }
}
