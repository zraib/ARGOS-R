// ============================================================================
// ARGOS — adaptateur d'événements : journalisation
//
// Implémentation par défaut du port `OrderEventPublisher` : elle trace, sans
// rien produire d'observable ailleurs dans l'application. C'est délibéré —
// brancher le module « bons de travail » ne doit modifier aucun comportement
// existant (le fil d'événements du poste de commandement reste inchangé).
//
// Diffuser réellement les événements se fait en écrivant un autre adaptateur
// (fil d'événements, EMQX, webhook) et en changeant UNE ligne de
// `orders.module.ts`. Ni le service ni le domaine ne bougent.
//
// Robustesse : `publish` n'échoue jamais. Un incident de diffusion ne doit pas
// faire échouer une mutation métier déjà persistée.
// ============================================================================

import { Injectable, Logger } from "@nestjs/common";
import type { OrderEvent, OrderEventPublisher } from "@/modules/orders/ports/order-events.port";

@Injectable()
export class LoggingOrderEventPublisher implements OrderEventPublisher {
  private readonly logger = new Logger("OrderEvents");

  async publish(event: OrderEvent): Promise<void> {
    try {
      const from = event.from ? ` (depuis « ${event.from} »)` : "";
      const actor = event.actor ? ` par ${event.actor}` : "";
      this.logger.log(`${event.type} — ${event.order.id} « ${event.order.subject} » → ${event.order.status}${from}${actor}`);
    } catch {
      /* la diffusion est best-effort : elle ne remet jamais en cause l'écriture */
    }
  }
}
