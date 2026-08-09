// ============================================================================
// ARGOS — adaptateur HTTP des bons de travail
//
// Rôle unique (SRP) : traduire HTTP ↔ cas d'usage. Il valide la forme (DTO),
// appelle `OrderService`, et convertit les erreurs de DOMAINE en codes HTTP.
// Aucune règle métier ici : si une condition d'acceptation se décide dans ce
// fichier, c'est qu'elle est à la mauvaise place.
//
// Le RBAC reste appliqué côté serveur (`@RequirePermission`, default-deny) et
// les mutations sont journalisées par l'intercepteur d'audit global.
// ============================================================================

import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { OrderService } from "@/modules/orders/application/order.service";
import {
  OrderNotFoundError,
  OrderTransitionError,
  OrderValidationError,
} from "@/modules/orders/domain/order-errors";
import { isOrderPriority, isOrderStatus, ORDER_PRIORITIES, ORDER_STATUSES } from "@/modules/orders/domain/order";
import type { OrderQuery } from "@/modules/orders/ports/order-repository.port";
import {
  AmendOrderDto,
  AssignOrderDto,
  CancelOrderDto,
  ChangeOrderStatusDto,
  CreateOrderDto,
} from "@/modules/orders/http/dto";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import type { AuthUser } from "@/common/types/auth-user";

/**
 * Traduit une erreur de domaine en réponse HTTP. Point unique de conversion :
 * le domaine reste ignorant du protocole.
 */
function toHttp(err: unknown): never {
  if (err instanceof OrderNotFoundError) throw new NotFoundException(err.message);
  if (err instanceof OrderTransitionError) throw new ConflictException(err.message);
  if (err instanceof OrderValidationError) throw new BadRequestException(err.message);
  throw err;
}

/** Exécute un cas d'usage en convertissant les erreurs de domaine. */
async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    return toHttp(err);
  }
}

@ApiTags("orders")
@ApiBearerAuth()
@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrderService) {}

  @Get()
  @RequirePermission("workorders:read")
  @ApiOperation({ summary: "Liste des bons de travail (filtrable)" })
  @ApiQuery({ name: "status", required: false, enum: ORDER_STATUSES })
  @ApiQuery({ name: "priority", required: false, enum: ORDER_PRIORITIES })
  @ApiQuery({ name: "unit", required: false })
  @ApiQuery({ name: "assignee", required: false })
  @ApiQuery({ name: "incidentId", required: false })
  list(
    @Query("status") status?: string,
    @Query("priority") priority?: string,
    @Query("unit") unit?: string,
    @Query("assignee") assignee?: string,
    @Query("incidentId") incidentId?: string,
  ) {
    const query: OrderQuery = {};
    if (status !== undefined) {
      if (!isOrderStatus(status)) throw new BadRequestException(`Statut inconnu : ${status}`);
      query.status = status;
    }
    if (priority !== undefined) {
      if (!isOrderPriority(priority)) throw new BadRequestException(`Priorité inconnue : ${priority}`);
      query.priority = priority;
    }
    if (unit !== undefined) query.unit = unit;
    if (assignee !== undefined) query.assignee = assignee;
    if (incidentId !== undefined) query.incidentId = incidentId;
    return this.orders.list(query);
  }

  @Get("summary")
  @RequirePermission("workorders:read")
  @ApiOperation({ summary: "Indicateurs des bons de travail (ouverts, en cours, urgents)" })
  summary() {
    return this.orders.summary();
  }

  @Get(":id")
  @RequirePermission("workorders:read")
  @ApiOperation({ summary: "Détail d'un bon de travail" })
  getOne(@Param("id") id: string) {
    return run(() => this.orders.getById(id));
  }

  @Post()
  @RequirePermission("workorders:create")
  @ApiOperation({ summary: "Ouvrir un bon de travail (état « demandé »)" })
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: AuthUser) {
    return run(() => this.orders.create(dto, user.username));
  }

  @Patch(":id")
  @RequirePermission("workorders:update")
  @ApiOperation({ summary: "Corriger les données descriptives d'un bon" })
  amend(@Param("id") id: string, @Body() dto: AmendOrderDto, @CurrentUser() user: AuthUser) {
    return run(() => this.orders.amend(id, dto, user.username));
  }

  @Patch(":id/assignee")
  @RequirePermission("workorders:assign")
  @ApiOperation({ summary: "Désigner l'exécutant d'un bon" })
  assign(@Param("id") id: string, @Body() dto: AssignOrderDto, @CurrentUser() user: AuthUser) {
    return run(() => this.orders.assign(id, dto.assignee, user.username));
  }

  @Patch(":id/status")
  @RequirePermission("workorders:update")
  @ApiOperation({ summary: "Faire avancer un bon dans son cycle de vie" })
  changeStatus(@Param("id") id: string, @Body() dto: ChangeOrderStatusDto, @CurrentUser() user: AuthUser) {
    return run(() => this.orders.changeStatus(id, dto.status, user.username));
  }

  @Patch(":id/cancel")
  @RequirePermission("workorders:update")
  @ApiOperation({ summary: "Annuler un bon de travail (motif obligatoire)" })
  cancel(@Param("id") id: string, @Body() dto: CancelOrderDto, @CurrentUser() user: AuthUser) {
    return run(() => this.orders.cancel(id, dto.reason, user.username));
  }
}
