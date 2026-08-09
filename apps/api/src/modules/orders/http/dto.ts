// ============================================================================
// ARGOS — DTO HTTP des bons de travail
//
// Ces classes appartiennent à l'ADAPTATEUR HTTP, pas au domaine : elles
// portent la validation de surface (class-validator) et la documentation
// OpenAPI. Le service reçoit des objets simples ; il ne connaît pas ces types.
// C'est ce qui permet de le piloter depuis une CLI ou un test sans instancier
// un seul DTO.
// ============================================================================

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { ORDER_PRIORITIES, ORDER_STATUSES } from "@/modules/orders/domain/order";

/** Ouverture d'un bon de travail. */
export class CreateOrderDto {
  @ApiProperty({ example: "Rétablir l'accès RP2010 (déblaiement)" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subject!: string;

  @ApiProperty({ example: "3e BG", description: "Unité responsable de l'exécution" })
  @IsString()
  @MinLength(1)
  unit!: string;

  @ApiProperty({ enum: ORDER_PRIORITIES, example: "high" })
  @IsIn(ORDER_PRIORITIES)
  priority!: (typeof ORDER_PRIORITIES)[number];

  @ApiProperty({ example: "Aujourd'hui 14:00", description: "Échéance affichable" })
  @IsString()
  @MinLength(1)
  sla!: string;

  @ApiPropertyOptional({ example: "Adj. R. Rahmouni" })
  @IsOptional()
  @IsString()
  assignee?: string;

  @ApiPropertyOptional({ example: "INC-2607", description: "Incident de rattachement" })
  @IsOptional()
  @IsString()
  incidentId?: string;
}

/** Correction des données descriptives d'un bon. */
export class AmendOrderDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subject?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  unit?: string;

  @ApiPropertyOptional({ enum: ORDER_PRIORITIES })
  @IsOptional()
  @IsIn(ORDER_PRIORITIES)
  priority?: (typeof ORDER_PRIORITIES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  sla?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  incidentId?: string;
}

/** Désignation de l'exécutant. */
export class AssignOrderDto {
  @ApiProperty({ example: "Cne. A. Kabbaj" })
  @IsString()
  @MinLength(1)
  assignee!: string;
}

/** Changement d'étape du cycle de vie. */
export class ChangeOrderStatusDto {
  @ApiProperty({ enum: ORDER_STATUSES, example: "inprogress" })
  @IsIn(ORDER_STATUSES)
  status!: (typeof ORDER_STATUSES)[number];
}

/** Annulation motivée. */
export class CancelOrderDto {
  @ApiProperty({ example: "Doublon du BT-3388" })
  @IsString()
  @MinLength(1)
  reason!: string;
}
