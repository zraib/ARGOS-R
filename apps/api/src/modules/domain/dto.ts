import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { REGIONS_MA } from "@/modules/domain/provinces.data";

const SEV = ["high", "medium", "low"] as const;
const ST = ["open", "prog", "closed"] as const;
const DISPO = ["ready", "deployed", "standby"] as const;
/** Réseau et échelon d'un établissement de santé (pilote le symbole carte). */
const HOSP_KIND = ["mil", "mil_field", "civ", "civ_reg", "civ_univ", "civ_field"] as const;

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

/** Volet NRBC d'un incident (famille, substance du catalogue, ampleur, rejet). */
export class NrbcDto {
  @ApiProperty({ enum: ["N", "R", "B", "C"], description: "Famille de menace" })
  @IsIn(["N", "R", "B", "C"])
  family!: "N" | "R" | "B" | "C";

  @ApiPropertyOptional({ example: "chlorine", description: "Substance du catalogue /nrbc/substances (famille C)" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  substanceId?: string;

  @ApiPropertyOptional({ enum: ["small", "large"], description: "Ampleur ERG : petit (≤ 208 L) ou grand déversement" })
  @IsOptional()
  @IsIn(["small", "large"])
  spill?: "small" | "large";

  @ApiPropertyOptional({ enum: ["instant", "continuous"], description: "Mode de rejet ATP-45 : instantané ou continu" })
  @IsOptional()
  @IsIn(["instant", "continuous"])
  release?: "instant" | "continuous";
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

  @ApiProperty({
    enum: REGIONS_MA,
    description:
      "Région administrative — DOIT appartenir au référentiel des 12 régions. Sans cette contrainte, " +
      "« Oriental » et « L'Oriental » coexistaient et apparaissaient comme deux filtres distincts, " +
      "et un wali affecté à l'une ne voyait pas les incidents libellés de l'autre.",
  })
  @IsIn(REGIONS_MA)
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

  @ApiPropertyOptional({
    description:
      "Description libre de la situation. L'assistant de création la collectait déjà sans jamais " +
      "l'envoyer : le récit de l'événement était perdu à l'enregistrement (corrigé au lot V-3).",
  })
  @IsOptional()
  @IsString()
  desc?: string;

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

  @ApiPropertyOptional({ type: NrbcDto, description: "Volet NRBC (incidents de type nrbc)" })
  @IsOptional()
  @ValidateNested()
  @Type(() => NrbcDto)
  nrbc?: NrbcDto;
}

/** Mise à jour partielle d'un incident (édition / archivage). */
export class UpdateIncidentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) titre?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) type?: string;
  // La contrainte du référentiel manquait ICI alors qu'elle était posée à la
  // création (V-1) : une MODIFICATION pouvait encore écrire « Oriental » et
  // soustraire l'incident au wali de « L'Oriental ». Fermer la porte d'entrée
  // sans fermer celle de service ne protège rien.
  @ApiPropertyOptional({ enum: REGIONS_MA }) @IsOptional() @IsIn(REGIONS_MA) region?: string;
  @ApiPropertyOptional({ description: "Description libre de la situation." })
  @IsOptional() @IsString() desc?: string;
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
  @ApiPropertyOptional({ type: NrbcDto })
  @IsOptional() @ValidateNested() @Type(() => NrbcDto)
  nrbc?: NrbcDto;
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

/** Publication d'un compte rendu de situation (SITREP). */
export class PublishSitrepDto {
  @ApiProperty({ enum: ["hospital", "unit", "shelter", "morgue"] })
  @IsIn(["hospital", "unit", "shelter", "morgue"])
  entityKind!: "hospital" | "unit" | "shelter" | "morgue";

  @ApiProperty({ example: "H1" })
  @IsString() @MinLength(1) @MaxLength(40)
  entityId!: string;

  @ApiProperty({ enum: ["nominal", "strained", "overwhelmed"], description: "État général en un mot" })
  @IsIn(["nominal", "strained", "overwhelmed"])
  state!: "nominal" | "strained" | "overwhelmed";

  @ApiPropertyOptional({ description: "Besoins exprimés", maxLength: 400 })
  @IsOptional() @IsString() @MaxLength(400)
  needs?: string;

  @ApiPropertyOptional({ description: "Prochain point / action en cours", maxLength: 400 })
  @IsOptional() @IsString() @MaxLength(400)
  nextPoint?: string;
}

/** Changement du niveau d'alerte national. */
export class AlertLevelDto {
  @ApiProperty({ minimum: 1, maximum: 4, description: "1 routine · 2 vigilance · 3 vigilance renforcée · 4 urgence nationale" })
  @IsInt() @Min(1) @Max(4)
  level!: 1 | 2 | 3 | 4;
}

/** Renommage / changement de sujet d'un canal. */
export class UpdateChannelDto {
  @ApiPropertyOptional({ example: "coordination-nord" })
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60)
  name?: string;

  @ApiPropertyOptional({ example: "Coordination secteur nord" })
  @IsOptional() @IsString() @MaxLength(160)
  topic?: string;
}

/** Ajout de membres à un canal (matricules). */
export class ChannelMembersDto {
  @ApiProperty({ type: [String], example: ["i.benfares", "n.fassi"] })
  @IsArray() @ArrayMaxSize(200) @IsString({ each: true })
  matricules!: string[];
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

/** Création d'un établissement de santé (réseau militaire ou civil). */
export class CreateHospitalDto {
  @ApiProperty({ example: "Hôpital Militaire de Tanger" })
  @IsString()
  @MinLength(1)
  nom!: string;

  @ApiProperty({ example: "Tanger" })
  @IsString()
  @MinLength(1)
  ville!: string;

  @ApiPropertyOptional({ enum: HOSP_KIND, default: "mil", description: "Réseau et échelon — détermine le symbole cartographique" })
  @IsOptional()
  @IsIn(HOSP_KIND)
  kind?: (typeof HOSP_KIND)[number];

  @ApiPropertyOptional({ example: "Hôpital militaire général", description: "Libellé de l'échelon" })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ example: "Tanger-Tétouan-Al Hoceïma" })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ example: "Tanger-Assilah" })
  @IsOptional()
  @IsString()
  province?: string;

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

/** Autorité notifiée (SMS + e-mail) lors d'un séisme national ≥ seuil. */
export class AuthorityContactDto {
  @ApiProperty({ example: "Centre de Veille et de Coordination" })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: "+212600000000" })
  @IsString()
  @MinLength(6)
  phone!: string;

  @ApiProperty({ example: "cvc@interieur.gov.ma" })
  @IsString()
  @MinLength(3)
  email!: string;
}

/** Corps de mise à jour de la configuration des alertes sismiques. */
export class UpdateSeismicAlertConfigDto {
  @ApiProperty({ minimum: 1, maximum: 9, description: "Seuil national (SMS + e-mail aux autorités)" })
  @IsNumber()
  @Min(1)
  @Max(9)
  maMinMag!: number;

  @ApiProperty({ minimum: 1, maximum: 9, description: "Seuil mondial (notification dans l'app uniquement)" })
  @IsNumber()
  @Min(1)
  @Max(9)
  globalMinMag!: number;

  @ApiProperty({ type: [AuthorityContactDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AuthorityContactDto)
  contacts!: AuthorityContactDto[];
}

/**
 * Mise à jour d'un établissement par son responsable.
 * Champs opérationnels uniquement : le responsable pilote la capacité et les
 * moyens de SON établissement, pas son identité ni sa position sur la carte
 * (réservées à l'administration du réseau).
 */
export class UpdateHospitalDto {
  @ApiPropertyOptional({ minimum: 1, description: "Lits armés" })
  @IsOptional() @IsInt() @Min(1)
  lits?: number;

  @ApiPropertyOptional({ minimum: 0, description: "Lits occupés" })
  @IsOptional() @IsInt() @Min(0)
  occ?: number;

  @ApiPropertyOptional({ minimum: 0, description: "Lits de réanimation" })
  @IsOptional() @IsInt() @Min(0)
  rea?: number;

  @ApiPropertyOptional({ minimum: 0, description: "Lits de réanimation occupés" })
  @IsOptional() @IsInt() @Min(0)
  reaOcc?: number;

  @ApiPropertyOptional({ minimum: 0, description: "Effectif médical" })
  @IsOptional() @IsInt() @Min(0)
  staff?: number;

  @ApiPropertyOptional({ minimum: 0, description: "Ambulances" })
  @IsOptional() @IsInt() @Min(0)
  amb?: number;

  @ApiPropertyOptional({ minimum: 0, description: "Hélicoptères sanitaires" })
  @IsOptional() @IsInt() @Min(0)
  heli?: number;
}

/** Statuts d'un service de soins. */
export const WARD_STATUSES = ["open", "saturated", "closed"] as const;

/** Ouverture d'un service de soins dans un établissement. */
export class CreateWardDto {
  @ApiProperty({ example: "Réanimation polyvalente" })
  @IsString() @MinLength(1) @MaxLength(120)
  nom!: string;

  @ApiProperty({ minimum: 0, description: "Lits armés du service" })
  @IsInt() @Min(0)
  lits!: number;

  @ApiProperty({ minimum: 0, description: "Lits occupés" })
  @IsInt() @Min(0)
  occ!: number;

  @ApiProperty({ enum: WARD_STATUSES, example: "open" })
  @IsIn(WARD_STATUSES as unknown as string[])
  statut!: (typeof WARD_STATUSES)[number];

  @ApiPropertyOptional({ example: "Pr. A. Benkirane", description: "Médecin-chef" })
  @IsOptional() @IsString()
  chef?: string;
}

/** Mise à jour d'un service de soins (champs optionnels). */
export class UpdateWardDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120)
  nom?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional() @IsInt() @Min(0)
  lits?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional() @IsInt() @Min(0)
  occ?: number;

  @ApiPropertyOptional({ enum: WARD_STATUSES })
  @IsOptional() @IsIn(WARD_STATUSES as unknown as string[])
  statut?: (typeof WARD_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  chef?: string;
}

/** Mise à jour d'une unité par son responsable (champs opérationnels). */
export class UpdateUnitDto {
  @ApiPropertyOptional({ description: "Commandant de l'unité" })
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120)
  cmdt?: string;

  @ApiPropertyOptional({ minimum: 0, description: "Effectif" })
  @IsOptional() @IsInt() @Min(0)
  eff?: number;

  @ApiPropertyOptional({ enum: ["ready", "deployed", "standby"], description: "Posture" })
  @IsOptional() @IsIn(["ready", "deployed", "standby"])
  dispo?: "ready" | "deployed" | "standby";

  @ApiPropertyOptional({ minimum: 0, maximum: 100, description: "Taux de préparation (%)" })
  @IsOptional() @IsInt() @Min(0) @Max(100)
  readiness?: number;
}

/** Niveaux d'approvisionnement d'un abri. */
export const SUPPLY_LEVELS = ["ok", "low", "critical"] as const;

/** Mise à jour d'un abri par son responsable. */
export class UpdateShelterDto {
  @ApiPropertyOptional({ minimum: 0, description: "Capacité d'accueil" })
  @IsOptional() @IsInt() @Min(0)
  capacity?: number;

  @ApiPropertyOptional({ minimum: 0, description: "Personnes hébergées" })
  @IsOptional() @IsInt() @Min(0)
  occupants?: number;

  @ApiPropertyOptional({ minimum: 0, description: "Encadrement" })
  @IsOptional() @IsInt() @Min(0)
  staff?: number;

  @ApiPropertyOptional({ enum: SUPPLY_LEVELS, description: "Niveau d'approvisionnement" })
  @IsOptional() @IsIn(SUPPLY_LEVELS as unknown as string[])
  supplies?: (typeof SUPPLY_LEVELS)[number];

  @ApiPropertyOptional({ description: "Besoins exprimés" })
  @IsOptional() @IsString() @MaxLength(200)
  needs?: string;

  @ApiPropertyOptional({ minimum: 0 }) @IsOptional() @IsInt() @Min(0)
  adults?: number;

  @ApiPropertyOptional({ minimum: 0 }) @IsOptional() @IsInt() @Min(0)
  children?: number;

  @ApiPropertyOptional({ minimum: 0 }) @IsOptional() @IsInt() @Min(0)
  elderly?: number;
}

// --- Morgue / registre DVI --------------------------------------------------

export const MORGUE_STATUSES = ["op", "partial", "closed"] as const;
export const DVI_STATUS_VALUES = ["unidentified", "in_progress", "identified", "released"] as const;
export const DVI_SAMPLE_VALUES = ["dna", "dental", "fingerprint"] as const;
export const DVI_SEX_VALUES = ["m", "f", "unknown"] as const;

/** Mise à jour d'un site mortuaire par son responsable. */
export class UpdateMorgueDto {
  @ApiPropertyOptional({ minimum: 0, description: "Emplacements réfrigérés" })
  @IsOptional() @IsInt() @Min(0)
  capacity?: number;

  @ApiPropertyOptional({ minimum: 0, description: "Effectif du site" })
  @IsOptional() @IsInt() @Min(0)
  staff?: number;

  @ApiPropertyOptional({ enum: MORGUE_STATUSES })
  @IsOptional() @IsIn(MORGUE_STATUSES as unknown as string[])
  statut?: (typeof MORGUE_STATUSES)[number];
}

/** Admission d'un corps sous référence provisoire. */
export class AdmitBodyDto {
  @ApiProperty({ example: "AH-2026-004", description: "Référence provisoire attribuée à l'admission" })
  @IsString() @MinLength(1) @MaxLength(40)
  reference!: string;

  @ApiPropertyOptional({ example: "INC-2607", description: "Incident d'origine" })
  @IsOptional() @IsString()
  incidentId?: string;

  @ApiPropertyOptional({ example: "Douar Tinzert", description: "Lieu de découverte" })
  @IsOptional() @IsString() @MaxLength(160)
  foundAt?: string;

  @ApiPropertyOptional({ enum: DVI_SEX_VALUES })
  @IsOptional() @IsIn(DVI_SEX_VALUES as unknown as string[])
  sex?: (typeof DVI_SEX_VALUES)[number];

  @ApiPropertyOptional({ example: "40-55", description: "Tranche d'âge estimée" })
  @IsOptional() @IsString() @MaxLength(20)
  ageRange?: string;

  @ApiPropertyOptional({ enum: DVI_SAMPLE_VALUES, isArray: true, description: "Prélèvements déjà réalisés" })
  @IsOptional() @IsArray() @IsIn(DVI_SAMPLE_VALUES as unknown as string[], { each: true })
  samples?: (typeof DVI_SAMPLE_VALUES)[number][];
}

/** Évolution d'un dossier d'identification. */
export class UpdateMortuaryRecordDto {
  @ApiPropertyOptional({ enum: DVI_STATUS_VALUES, description: "Étape du parcours d'identification" })
  @IsOptional() @IsIn(DVI_STATUS_VALUES as unknown as string[])
  status?: (typeof DVI_STATUS_VALUES)[number];

  @ApiPropertyOptional({ enum: DVI_SAMPLE_VALUES, isArray: true })
  @IsOptional() @IsArray() @IsIn(DVI_SAMPLE_VALUES as unknown as string[], { each: true })
  samples?: (typeof DVI_SAMPLE_VALUES)[number][];

  @ApiPropertyOptional({ description: "Identité confirmée — obligatoire dès « identifié »" })
  @IsOptional() @IsString() @MaxLength(160)
  identifiedAs?: string;

  @ApiPropertyOptional({ description: "Personne à qui le corps est remis — obligatoire à la restitution" })
  @IsOptional() @IsString() @MaxLength(160)
  releasedTo?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160)
  foundAt?: string;

  @ApiPropertyOptional({ enum: DVI_SEX_VALUES })
  @IsOptional() @IsIn(DVI_SEX_VALUES as unknown as string[])
  sex?: (typeof DVI_SEX_VALUES)[number];

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20)
  ageRange?: string;
}

// --- Parc d'équipement ------------------------------------------------------

export const EQUIP_CONDITIONS = ["ok", "repair", "oos"] as const;

/** Ajout d'un article au parc d'une unité. */
export class CreateEquipDto {
  @ApiProperty({ example: "Groupe électrogène 20 kVA" })
  @IsString() @MinLength(1) @MaxLength(120)
  desig!: string;

  @ApiProperty({ example: "Énergie", description: "Catégorie" })
  @IsString() @MinLength(1) @MaxLength(60)
  cat!: string;

  @ApiProperty({ minimum: 0, description: "Quantité en parc" })
  @IsInt() @Min(0)
  stock!: number;

  @ApiProperty({ minimum: 0, description: "Seuil d'alerte" })
  @IsInt() @Min(0)
  threshold!: number;

  @ApiProperty({ enum: EQUIP_CONDITIONS, example: "ok" })
  @IsIn(EQUIP_CONDITIONS as unknown as string[])
  cond!: (typeof EQUIP_CONDITIONS)[number];
}

/** Mise à jour d'un article du parc. */
export class UpdateEquipDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120)
  desig?: string;

  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60)
  cat?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional() @IsInt() @Min(0)
  stock?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional() @IsInt() @Min(0)
  threshold?: number;

  @ApiPropertyOptional({ enum: EQUIP_CONDITIONS })
  @IsOptional() @IsIn(EQUIP_CONDITIONS as unknown as string[])
  cond?: (typeof EQUIP_CONDITIONS)[number];
}

/** Déployer un poste sur une opération (lot V-2). */
export class DeployPostDto {
  @ApiProperty({
    example: "o.ziani",
    description:
      "Matricule du compte à déployer. Il doit occuper un poste déployable (OPCOM, TACOM, cellules, " +
      "responsable abri ou équipement). Le déploiement REMPLACE l'opération qu'il servait.",
  })
  @IsString()
  @MinLength(1)
  matricule!: string;
}
