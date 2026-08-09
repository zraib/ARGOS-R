// ============================================================================
// ARGOS — module « bons de travail » : RACINE DE COMPOSITION
//
// C'est le SEUL endroit du module qui connaît à la fois les abstractions et
// leurs implémentations. Tout le reste du code ne manipule que des ports.
// Le choix mémoire / PostgreSQL se fait ici, à la lecture de `DB_DRIVER` :
// changer de base de données ne modifie ni le service, ni le domaine, ni le
// contrôleur — c'est exactement ce que garantit l'inversion des dépendances.
//
// Dépendances du module vers le reste de l'application : `DatabaseModule`
// (global, jeton DRIZZLE) et les gardes RBAC globales. Il n'importe aucun
// autre module métier et n'est importé par aucun : le brancher ne change donc
// rien au comportement existant de la plateforme.
// ============================================================================

import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DRIZZLE } from "@/db/database.module";
import type { Db } from "@/db/client";
import type { DbDriver } from "@/config/configuration";
import { OrderService } from "@/modules/orders/application/order.service";
import { OrdersController } from "@/modules/orders/http/orders.controller";
import { ORDER_REPOSITORY, type OrderRepository } from "@/modules/orders/ports/order-repository.port";
import { CLOCK } from "@/modules/orders/ports/clock.port";
import { ORDER_ID_GENERATOR } from "@/modules/orders/ports/order-id.port";
import { ORDER_EVENT_PUBLISHER } from "@/modules/orders/ports/order-events.port";
import { InMemoryOrderRepository } from "@/modules/orders/infrastructure/in-memory-order.repository";
import { DrizzleOrderRepository } from "@/modules/orders/infrastructure/drizzle-order.repository";
import { SystemClock } from "@/modules/orders/infrastructure/system-clock";
import { SequentialOrderIdGenerator } from "@/modules/orders/infrastructure/sequential-order-id.generator";
import { LoggingOrderEventPublisher } from "@/modules/orders/infrastructure/logging-order-event.publisher";

@Module({
  controllers: [OrdersController],
  providers: [
    OrderService,
    {
      // Port de persistance → adaptateur choisi au démarrage.
      provide: ORDER_REPOSITORY,
      inject: [ConfigService, DRIZZLE],
      useFactory: (config: ConfigService, db: Db | null): OrderRepository =>
        config.get<DbDriver>("dbDriver") === "postgres" && db
          ? new DrizzleOrderRepository(db)
          : new InMemoryOrderRepository(),
    },
    { provide: CLOCK, useClass: SystemClock },
    { provide: ORDER_ID_GENERATOR, useClass: SequentialOrderIdGenerator },
    // Adaptateur volontairement passif : voir logging-order-event.publisher.ts.
    { provide: ORDER_EVENT_PUBLISHER, useClass: LoggingOrderEventPublisher },
  ],
  exports: [OrderService],
})
export class OrdersModule {}
