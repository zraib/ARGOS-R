import { ApiProperty } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsString, Max, Min, MinLength } from "class-validator";

const TYPES = ["earthquake", "flood", "wildfire", "landslide", "epidemic", "industrial"] as const;
const SEV = ["high", "medium", "low"] as const;
const ST = ["open", "prog", "closed"] as const;
const DISPO = ["ready", "deployed", "standby"] as const;

/** Corps de création d'un incident (déclaré depuis le wizard frontend). */
export class CreateIncidentDto {
  @ApiProperty({ enum: TYPES })
  @IsIn(TYPES as unknown as string[])
  type!: (typeof TYPES)[number];

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
