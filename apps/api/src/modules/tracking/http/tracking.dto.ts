import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsObject, IsOptional, IsString, Length, Matches, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { IMEI_LENGTH } from "@/modules/tracking/codec8";
import { TRACKER_TARGET_KINDS, type TrackerTargetKind } from "@/modules/tracking/tracking.types";

// ============================================================================
// ARGOS — DTO du suivi de traceurs FMC920 (lot N-2)
//
// Les propriétés sont typées nommément (et non `Record<string, unknown>`) pour
// que le client généré depuis l'OpenAPI porte de vrais types côté web.
// ============================================================================

export class TrackerTargetDto {
  @ApiProperty({ enum: TRACKER_TARGET_KINDS, description: "Nature du moyen équipé." })
  @IsIn(TRACKER_TARGET_KINDS)
  kind!: TrackerTargetKind;

  @ApiProperty({ description: "Identifiant du moyen dans son registre.", example: "U3" })
  @IsString()
  @Length(1, 40)
  id!: string;
}

export class DeclareTrackerDto {
  @ApiProperty({
    description:
      "IMEI à 15 chiffres, imprimé sous le boîtier. C'est la SEULE identité que le protocole " +
      "Teltonika présente : un IMEI non déclaré ici est refusé à la poignée de main.",
    example: "356307042441013",
  })
  @IsString()
  @Matches(new RegExp(`^\\d{${IMEI_LENGTH}}$`), { message: `L'IMEI doit compter ${IMEI_LENGTH} chiffres.` })
  imei!: string;

  @ApiProperty({ description: "Nom d'usage affiché sur la carte.", example: "Ambulance 04" })
  @IsString()
  @Length(1, 60)
  label!: string;

  @ApiPropertyOptional({ type: TrackerTargetDto, description: "Moyen équipé par ce traceur." })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TrackerTargetDto)
  target?: TrackerTargetDto;

  @ApiPropertyOptional({ description: "Opération sur laquelle le moyen est engagé.", example: "INC-2612" })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  incidentId?: string;
}

export class UpdateTrackerDto {
  @ApiPropertyOptional({ description: "Nom d'usage affiché sur la carte." })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  label?: string;

  @ApiPropertyOptional({ type: TrackerTargetDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TrackerTargetDto)
  target?: TrackerTargetDto;

  @ApiPropertyOptional({ description: "Opération d'engagement." })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  incidentId?: string;

  @ApiPropertyOptional({ description: "Retirer du service sans effacer l'historique." })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}
