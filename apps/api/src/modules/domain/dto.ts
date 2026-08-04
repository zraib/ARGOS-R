import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

const SEV = ["high", "medium", "low"] as const;
const ST = ["open", "prog", "closed"] as const;
const DISPO = ["ready", "deployed", "standby"] as const;

/** Bilan humain d'un incident (compteurs). */
export class CasualtiesDto {
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) dead!: number;
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) injured!: number;
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) missing!: number;
}

/** Premiers intervenants rattachés (identifiants d'unités / d'hôpitaux). */
export class RespondersDto {
  @ApiProperty({ type: [String], example: ["U2"] }) @IsArray() @IsString({ each: true }) units!: string[];
  @ApiProperty({ type: [String], example: ["H2"] }) @IsArray() @IsString({ each: true }) hospitals!: string[];
}

/** Corps de création d'un incident (déclaré depuis le wizard frontend). */
export class CreateIncidentDto {
  @ApiProperty({ example: "earthquake", description: "Identifiant d'un type du catalogue /incident-types (validé côté service)" })
  @IsString()
  @MinLength(1)
  type!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  titre!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  region!: string;

  @ApiProperty({ enum: SEV })
  @IsIn(SEV as unknown as string[])
  sev!: (typeof SEV)[number];

  @ApiProperty({ enum: ST })
  @IsIn(ST as unknown as string[])
  st!: (typeof ST)[number];

  @ApiProperty()
  @IsNumber()
  x!: number;

  @ApiProperty()
  @IsNumber()
  y!: number;

  @ApiProperty({ type: [Number], description: "[lng, lat]" })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @IsNumber({}, { each: true })
  ll!: [number, number];

  @ApiPropertyOptional({ description: "Adresse / lieu-dit (localisation fine)" })
  @IsOptional()
  @IsString()
  adresse?: string;

  @ApiPropertyOptional({ type: CasualtiesDto, description: "Bilan humain (décès, blessés, disparus)" })
  @IsOptional()
  @ValidateNested()
  @Type(() => CasualtiesDto)
  casualties?: CasualtiesDto;

  @ApiPropertyOptional({ type: RespondersDto, description: "Premiers intervenants (IDs d'unités et d'hôpitaux)" })
  @IsOptional()
  @ValidateNested()
  @Type(() => RespondersDto)
  responders?: RespondersDto;
}

/** Mise à jour partielle d'un incident (édition / archivage). */
export class UpdateIncidentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) titre?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) type?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) region?: string;
  @ApiPropertyOptional({ enum: SEV }) @IsOptional() @IsIn(SEV as unknown as string[]) sev?: (typeof SEV)[number];
  @ApiPropertyOptional({ enum: ST }) @IsOptional() @IsIn(ST as unknown as string[]) st?: (typeof ST)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() adresse?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() archived?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsNumber() x?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() y?: number;
  @ApiPropertyOptional({ type: [Number], description: "[lng, lat]" })
  @IsOptional() @IsArray() @ArrayMinSize(2) @ArrayMaxSize(2) @IsNumber({}, { each: true })
  ll?: [number, number];
  @ApiPropertyOptional({ type: CasualtiesDto })
  @IsOptional() @ValidateNested() @Type(() => CasualtiesDto)
  casualties?: CasualtiesDto;
  @ApiPropertyOptional({ type: RespondersDto })
  @IsOptional() @ValidateNested() @Type(() => RespondersDto)
  responders?: RespondersDto;
}

/** Rattachement d'un sous-incident (aléa secondaire) à un incident. */
export class CreateSubIncidentDto {
  @ApiProperty({ example: "gas_leak", description: "Identifiant d'un sous-type (catalogue /sub-incident-types)" })
  @IsString()
  @MinLength(1)
  type!: string;

  @ApiProperty({ enum: SEV })
  @IsIn(SEV as unknown as string[])
  sev!: (typeof SEV)[number];

  @ApiPropertyOptional({ description: "Précision libre" })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ type: [Number], description: "[lng, lat] propre au sous-incident" })
  @IsOptional() @IsArray() @ArrayMinSize(2) @ArrayMaxSize(2) @IsNumber({}, { each: true })
  ll?: [number, number];

  @ApiPropertyOptional({ type: CasualtiesDto, description: "Bilan humain du sous-incident" })
  @IsOptional() @ValidateNested() @Type(() => CasualtiesDto)
  casualties?: CasualtiesDto;

  @ApiPropertyOptional({ type: RespondersDto, description: "Intervenants (IDs d'unités et d'hôpitaux)" })
  @IsOptional() @ValidateNested() @Type(() => RespondersDto)
  responders?: RespondersDto;
}

/** Libellés trilingues d'un type d'incident. */
export class IncidentTypeLabelsDto {
  @ApiProperty({ example: "Tempête de sable" }) @IsString() @MinLength(1) fr!: string;
  @ApiProperty({ example: "عاصفة رملية" }) @IsString() @MinLength(1) ar!: string;
  @ApiProperty({ example: "Sandstorm" }) @IsString() @MinLength(1) en!: string;
}

/** Enregistrement d'un nouveau type d'incident (catalogue paramétrable). */
export class RegisterIncidentTypeDto {
  @ApiProperty({ example: "sandstorm", description: "Identifiant (slug)" })
  @IsString()
  @MinLength(2)
  id!: string;

  @ApiProperty({ type: IncidentTypeLabelsDto })
  @ValidateNested()
  @Type(() => IncidentTypeLabelsDto)
  labels!: IncidentTypeLabelsDto;

  @ApiPropertyOptional({ description: "Tracé SVG 24×24 (icône en trait)" })
  @IsOptional()
  @IsString()
  icon?: string;
}

/** Envoi d'un message dans un canal. */
export class SendMessageDto {
  @ApiProperty({ example: "c1" })
  @IsString()
  @MinLength(1)
  channelId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  txt!: string;
}

/** Création d'un groupe de canaux. */
export class CreateCategoryDto {
  @ApiProperty({ example: "COORDINATION CIVILE" })
  @IsString()
  @MinLength(1)
  name!: string;
}

/** Création d'un canal texte dans un groupe. */
export class CreateChannelDto {
  @ApiProperty({ example: "g1" })
  @IsString()
  @MinLength(1)
  categoryId!: string;

  @ApiProperty({ example: "point-logistique" })
  @IsString()
  @MinLength(1)
  name!: string;
}

/** Création d'une unité (position en coordonnées SVG + géographiques). */
export class CreateUnitDto {
  @ApiProperty({ example: "6e Bataillon Médical" })
  @IsString()
  @MinLength(1)
  nom!: string;

  @ApiProperty({ example: "Tanger" })
  @IsString()
  @MinLength(1)
  ville!: string;

  @ApiProperty({ example: "Col. A. Senhaji" })
  @IsString()
  @MinLength(1)
  cmdt!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  eff!: number;

  @ApiProperty({ enum: DISPO })
  @IsIn(DISPO as unknown as string[])
  dispo!: (typeof DISPO)[number];

  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  readiness!: number;

  @ApiProperty()
  @IsNumber()
  x!: number;

  @ApiProperty()
  @IsNumber()
  y!: number;

  @ApiProperty({ type: [Number], description: "[lng, lat]" })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @IsNumber({}, { each: true })
  ll!: [number, number];
}

/** Création d'un hôpital militaire. */
export class CreateHospitalDto {
  @ApiProperty({ example: "Hôpital Militaire de Tanger" })
  @IsString()
  @MinLength(1)
  nom!: string;

  @ApiProperty({ example: "Tanger" })
  @IsString()
  @MinLength(1)
  ville!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  lits!: number;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  rea!: number;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  staff!: number;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  amb!: number;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  heli!: number;

  @ApiProperty()
  @IsNumber()
  x!: number;

  @ApiProperty()
  @IsNumber()
  y!: number;

  @ApiProperty({ type: [Number], description: "[lng, lat]" })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @IsNumber({}, { each: true })
  ll!: [number, number];
}
