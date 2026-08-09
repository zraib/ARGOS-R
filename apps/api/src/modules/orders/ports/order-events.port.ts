// ============================================================================
// ARGOS — port de publication d'événements
//
// Le service annonce ce qui s'est passé ; il ne décide pas de ce qu'on en
// fait. Selon l'adaptateur branché, le même événement alimente le fil
// d'événements du poste de commandement, un journal, un bus MQTT (EMQX) ou
// rien du tout. Ajouter un canal de diffusion ne modifie pas le service
// (principe ouvert/fermé).
// ============================================================================

import type { OrderSnapshot, OrderStatus } from "@/modules/orders/domain/order";

/** Événement métier émis après une mutation réussie. */
export interface OrderEvent {
  type: "order.created" | "order.assigned" | "order.status_changed" | "order.cancelled" | "order.amended";
  order: OrderSnapshot;
  /** Statut précédent, pour les changements d'étape. */
  from?: OrderStatus;
  /** Identifiant de l'utilisateur à l'origine de l'action. */
  actor?: string;
  /** Horodatage ISO 8601. */
  at: string;
}

/** Diffuseur d'événements « bons de travail ». */
export interface OrderEventPublisher {
  publish(event: OrderEvent): Promise<void>;
}

export const ORDER_EVENT_PUBLISHER = Symbol("ORDER_EVENT_PUBLISHER");
