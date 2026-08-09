// ============================================================================
// ARGOS — adaptateur d'identifiants : séquence « BT-<n> »
//
// Reprend la numérotation déjà en service dans l'application (BT-3391…) en
// s'appuyant sur le port de lecture du dépôt : le générateur ignore lui aussi
// où sont stockés les bons. Le remplacer par un UUID ou une séquence Postgres
// ne touche ni le service ni le domaine.
// ============================================================================

import { Inject, Injectable } from "@nestjs/common";
import { ORDER_REPOSITORY, type OrderReader } from "@/modules/orders/ports/order-repository.port";
import type { OrderIdGenerator } from "@/modules/orders/ports/order-id.port";

/** Numéro de départ si le référentiel est vide. */
const FIRST_SEQUENCE = 3392;

@Injectable()
export class SequentialOrderIdGenerator implements OrderIdGenerator {
  // Ne dépend que de la partie LECTURE du dépôt (ségrégation des interfaces) :
  // il n'a aucun moyen d'écrire, même par erreur.
  constructor(@Inject(ORDER_REPOSITORY) private readonly orders: OrderReader) {}

  async next(): Promise<string> {
    const last = await this.orders.lastSequence();
    return `BT-${Math.max(last + 1, FIRST_SEQUENCE)}`;
  }
}
