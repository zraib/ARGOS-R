import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Length, Matches, Max, Min, ValidateIf, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { IMEI_LENGTH } from "@/modules/tracking/codec8";
import { TRACKER_SOURCES, TRACKER_TARGET_KINDS, type TrackerSource, type TrackerTargetKind } from "@/modules/tracking/tracking.types";

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
  @ApiPropertyOptional({ enum: TRACKER_SOURCES, description: "device = boîtier FMC920 (IMEI) ; app = partage de position par l'application d'un compte. Absent : device." })
  @IsOptional()
  @IsIn(TRACKER_SOURCES)
  source?: TrackerSource;

  @ApiPropertyOptional({
    description:
      "Boîtier seulement — IMEI à 15 chiffres, imprimé sous le boîtier. C'est la SEULE identité que le protocole " +
      "Teltonika présente : un IMEI non déclaré ici est refusé à la poignée de main.",
    example: "356307042441013",
  })
  @ValidateIf((o: DeclareTrackerDto) => o.source !== "app")
  @IsString()
  @Matches(new RegExp(`^\\d{${IMEI_LENGTH}}$`), { message: `L'IMEI doit compter ${IMEI_LENGTH} chiffres.` })
  imei?: string;

  @ApiPropertyOptional({ description: "Partage par l'application seulement — matricule du compte qui partagera sa position (défaut : le compte qui déclare).", example: "n.fassi" })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  account?: string;

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

/** Une position envoyée par l'application du compte qui partage. */
export class SharePositionDto {
  @ApiProperty({ description: "[lng, lat] en degrés.", example: [-7.6, 33.58], type: [Number] })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @IsNumber({}, { each: true })
  ll!: [number, number];

  @ApiPropertyOptional({ description: "Millisecondes UTC de la mesure (défaut : réception)." })
  @IsOptional()
  @IsInt()
  @Min(0)
  at?: number;

  @ApiPropertyOptional({ description: "Précision horizontale en mètres." })
  @IsOptional() @IsNumber() @Min(0) @Max(100_000)
  accuracyM?: number;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(1_000)
  speedKmh?: number;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(360)
  headingDeg?: number;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(-500) @Max(10_000)
  altitudeM?: number;
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
