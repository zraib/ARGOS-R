// ============================================================================
// ARGOS — erreurs de domaine des bons de travail
//
// Volontairement des erreurs MÉTIER, pas des `HttpException` NestJS : le
// domaine et le service applicatif ignorent qu'ils sont exposés en HTTP. La
// traduction en codes 400/404/409 est le travail de l'adaptateur HTTP
// (http/orders.controller.ts). Le même service peut donc être piloté par une
// commande CLI, un consommateur de file ou un test, sans rien changer.
// ============================================================================

import type { OrderStatus } from "@/modules/orders/domain/order";

/** Erreur de base du domaine « bons de travail ». */
export abstract class OrderDomainError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Donnée d'entrée invalide (champ vide, trop long, valeur hors énumération). */
export class OrderValidationError extends OrderDomainError {
  constructor(message: string) {
    super(message);
  }
}

/** Transition de cycle de vie interdite par la politique du domaine. */
export class OrderTransitionError extends OrderDomainError {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
    message?: string,
  ) {
    super(message ?? `Transition interdite : « ${from} » → « ${to} ».`);
  }
}

/** Bon de travail introuvable. */
export class OrderNotFoundError extends OrderDomainError {
  constructor(readonly id: string) {
    super(`Bon de travail introuvable : ${id}.`);
  }
}
