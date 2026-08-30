import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { MISSION_KINDS, MISSION_MILESTONES } from "@/modules/missions/domain/mission";

// ============================================================================
// ARGOS — corps de requête du module missions
//
// La validation de FORME est ici (champ présent, longueur, énumération) ; la
// validation MÉTIER reste dans l'agrégat. L'API valide en
// `forbidNonWhitelisted` : tout champ non déclaré fait échouer la requête.
// ============================================================================

/** Partie prenante d'une mission (émetteur ou destinataire). */
export class PartyDto {
  @ApiProperty({ example: "resp_unit", description: "Rôle attendu du côté concerné" })
  @IsString() @MinLength(1) @MaxLength(40)
  role!: string;

  @ApiPropertyOptional({ example: "m.zraib", description: "Matricule, si la partie nomme une personne" })
  @IsOptional() @IsString() @MaxLength(60)
  userId?: string;

  @ApiPropertyOptional({ example: "U2", description: "Entité concernée (unité, hôpital, abri, morgue)" })
  @IsOptional() @IsString() @MaxLength(40)
  entity?: string;
}

/** Charge utile — les champs utiles dépendent de `kind` (validé par le domaine). */
export class MissionPayloadDto {
  @ApiProperty({ enum: MISSION_KINDS })
  @IsIn(MISSION_KINDS as unknown as string[])
  kind!: (typeof MISSION_KINDS)[number];

  // --- kind: order ---
  @ApiPropertyOptional({ example: "U2", description: "Unité engagée (kind=order)" })
  @IsOptional() @IsString() @MaxLength(40)
  unitId?: string;

  @ApiPropertyOptional({ description: "Temps de trajet estimé, minutes (kind=order)" })
  @IsOptional() @IsInt() @Min(0)
  etaMin?: number;

  // --- kind: resource_request ---
  @ApiPropertyOptional({ example: "eau", description: "Capacité demandée (kind=resource_request)" })
  @IsOptional() @IsString() @MaxLength(40)
  capability?: string;

  @ApiPropertyOptional({ enum: ["low", "medium", "high"], description: "Urgence (kind=resource_request)" })
  @IsOptional() @IsIn(["low", "medium", "high"])
  urgency?: "low" | "medium" | "high";

  // --- kind: transfer ---
  @ApiPropertyOptional({ enum: ["casualty", "body", "displaced"], description: "Objet du transfert" })
  @IsOptional() @IsIn(["casualty", "body", "displaced"])
  subject?: "casualty" | "body" | "displaced";

  @ApiPropertyOptional({ description: "Entité de départ (kind=transfer)" })
  @IsOptional() @IsString() @MaxLength(40)
  fromEntity?: string;

  @ApiPropertyOptional({ description: "Entité d'arrivée (kind=transfer)" })
  @IsOptional() @IsString() @MaxLength(40)
  toEntity?: string;

  @ApiPropertyOptional({
    enum: ["red", "yellow", "green", "black"],
    description:
      "Catégorie de triage. AUCUNE donnée nominative ne transite par un transfert (arbitrage Q3 du plan d'exécution).",
  })
  @IsOptional() @IsIn(["red", "yellow", "green", "black"])
  triage?: "red" | "yellow" | "green" | "black";

  @ApiPropertyOptional({ description: "Précision libre" })
  @IsOptional() @IsString() @MaxLength(400)
  note?: string;
}

/** Émission d'une mission. */
export class IssueMissionDto {
  @ApiProperty({ example: "INC-2613", description: "Incident de rattachement — toute mission y est ancrée" })
  @IsString() @MinLength(1)
  incidentId!: string;

  @ApiProperty({ example: "1er GI — renfort sur zone" })
  @IsString() @MinLength(1) @MaxLength(200)
  label!: string;

  @ApiProperty({ type: PartyDto })
  @ValidateNested() @Type(() => PartyDto)
  to!: PartyDto;

  @ApiPropertyOptional({ type: PartyDto, description: "Émetteur — déduit de la session si absent" })
  @IsOptional() @ValidateNested() @Type(() => PartyDto)
  from?: PartyDto;

  @ApiProperty({ type: MissionPayloadDto })
  @ValidateNested() @Type(() => MissionPayloadDto)
  payload!: MissionPayloadDto;
}

/** Refus ou annulation — le motif est ce qui rend le geste exploitable. */
export class ReasonDto {
  @ApiProperty({ example: "Unité déjà engagée sur INC-2607" })
  @IsString() @MinLength(1) @MaxLength(400)
  reason!: string;
}

/** Franchissement d'un jalon d'exécution. */
export class MilestoneDto {
  @ApiProperty({ enum: MISSION_MILESTONES })
  @IsIn(MISSION_MILESTONES as unknown as string[])
  key!: (typeof MISSION_MILESTONES)[number];
}
