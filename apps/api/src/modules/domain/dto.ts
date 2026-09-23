import { DESTINATIONS, DRAWING_KINDS, POST_KINDS, UNIT_CORPS } from "@/modules/domain/domain.types";
import { APP_MODES } from "@/common/app-mode";
import { PERSON_CORPS, PERSON_STATUS, RESOURCE_OWNER_KINDS, SUPPLY_KINDS, VEHICLE_STATES } from "@/modules/domain/resources.types";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { SHELTER_BUILDINGS, SHELTER_KINDS, SHELTER_ORGANS } from "@/modules/domain/shelter.rules";
import { REGIONS_MA } from "@/modules/domain/provinces.data";
import { COMMS_EXPORT_FORMAT } from "@/modules/domain/comms.service";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

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
  @ApiPropertyOptional({ type: [String], example: ["M1"], description: "Sites mortuaires rattachés — dès qu'un décès est déclaré" })
  @IsOptional() @IsArray() @IsString({ each: true }) morgues?: string[];
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

  @ApiPropertyOptional({ example: "INC-2623", description: "Incident parent : l'incident déclaré lui est rattaché (exige « Sous-incidents : ajouter »)." })
  @IsOptional() @IsString() @MaxLength(40)
  parentId?: string;

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

/** Partage d'une simulation (ADR 0029) : le scénario, que chaque poste rejoue. */
export class PublishSimulationDto {
  @ApiProperty({ enum: ["fire", "flood"], example: "flood" })
  @IsIn(["fire", "flood"])
  kind!: "fire" | "flood";

  @ApiProperty({ maxLength: 120, example: "Rupture Al Wahda — cadrage" })
  @IsString() @MinLength(1) @MaxLength(120)
  label!: string;

  @ApiProperty({ type: [Number], example: [-5.36, 34.6], description: "Point de départ [lng, lat] : allumage ou rupture." })
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(2) @IsNumber({}, { each: true })
  seed!: [number, number];

  @ApiProperty({ type: Object, description: "Réglages du simulateur, tels que le panneau les tient." })
  @IsObject()
  params!: Record<string, unknown>;

  @ApiPropertyOptional({ description: "Opération concernée." })
  @IsOptional() @IsString() @MaxLength(40)
  incidentId?: string;
}

/** Modification d'un type d'incident ajouté (libellés, icône) — l'identifiant ne change pas. */
export class UpdateIncidentTypeDto {
  @ApiPropertyOptional({ type: IncidentTypeLabelsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => IncidentTypeLabelsDto)
  labels?: IncidentTypeLabelsDto;

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
/** Fiche d'une pièce jointe déjà versée — le contenu vit sur disque. */
export class MessageAttachmentDto {
  @ApiProperty() @IsString() @Length(1, 64) id!: string;
  @ApiProperty() @IsString() @Length(1, 160) name!: string;
  @ApiProperty() @IsString() @Length(1, 100) mime!: string;
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) bytes!: number;
}

export class SendMessageDto {
  @ApiProperty({ example: "c1" })
  @IsString()
  @MinLength(1)
  channelId!: string;

  @ApiProperty()
  @IsString()
  // Le texte peut être VIDE quand une pièce jointe l'accompagne : envoyer une
  // photo sans légende est un geste ordinaire, et l'exiger ferait taper un
  // point pour rien. Le couple (texte vide, pièce absente) reste refusé.
  @MaxLength(4000)
  txt!: string;

  @ApiPropertyOptional({ type: MessageAttachmentDto, description: "Pièce jointe déjà versée via POST /comms/attachments." })
  @IsOptional()
  @ValidateNested()
  @Type(() => MessageAttachmentDto)
  attachment?: MessageAttachmentDto;
}

/** Accusé de réception ou de lecture, jusqu'à un identifiant de message. */
export class ReceiptDto {
  @ApiProperty({ enum: ["delivered", "read"], description: "« remis » ou « lu » — lire implique avoir reçu." })
  @IsIn(["delivered", "read"])
  state!: "delivered" | "read";

  @ApiProperty({ minimum: 0, description: "Identifiant du dernier message concerné ; les précédents le sont aussi." })
  @IsInt()
  @Min(0)
  upToId!: number;
}

/**
 * Un message d'un export du centre de communication (ADR 0021). Seuls les
 * champs qui portent la trace sont contrôlés ; le reste est repris tel quel
 * ou remplacé par une valeur neutre au moment de l'import.
 */
export class ImportedMessageDto {
  @ApiProperty({ description: "Texte du message." })
  @IsString()
  @MaxLength(4000)
  txt!: string;

  @ApiPropertyOptional({ description: "Identifiant d'origine — sans effet : l'import en attribue un nouveau." }) @IsOptional() @IsInt() id?: number;
  @ApiPropertyOptional({ description: "Nom affiché de l'auteur." }) @IsOptional() @IsString() @MaxLength(120) who?: string;
  @ApiPropertyOptional({ description: "Matricule de l'auteur." }) @IsOptional() @IsString() @MaxLength(64) author?: string;
  @ApiPropertyOptional({ description: "Heure affichée (HH:MM)." }) @IsOptional() @IsString() @MaxLength(16) time?: string;
  @ApiPropertyOptional({ description: "Horodatage ISO complet." }) @IsOptional() @IsString() @MaxLength(40) at?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(8) initials?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) av?: string;
  @ApiPropertyOptional({ description: "Sans effet à l'import : un message repris n'est à personne." }) @IsOptional() @IsBoolean() mine?: boolean;
  @ApiPropertyOptional({ type: MessageAttachmentDto, description: "La FICHE de la pièce jointe ; son contenu ne voyage pas avec l'export." })
  @IsOptional()
  @ValidateNested()
  @Type(() => MessageAttachmentDto)
  attachment?: MessageAttachmentDto;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) deliveredBy?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) readBy?: string[];
}

/** Un canal d'un export du centre de communication (ADR 0021). */
export class ImportedChannelDto {
  @ApiProperty({ description: "Identifiant dans l'export d'origine — sert à ne pas reprendre deux fois le même canal." })
  @IsString()
  @Length(1, 80)
  id!: string;

  @ApiProperty({ example: "Séisme Al Haouz" })
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiPropertyOptional({ enum: ["text", "voice"] }) @IsOptional() @IsIn(["text", "voice"]) kind?: "text" | "voice";
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) topic?: string;
  @ApiPropertyOptional({ description: "Nom du groupe d'origine, gardé pour mémoire." }) @IsOptional() @IsString() @MaxLength(120) category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) incidentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() archived?: boolean;
  @ApiPropertyOptional({ description: "Conversation directe : reste réservée à ses deux correspondants." }) @IsOptional() @IsBoolean() direct?: boolean;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(500) members?: string[];

  @ApiProperty({ type: [ImportedMessageDto] })
  @IsArray()
  @ArrayMaxSize(100000)
  @ValidateNested({ each: true })
  @Type(() => ImportedMessageDto)
  messages!: ImportedMessageDto[];
}

/**
 * Le document que produit `GET /comms/export` (ou `/comms/channels/:id/export`),
 * rendu à `POST /comms/import` — un fichier JSON, pas un flux (ADR 0021).
 */
export class ImportCommsDto {
  @ApiProperty({ enum: [COMMS_EXPORT_FORMAT], description: "Format du document ; tout autre est refusé." })
  @IsIn([COMMS_EXPORT_FORMAT])
  format!: typeof COMMS_EXPORT_FORMAT;

  @ApiProperty({ description: "Date de l'export (ISO) — reprise dans le nom des archives importées." })
  @IsString()
  @Length(1, 40)
  exportedAt!: string;

  @ApiPropertyOptional({ description: "Qui a exporté, pour mémoire." }) @IsOptional() @IsString() @MaxLength(64) exportedBy?: string;

  @ApiProperty({ type: [ImportedChannelDto] })
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => ImportedChannelDto)
  channels!: ImportedChannelDto[];
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

  @ApiPropertyOptional({
    type: [String],
    example: ["i.benfares", "n.fassi"],
    description: "Membres convoqués à la création. Liste fournie → canal RESTREINT à ces comptes ; absente ou vide → canal ouvert.",
  })
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true })
  matricules?: string[];
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

  @ApiPropertyOptional({
    example: "Col. A. Senhaji",
    description: "Facultatif : le commandant est le compte « responsable d'unité » affecté à l'unité, pas un texte saisi ici.",
  })
  @IsOptional() @IsString() @MaxLength(80)
  cmdt?: string;

  @ApiPropertyOptional({ enum: UNIT_CORPS, default: "far", description: "Corps d'appartenance (ADR 0016) : far, gendarmerie, dgsn, dgpc, fa — décide qui peut affecter l'unité et vers quel PC elle va." })
  @IsOptional() @IsIn(UNIT_CORPS as unknown as string[])
  corps?: (typeof UNIT_CORPS)[number];

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
/** Déploiement d'un hôpital de campagne à un point choisi sur la carte. */
export class DeployFieldHospitalDto {
  @ApiProperty({ example: "H1", description: "Établissement de rattachement (HMC pour un hôpital militaire, HCC pour un civil)" })
  @IsString()
  @MinLength(1)
  hospitalId!: string;

  @ApiProperty({ type: [Number], description: "[lng, lat] — le point choisi sur la carte" })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @IsNumber({}, { each: true })
  ll!: [number, number];

  @ApiPropertyOptional({ minimum: 1, maximum: 2000, description: "Capacité en lits (40 par défaut)" })
  @IsOptional() @IsInt() @Min(1) @Max(2000)
  cap?: number;

  @ApiPropertyOptional({ description: "Nom du détachement ; sinon « HMC/HCC <ville> — Détachement n »" })
  @IsOptional() @IsString() @MaxLength(120)
  nom?: string;

  @ApiPropertyOptional({ description: "Opération servie : l'établissement en devient intervenant" })
  @IsOptional() @IsString() @MaxLength(40)
  incidentId?: string;
}

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
  // Identité et implantation (modifiables depuis la fiche, ADR 0019) : le nom, la
  // commune, le rattachement au référentiel et la position choisie sur la carte.
  @ApiPropertyOptional({ description: "Nom de l'établissement" })
  @IsOptional() @IsString() @Length(2, 120)
  nom?: string;

  @ApiPropertyOptional({ description: "Commune d'implantation" })
  @IsOptional() @IsString() @Length(2, 60)
  ville?: string;

  @ApiPropertyOptional({ enum: REGIONS_MA, description: "Région d'implantation (référentiel)." })
  @IsOptional() @IsIn(REGIONS_MA)
  region?: string;

  @ApiPropertyOptional({ description: "Province d'implantation (référentiel)." })
  @IsOptional() @IsString() @Length(1, 60)
  province?: string;

  @ApiPropertyOptional({ type: [Number], description: "Position [lng, lat] — la position SVG (x, y) en est recalculée." })
  @IsOptional() @IsArray() @ArrayMinSize(2) @ArrayMaxSize(2) @IsNumber({}, { each: true })
  ll?: [number, number];

  @ApiPropertyOptional({ enum: HOSP_KIND, description: "Réseau et échelon — détermine le symbole cartographique" })
  @IsOptional() @IsIn(HOSP_KIND)
  kind?: (typeof HOSP_KIND)[number];

  @ApiPropertyOptional({ description: "Nature de la structure (libellé)" })
  @IsOptional() @IsString() @Length(1, 120)
  type?: string;

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

  @ApiPropertyOptional({ description: "Nom de l'unité (OPCOM / cellules en démonstration et exercice)", maxLength: 120 })
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120)
  nom?: string;

  @ApiPropertyOptional({ description: "Ville d'implantation", maxLength: 80 })
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80)
  ville?: string;

  @ApiPropertyOptional({ enum: UNIT_CORPS, description: "Corps d'appartenance (ADR 0016)" })
  @IsOptional() @IsIn(UNIT_CORPS as unknown as string[])
  corps?: (typeof UNIT_CORPS)[number];

  @ApiPropertyOptional({ type: [Number], description: "Position [lng, lat]" })
  @IsOptional() @IsArray() @ArrayMinSize(2) @ArrayMaxSize(2) @IsNumber({}, { each: true })
  ll?: [number, number];

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
/**
 * Ouverture d'un abri (lot OPSnet).
 *
 * La CAPACITÉ est obligatoire et les occupants partent de zéro : un abri qu'on
 * ouvre est vide, et une capacité absente ferait afficher une saturation à
 * 0 % qui se lirait comme « de la place », alors qu'on ne saurait rien.
 */
export class CreateShelterDto {
  @ApiProperty({ description: "Nom de l'abri", example: "Complexe sportif Amizmiz" })
  @IsString() @Length(2, 80)
  nom!: string;

  @ApiProperty({ description: "Commune d'implantation", example: "Amizmiz" })
  @IsString() @Length(2, 60)
  ville!: string;

  @ApiProperty({ enum: SHELTER_KINDS, description: "Typologie : camp de tentes (capacité déduite) ou bâtiment en dur (capacité saisie)." })
  @IsIn(SHELTER_KINDS as unknown as string[])
  kind!: (typeof SHELTER_KINDS)[number];

  @ApiPropertyOptional({ enum: SHELTER_BUILDINGS, description: "En dur : nature du bâtiment — abri dédié, école, collège, lycée, autre établissement." })
  @IsOptional() @IsIn(SHELTER_BUILDINGS as unknown as string[])
  building?: (typeof SHELTER_BUILDINGS)[number];

  @ApiPropertyOptional({ enum: SHELTER_ORGANS, description: "Organe d'origine : qui ouvre et tient l'abri (Protection civile, FAR, FA, commune, Croissant-Rouge, Entraide nationale, Éducation, Santé, autre)." })
  @IsOptional() @IsIn(SHELTER_ORGANS as unknown as string[])
  organ?: (typeof SHELTER_ORGANS)[number];

  @ApiPropertyOptional({ minimum: 1, description: "Tentes : nombre de tentes." })
  @IsOptional() @IsInt() @Min(1)
  tents?: number;

  @ApiPropertyOptional({ minimum: 1, description: "Tentes : personnes par tente (défaut 6, standard Sphère)." })
  @IsOptional() @IsInt() @Min(1)
  perTent?: number;

  @ApiPropertyOptional({ minimum: 1, description: "En dur : capacité d'accueil, en personnes. Ignorée pour un camp de tentes (déduite)." })
  @IsOptional() @IsInt() @Min(1)
  capacity?: number;

  @ApiPropertyOptional({ enum: REGIONS_MA, description: "Région d'implantation (référentiel)." })
  @IsOptional() @IsIn(REGIONS_MA)
  region?: string;

  @ApiPropertyOptional({ description: "Province d'implantation (référentiel)." })
  @IsOptional() @IsString() @Length(1, 60)
  province?: string;

  @ApiPropertyOptional({ type: [Number], description: "Position [lng, lat]." })
  @IsOptional() @IsArray() @ArrayMinSize(2) @ArrayMaxSize(2) @IsNumber({}, { each: true })
  ll?: [number, number];

  @ApiPropertyOptional({ minimum: 0, description: "Personnes déjà hébergées (défaut 0)" })
  @IsOptional() @IsInt() @Min(0)
  occupants?: number;

  @ApiPropertyOptional({ minimum: 0, description: "Encadrement affecté" })
  @IsOptional() @IsInt() @Min(0)
  staff?: number;

  @ApiPropertyOptional({ enum: SUPPLY_LEVELS, description: "Niveau d'approvisionnement à l'ouverture" })
  @IsOptional() @IsIn(SUPPLY_LEVELS as unknown as string[])
  supplies?: (typeof SUPPLY_LEVELS)[number];

  @ApiPropertyOptional({ description: "Besoins exprimés", example: "Couvertures, eau" })
  @IsOptional() @IsString() @Length(0, 200)
  needs?: string;
}

/** Mise à jour d'un abri — depuis OPSnet (ADR 0019) comme depuis « Gestion de mon abri » : identité, typologie, organe, chiffres. */
export class UpdateShelterDto {
  @ApiPropertyOptional({ description: "Nom de l'abri" })
  @IsOptional() @IsString() @Length(2, 80)
  nom?: string;

  @ApiPropertyOptional({ description: "Commune d'implantation" })
  @IsOptional() @IsString() @Length(2, 60)
  ville?: string;

  @ApiPropertyOptional({ enum: SHELTER_KINDS, description: "Typologie : camp de tentes ou bâtiment en dur." })
  @IsOptional() @IsIn(SHELTER_KINDS as unknown as string[])
  kind?: (typeof SHELTER_KINDS)[number];

  @ApiPropertyOptional({ enum: SHELTER_BUILDINGS, description: "En dur : nature du bâtiment." })
  @IsOptional() @IsIn(SHELTER_BUILDINGS as unknown as string[])
  building?: (typeof SHELTER_BUILDINGS)[number];

  @ApiPropertyOptional({ enum: SHELTER_ORGANS, description: "Organe d'origine de l'abri." })
  @IsOptional() @IsIn(SHELTER_ORGANS as unknown as string[])
  organ?: (typeof SHELTER_ORGANS)[number];

  @ApiPropertyOptional({ minimum: 1, description: "Tentes : nombre de tentes — la capacité est recalculée." })
  @IsOptional() @IsInt() @Min(1)
  tents?: number;

  @ApiPropertyOptional({ minimum: 1, description: "Tentes : personnes par tente — la capacité est recalculée." })
  @IsOptional() @IsInt() @Min(1)
  perTent?: number;

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

  @ApiPropertyOptional({ enum: REGIONS_MA, description: "Région d'implantation (référentiel)." })
  @IsOptional() @IsIn(REGIONS_MA)
  region?: string;

  @ApiPropertyOptional({ description: "Province d'implantation (référentiel)." })
  @IsOptional() @IsString() @Length(1, 60)
  province?: string;

  @ApiPropertyOptional({ type: [Number], description: "Position [lng, lat] choisie sur la carte." })
  @IsOptional() @IsArray() @ArrayMinSize(2) @ArrayMaxSize(2) @IsNumber({}, { each: true })
  ll?: [number, number];
}

// --- Morgue / registre DVI --------------------------------------------------

export const MORGUE_STATUSES = ["op", "partial", "closed"] as const;
export const MORGUE_TYPE_VALUES = ["field", "temporary", "hospital", "truck"] as const;
export const ID_METHOD_VALUES = ["dna", "fingerprint", "dental", "body_mark"] as const;
export const VICTIM_KIND_VALUES = ["dead", "injured", "missing"] as const;

export const DVI_STATUS_VALUES = ["unidentified", "in_progress", "identified", "released"] as const;
export const DVI_SAMPLE_VALUES = ["dna", "dental", "fingerprint"] as const;
export const DVI_SEX_VALUES = ["m", "f", "unknown"] as const;

/** Les champs d'identité partagés par le terrain, l'hôpital et la morgue. */
export class IdentityDto {
  @ApiPropertyOptional({ maxLength: 80 }) @IsOptional() @IsString() @MaxLength(80) lastName?: string;
  @ApiPropertyOptional({ maxLength: 80 }) @IsOptional() @IsString() @MaxLength(80) firstName?: string;
  @ApiPropertyOptional({ description: "Carte nationale d'identité, si elle existe", maxLength: 20 }) @IsOptional() @IsString() @MaxLength(20) cni?: string;
  @ApiPropertyOptional({ enum: DVI_SEX_VALUES }) @IsOptional() @IsIn(DVI_SEX_VALUES as unknown as string[]) sex?: (typeof DVI_SEX_VALUES)[number];
  @ApiPropertyOptional({ minimum: 0, maximum: 130, description: "Âge en années, si connu" }) @IsOptional() @IsInt() @Min(0) @Max(130) age?: number;
  @ApiPropertyOptional({ description: "Heure du décès (ISO 8601), si connue" }) @IsOptional() @IsString() deathAt?: string;
}

/** Mise à jour d'un site mortuaire par son responsable (« plein » ne se saisit pas : il se constate). */
export class UpdateMorgueDto {
  @ApiPropertyOptional({ maxLength: 120 }) @IsOptional() @IsString() @MinLength(2) @MaxLength(120) nom?: string;
  @ApiPropertyOptional({ enum: MORGUE_TYPE_VALUES }) @IsOptional() @IsIn(MORGUE_TYPE_VALUES as unknown as string[]) type?: (typeof MORGUE_TYPE_VALUES)[number];
  @ApiPropertyOptional({ minimum: 0, description: "Emplacements réfrigérés" })
  @IsOptional() @IsInt() @Min(0)
  capacity?: number;
  @ApiPropertyOptional({ minimum: 0, description: "Effectif du site" })
  @IsOptional() @IsInt() @Min(0)
  staff?: number;
  @ApiPropertyOptional({ enum: MORGUE_STATUSES })
  @IsOptional() @IsIn(MORGUE_STATUSES as unknown as string[])
  statut?: (typeof MORGUE_STATUSES)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() region?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() province?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ville?: string;
  @ApiPropertyOptional({ type: [Number], minItems: 2, maxItems: 2, description: "[longitude, latitude]" })
  @IsOptional() @IsArray() @ArrayMinSize(2) @ArrayMaxSize(2) @IsNumber({}, { each: true })
  ll?: [number, number];
}

/** Admission d'un corps sous référence provisoire. */
export class AdmitBodyDto extends IdentityDto {
  @ApiPropertyOptional({ example: "AH-2026-004", description: "Référence provisoire ; absente, le site l'attribue (code-année-numéro)" })
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40)
  reference?: string;

  @ApiPropertyOptional({ example: "INC-2607", description: "Incident d'origine" })
  @IsOptional() @IsString()
  incidentId?: string;

  @ApiPropertyOptional({ example: "Douar Tinzert", description: "Lieu de découverte" })
  @IsOptional() @IsString() @MaxLength(160)
  foundAt?: string;


  @ApiPropertyOptional({ example: "40-55", description: "Tranche d'âge estimée" })
  @IsOptional() @IsString() @MaxLength(20)
  ageRange?: string;

  @ApiPropertyOptional({ enum: DVI_SAMPLE_VALUES, isArray: true, description: "Prélèvements déjà réalisés" })
  @IsOptional() @IsArray() @IsIn(DVI_SAMPLE_VALUES as unknown as string[], { each: true })
  samples?: (typeof DVI_SAMPLE_VALUES)[number][];
}

export const MORGUE_LEVELS = ["regional", "city"] as const;

/** Création d'un site mortuaire fixe — de ville ou régional, rattaché à un établissement. */
export class CreateMorgueDto {
  @ApiProperty({ example: "Chambre mortuaire — Hôpital Militaire Moulay Ismaïl" })
  @IsString() @MinLength(2) @MaxLength(120)
  nom!: string;
  @ApiProperty({ enum: MORGUE_TYPE_VALUES, description: "field = champ mortuaire ; temporary = morgue temporaire ; hospital = morgue hospitalière ; truck = camion réfrigéré" })
  @IsIn(MORGUE_TYPE_VALUES as unknown as string[])
  type!: (typeof MORGUE_TYPE_VALUES)[number];
  @ApiPropertyOptional({ enum: MORGUE_LEVELS, default: "city", description: "regional = institut médico-légal de la région ; city = morgue de ville" })
  @IsOptional() @IsIn(MORGUE_LEVELS as unknown as string[])
  level?: (typeof MORGUE_LEVELS)[number];
  @ApiProperty({ example: "Fès-Meknès" })
  @IsString() @MinLength(1)
  region!: string;
  @ApiPropertyOptional({ example: "Meknès" })
  @IsOptional() @IsString()
  province?: string;
  @ApiProperty({ example: "Meknès" })
  @IsString() @MinLength(1)
  ville!: string;
  @ApiPropertyOptional({ example: "H3", description: "Établissement de rattachement" })
  @IsOptional() @IsString()
  hospitalId?: string;
  @ApiProperty({ minimum: 1, description: "Emplacements réfrigérés" })
  @IsInt() @Min(1)
  capacity!: number;
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional() @IsInt() @Min(0)
  staff?: number;
  @ApiPropertyOptional({ type: [Number], minItems: 2, maxItems: 2, description: "[longitude, latitude] ; absent, celle de l'établissement" })
  @IsOptional() @IsArray() @ArrayMinSize(2) @ArrayMaxSize(2) @IsNumber({}, { each: true })
  ll?: [number, number];
}

/** Déploiement d'une morgue mobile (conteneur réfrigéré) sur le terrain. */
export class DeployMobileMorgueDto {
  @ApiProperty({ example: "Morgue mobile n° 2 — conteneur 40 pieds", description: "Désignation de l'unité" })
  @IsString() @MinLength(2) @MaxLength(80)
  nom!: string;
  @ApiPropertyOptional({ enum: ["truck", "field", "temporary"], default: "truck", description: "Camion réfrigéré (défaut), champ mortuaire, morgue temporaire" })
  @IsOptional() @IsIn(["truck", "field", "temporary"])
  type?: "truck" | "field" | "temporary";
  @ApiProperty({ minimum: 1, description: "Emplacements réfrigérés" })
  @IsInt() @Min(1)
  capacity!: number;
  @ApiPropertyOptional({ minimum: 0, description: "Effectif affecté" })
  @IsOptional() @IsInt() @Min(0)
  staff?: number;
  @ApiProperty({ example: "Stade d'Amizmiz", description: "Lieu de déploiement" })
  @IsString() @MinLength(2) @MaxLength(120)
  site!: string;
  @ApiProperty({ type: [Number], minItems: 2, maxItems: 2, example: [-8.24, 31.22], description: "[longitude, latitude]" })
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(2) @IsNumber({}, { each: true })
  ll!: [number, number];
  @ApiPropertyOptional({ example: "INC-2607", description: "Incident servi" })
  @IsOptional() @IsString()
  incidentId?: string;
}

/** Décès en établissement : le corps part vers un site mortuaire, réception à confirmer là-bas. */
export class HospitalDeathDto extends IdentityDto {
  @ApiProperty({ example: "M2", description: "Site mortuaire de destination" })
  @IsString() @MinLength(1)
  mid!: string;
  @ApiPropertyOptional({ description: "Référence ; absente, le site de destination l'attribue" })
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40)
  reference?: string;
  @ApiPropertyOptional({ example: "INC-2607" })
  @IsOptional() @IsString()
  incidentId?: string;
  @ApiPropertyOptional({ description: "Identité du patient décédé, si connue" })
  @IsOptional() @IsString() @MaxLength(160)
  identifiedAs?: string;
  @ApiPropertyOptional({ example: "40-55" })
  @IsOptional() @IsString() @MaxLength(20)
  ageRange?: string;
  @ApiPropertyOptional({ description: "Circonstances, service, remarques pour la chaîne de garde" })
  @IsOptional() @IsString() @MaxLength(300)
  note?: string;
}

/** Transfert d'un corps vers un autre site mortuaire. */
export class TransferBodyDto {
  @ApiProperty({ example: "M1", description: "Site mortuaire de destination" })
  @IsString() @MinLength(1)
  toMid!: string;
  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional() @IsString() @MaxLength(300)
  note?: string;
}

/** Évolution d'un dossier d'identification. */
export class UpdateMortuaryRecordDto extends IdentityDto {
  @ApiPropertyOptional({ enum: DVI_STATUS_VALUES, description: "Étape du parcours d'identification" })
  @IsOptional() @IsIn(DVI_STATUS_VALUES as unknown as string[])
  status?: (typeof DVI_STATUS_VALUES)[number];
  @ApiPropertyOptional({ enum: ID_METHOD_VALUES, description: "Mode d'identification : ADN, empreinte digitale, dentaire, signe corporel" })
  @IsOptional() @IsIn(ID_METHOD_VALUES as unknown as string[])
  idMethod?: (typeof ID_METHOD_VALUES)[number];
  @ApiPropertyOptional({ description: "Date d'identification (ISO 8601)" }) @IsOptional() @IsString() identifiedAt?: string;
  @ApiPropertyOptional({ description: "Identifié par (nom ou matricule)", maxLength: 120 }) @IsOptional() @IsString() @MaxLength(120) identifiedBy?: string;
  @ApiPropertyOptional({ maxLength: 500 }) @IsOptional() @IsString() @MaxLength(500) note?: string;

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

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20)
  ageRange?: string;

  /**
   * Mot de passe du compte qui agit (step-up) : identifier ou modifier un
   * dossier engage — la doctrine DVI veut une signature, pas un clic. Vérifié
   * côté serveur, jamais journalisé, jamais écrit dans le dossier.
   */
  @ApiProperty({ description: "Mot de passe du compte qui agit — exigé pour toute modification d'un dossier (identification, correction, restitution)", maxLength: 200 })
  @IsString() @MinLength(1) @MaxLength(200)
  password!: string;
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

// --- postes d'opération sur la carte (lot #12) ---------------------------------

export class CreatePostDto {
  @ApiProperty({ enum: POST_KINDS, description: "Nature du poste : PC (opcom, tacom), cellule, abri ou parc d'équipement." })
  @IsIn(POST_KINDS as unknown as string[])
  kind!: (typeof POST_KINDS)[number];

  @ApiProperty({ type: [Number], example: [-7.6, 33.58], description: "Point du poste [lng, lat]." })
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(2) @IsNumber({}, { each: true })
  ll!: [number, number];

  @ApiPropertyOptional({ description: "Libellé libre — « PC avancé nord »." })
  @IsOptional() @IsString() @MaxLength(60)
  label?: string;

  @ApiPropertyOptional({ description: "Entité représentée : abri (`shelter`) ou unité détentrice du parc (`equipment`)." })
  @IsOptional() @IsString() @MaxLength(40)
  entityId?: string;

  @ApiPropertyOptional({ description: "Compte qui tient un PC ou une cellule (opcom, tacom, cellules) — déployé sur l'opération à la pose." })
  @IsOptional() @IsString() @MaxLength(60)
  matricule?: string;
}

/** Pose d'une ressource sur le terrain (ADR 0018). */
/** Un croquis dessiné sur la carte (mode dessin). */
export class CreateDrawingDto {
  @ApiProperty({ enum: DRAWING_KINDS, description: "Nature : point, cercle ou polygone." })
  @IsIn(DRAWING_KINDS as unknown as string[])
  kind!: (typeof DRAWING_KINDS)[number];

  @ApiProperty({ description: "Le nom (étiquette), affiché sur la carte.", maxLength: 80 })
  @IsString() @MaxLength(80)
  label!: string;

  @ApiProperty({ type: "array", items: { type: "array", items: { type: "number" } }, description: "Point : [[lng, lat]] ; cercle : [[centre]] ; polygone : ses sommets (≥ 3)." })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500)
  coords!: [number, number][];

  @ApiPropertyOptional({ minimum: 1, description: "Cercle : rayon en mètres." })
  @IsOptional() @IsNumber() @Min(1)
  radiusM?: number;

  @ApiPropertyOptional({ type: [Number], description: "Emplacement de l'étiquette [lng, lat] (cercle, polygone)." })
  @IsOptional() @IsArray() @ArrayMinSize(2) @ArrayMaxSize(2) @IsNumber({}, { each: true })
  labelLL?: [number, number];

  @ApiPropertyOptional({ description: "Couleur hex (#rrggbb)." })
  @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional() @IsString() @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({ description: "Opération concernée." })
  @IsOptional() @IsString() @MaxLength(40)
  incidentId?: string;
}

export class UpdateDrawingDto {
  @ApiPropertyOptional({ maxLength: 80 }) @IsOptional() @IsString() @MaxLength(80) label?: string;
  @ApiPropertyOptional({ type: "array", items: { type: "array", items: { type: "number" } } })
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500)
  coords?: [number, number][];
  @ApiPropertyOptional({ minimum: 1 }) @IsOptional() @IsNumber() @Min(1) radiusM?: number;
  @ApiPropertyOptional({ type: [Number] }) @IsOptional() @IsArray() @ArrayMinSize(2) @ArrayMaxSize(2) @IsNumber({}, { each: true }) labelLL?: [number, number];
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/) color?: string;
  @ApiPropertyOptional({ maxLength: 500 }) @IsOptional() @IsString() @MaxLength(500) note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) incidentId?: string;
}

export class PlaceResourceDto {
  @ApiProperty({ type: [Number], example: [-7.6, 33.58], description: "Point posé [lng, lat]." })
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(2) @IsNumber({}, { each: true })
  ll!: [number, number];

  @ApiPropertyOptional({ description: "Opération à laquelle la pose se rattache (la plus proche, choisie par la carte)." })
  @IsOptional() @IsString() @MaxLength(40)
  incidentId?: string;
}

export class UpdatePostDto {
  @ApiPropertyOptional({ type: [Number], example: [-7.6, 33.58] })
  @IsOptional() @IsArray() @ArrayMinSize(2) @ArrayMaxSize(2) @IsNumber({}, { each: true })
  ll?: [number, number];

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(60)
  label?: string;
}

// --- bilan des victimes d'un incident --------------------------------------
/** Une victime nommée : décédé (identification préliminaire), blessé, disparu. */
export class CreateVictimDto extends IdentityDto {
  @ApiProperty({ enum: VICTIM_KIND_VALUES }) @IsIn(VICTIM_KIND_VALUES as unknown as string[]) kind!: (typeof VICTIM_KIND_VALUES)[number];
  @ApiPropertyOptional({ maxLength: 300 }) @IsOptional() @IsString() @MaxLength(300) note?: string;
  @ApiPropertyOptional({ description: "Blessé : établissement d'évacuation" }) @IsOptional() @IsString() hospitalId?: string;
  @ApiPropertyOptional({ description: "Disparu : dernier lieu où la personne a été vue", maxLength: 160 }) @IsOptional() @IsString() @MaxLength(160) lastSeen?: string;
}
export class UpdateVictimDto extends IdentityDto {
  @ApiPropertyOptional({ enum: VICTIM_KIND_VALUES }) @IsOptional() @IsIn(VICTIM_KIND_VALUES as unknown as string[]) kind?: (typeof VICTIM_KIND_VALUES)[number];
  @ApiPropertyOptional({ maxLength: 300 }) @IsOptional() @IsString() @MaxLength(300) note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() hospitalId?: string;
  @ApiPropertyOptional({ maxLength: 160 }) @IsOptional() @IsString() @MaxLength(160) lastSeen?: string;
}
/** Affectation d'un décédé à une morgue : le dossier s'ouvre là-bas, réception à confirmer. */
export class AssignMorgueDto {
  @ApiProperty({ example: "M1" }) @IsString() @MinLength(1) mid!: string;
}

// --- Administration du domaine (ADR 0015) ------------------------------------

/** Purge du domaine : signée par le mot de passe du Super Administrateur. */
export class PurgeDomainDto {
  @ApiProperty({ description: "Mot de passe du compte qui agit — la remise à zéro est un geste signé, pas un clic", maxLength: 200 })
  @IsString() @MinLength(1) @MaxLength(200)
  password!: string;
}

// --- Chaîne de commandement (ADR 0016) ---------------------------------------

/** Affecter une unité à une opération : l'OPCOM et ses représentants, chacun pour son corps. */
export class AssignUnitDto {
  @ApiProperty({ example: "U3", description: "Unité à affecter" })
  @IsString() @MinLength(1) @MaxLength(40)
  unitId!: string;

  @ApiPropertyOptional({ enum: DESTINATIONS, description: "Destination au TACOM — décisive pour une unité des FAR seulement : gendarmerie et unités civiles rejoignent le PCO." })
  @IsOptional() @IsIn(DESTINATIONS as unknown as string[])
  destination?: (typeof DESTINATIONS)[number];
}

/** Changement du mode de la station (ADR 0016), signé par le mot de passe du Super Administrateur. */
/** Bascule du mode de l'application (ADR 0022) — Super Administrateur, signée. */
export class SetProfileDto {
  @ApiProperty({ enum: ["classique", "direx"], description: "classique (l'organisation actuelle) ou direx (DIREX, PC FAR, PCF, PCT, PCO)" })
  @IsIn(["classique", "direx"])
  profile!: "classique" | "direx";

  @ApiProperty({ description: "Mot de passe du compte qui agit", maxLength: 200 })
  @IsString() @MinLength(1) @MaxLength(200)
  password!: string;
}

export class SetModeDto {
  @ApiProperty({ enum: APP_MODES, description: "demo, exercise ou operational" })
  @IsIn(APP_MODES as unknown as string[])
  mode!: (typeof APP_MODES)[number];

  @ApiProperty({ description: "Mot de passe du compte qui agit", maxLength: 200 })
  @IsString() @MinLength(1) @MaxLength(200)
  password!: string;
}

// --- Ressources (ADR 0016) ----------------------------------------------------

/** Détenteur d'une ressource : une unité, un hôpital ou un abri. */
export class ResourceOwnerDto {
  @ApiProperty({ enum: RESOURCE_OWNER_KINDS })
  @IsIn(RESOURCE_OWNER_KINDS as unknown as string[])
  kind!: (typeof RESOURCE_OWNER_KINDS)[number];

  @ApiProperty({ example: "U3" })
  @IsString() @MinLength(1) @MaxLength(40)
  id!: string;
}

export class CreatePersonDto {
  @ApiProperty({ type: ResourceOwnerDto })
  @ValidateNested() @Type(() => ResourceOwnerDto)
  owner!: ResourceOwnerDto;

  @ApiProperty({ enum: PERSON_CORPS, description: "far, gendarmerie, fa, dgsn (grade) ; dgpc, civil (fonction)" })
  @IsIn(PERSON_CORPS as unknown as string[])
  corps!: (typeof PERSON_CORPS)[number];

  @ApiPropertyOptional({ maxLength: 60 }) @IsOptional() @IsString() @MaxLength(60)
  grade?: string;

  @ApiProperty({ maxLength: 80 }) @IsString() @MinLength(1) @MaxLength(80)
  nom!: string;

  @ApiProperty({ maxLength: 80 }) @IsString() @MinLength(1) @MaxLength(80)
  prenom!: string;

  @ApiProperty({ maxLength: 40 }) @IsString() @MinLength(1) @MaxLength(40)
  matricule!: string;

  @ApiProperty({ maxLength: 120 }) @IsString() @MinLength(1) @MaxLength(120)
  fonction!: string;

  @ApiPropertyOptional({ description: "Équipe d'appartenance" }) @IsOptional() @IsString() @MaxLength(40)
  teamId?: string;

  @ApiPropertyOptional({ enum: PERSON_STATUS, default: "present" }) @IsOptional() @IsIn(PERSON_STATUS as unknown as string[])
  status?: (typeof PERSON_STATUS)[number];

  @ApiPropertyOptional({ maxLength: 40 }) @IsOptional() @IsString() @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional({ maxLength: 300 }) @IsOptional() @IsString() @MaxLength(300)
  note?: string;
}

export class UpdatePersonDto {
  @ApiPropertyOptional({ enum: PERSON_CORPS }) @IsOptional() @IsIn(PERSON_CORPS as unknown as string[])
  corps?: (typeof PERSON_CORPS)[number];
  @ApiPropertyOptional({ maxLength: 60 }) @IsOptional() @IsString() @MaxLength(60)
  grade?: string;
  @ApiPropertyOptional({ maxLength: 80 }) @IsOptional() @IsString() @MinLength(1) @MaxLength(80)
  nom?: string;
  @ApiPropertyOptional({ maxLength: 80 }) @IsOptional() @IsString() @MinLength(1) @MaxLength(80)
  prenom?: string;
  @ApiPropertyOptional({ maxLength: 40 }) @IsOptional() @IsString() @MinLength(1) @MaxLength(40)
  matricule?: string;
  @ApiPropertyOptional({ maxLength: 120 }) @IsOptional() @IsString() @MinLength(1) @MaxLength(120)
  fonction?: string;
  @ApiPropertyOptional({ description: "Équipe d'appartenance ; chaîne vide pour en sortir" }) @IsOptional() @IsString() @MaxLength(40)
  teamId?: string;
  @ApiPropertyOptional({ enum: PERSON_STATUS }) @IsOptional() @IsIn(PERSON_STATUS as unknown as string[])
  status?: (typeof PERSON_STATUS)[number];
  @ApiPropertyOptional({ maxLength: 40 }) @IsOptional() @IsString() @MaxLength(40)
  phone?: string;
  @ApiPropertyOptional({ maxLength: 300 }) @IsOptional() @IsString() @MaxLength(300)
  note?: string;
}

export class CreateTeamDto {
  @ApiProperty({ type: ResourceOwnerDto })
  @ValidateNested() @Type(() => ResourceOwnerDto)
  owner!: ResourceOwnerDto;
  @ApiProperty({ maxLength: 80 }) @IsString() @MinLength(1) @MaxLength(80)
  nom!: string;
  @ApiPropertyOptional({ maxLength: 200 }) @IsOptional() @IsString() @MaxLength(200)
  mission?: string;
  @ApiPropertyOptional({ description: "Chef d'équipe (identifiant de personne)" }) @IsOptional() @IsString() @MaxLength(40)
  leaderId?: string;
  @ApiPropertyOptional({ type: [String], description: "Membres (identifiants de personnes de la même entité)" })
  @IsOptional() @IsArray() @IsString({ each: true })
  memberIds?: string[];
}

export class UpdateTeamDto {
  @ApiPropertyOptional({ maxLength: 80 }) @IsOptional() @IsString() @MinLength(1) @MaxLength(80)
  nom?: string;
  @ApiPropertyOptional({ maxLength: 200 }) @IsOptional() @IsString() @MaxLength(200)
  mission?: string;
  @ApiPropertyOptional({ description: "Chef d'équipe ; chaîne vide pour retirer" }) @IsOptional() @IsString() @MaxLength(40)
  leaderId?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true })
  memberIds?: string[];
}

export class CreateVehicleDto {
  @ApiProperty({ type: ResourceOwnerDto })
  @ValidateNested() @Type(() => ResourceOwnerDto)
  owner!: ResourceOwnerDto;
  @ApiProperty({ example: "Ambulance médicalisée", maxLength: 80 }) @IsString() @MinLength(1) @MaxLength(80)
  type!: string;
  @ApiPropertyOptional({ example: "FAR-2140", description: "Immatriculation ou numéro de parc", maxLength: 40 }) @IsOptional() @IsString() @MaxLength(40)
  plate?: string;
  @ApiPropertyOptional({ minimum: 1, default: 1, description: "Nombre de véhicules identiques" }) @IsOptional() @IsInt() @Min(1)
  qty?: number;
  @ApiPropertyOptional({ enum: VEHICLE_STATES, default: "ok" }) @IsOptional() @IsIn(VEHICLE_STATES as unknown as string[])
  state?: (typeof VEHICLE_STATES)[number];
  @ApiPropertyOptional({ maxLength: 120 }) @IsOptional() @IsString() @MaxLength(120)
  assignment?: string;
  @ApiPropertyOptional({ maxLength: 300 }) @IsOptional() @IsString() @MaxLength(300)
  note?: string;
}

export class UpdateVehicleDto {
  @ApiPropertyOptional({ maxLength: 80 }) @IsOptional() @IsString() @MinLength(1) @MaxLength(80)
  type?: string;
  @ApiPropertyOptional({ maxLength: 40 }) @IsOptional() @IsString() @MaxLength(40)
  plate?: string;
  @ApiPropertyOptional({ minimum: 1 }) @IsOptional() @IsInt() @Min(1)
  qty?: number;
  @ApiPropertyOptional({ enum: VEHICLE_STATES }) @IsOptional() @IsIn(VEHICLE_STATES as unknown as string[])
  state?: (typeof VEHICLE_STATES)[number];
  @ApiPropertyOptional({ maxLength: 120 }) @IsOptional() @IsString() @MaxLength(120)
  assignment?: string;
  @ApiPropertyOptional({ maxLength: 300 }) @IsOptional() @IsString() @MaxLength(300)
  note?: string;
}

export class CreateSupplyDto {
  @ApiProperty({ type: ResourceOwnerDto })
  @ValidateNested() @Type(() => ResourceOwnerDto)
  owner!: ResourceOwnerDto;
  @ApiProperty({ enum: SUPPLY_KINDS, description: "fuel = carburant, food = vivres, bedding = couchage, camp = campement" })
  @IsIn(SUPPLY_KINDS as unknown as string[])
  kind!: (typeof SUPPLY_KINDS)[number];
  @ApiProperty({ example: "Gazole", maxLength: 80 }) @IsString() @MinLength(1) @MaxLength(80)
  label!: string;
  @ApiProperty({ minimum: 0 }) @IsNumber() @Min(0)
  qty!: number;
  @ApiProperty({ example: "L", description: "Unité de compte : L, rations, places, tentes…", maxLength: 20 }) @IsString() @MinLength(1) @MaxLength(20)
  unit!: string;
  @ApiPropertyOptional({ minimum: 0 }) @IsOptional() @IsNumber() @Min(0)
  threshold?: number;
  @ApiPropertyOptional({ maxLength: 300 }) @IsOptional() @IsString() @MaxLength(300)
  note?: string;
}

export class UpdateSupplyDto {
  @ApiPropertyOptional({ enum: SUPPLY_KINDS }) @IsOptional() @IsIn(SUPPLY_KINDS as unknown as string[])
  kind?: (typeof SUPPLY_KINDS)[number];
  @ApiPropertyOptional({ maxLength: 80 }) @IsOptional() @IsString() @MinLength(1) @MaxLength(80)
  label?: string;
  @ApiPropertyOptional({ minimum: 0 }) @IsOptional() @IsNumber() @Min(0)
  qty?: number;
  @ApiPropertyOptional({ maxLength: 20 }) @IsOptional() @IsString() @MinLength(1) @MaxLength(20)
  unit?: string;
  @ApiPropertyOptional({ minimum: 0 }) @IsOptional() @IsNumber() @Min(0)
  threshold?: number;
  @ApiPropertyOptional({ maxLength: 300 }) @IsOptional() @IsString() @MaxLength(300)
  note?: string;
}

/** Article au parc d'un détenteur quel qu'il soit (unité, hôpital, abri). */
export class CreateOwnedEquipDto extends CreateEquipDto {
  @ApiProperty({ type: ResourceOwnerDto })
  @ValidateNested() @Type(() => ResourceOwnerDto)
  owner!: ResourceOwnerDto;

  @ApiPropertyOptional({ maxLength: 80, description: "Type d'équipement" }) @IsOptional() @IsString() @MaxLength(80)
  type?: string;

  @ApiPropertyOptional({ maxLength: 60, description: "Numéro d'inventaire / série" }) @IsOptional() @IsString() @MaxLength(60)
  serial?: string;

  @ApiPropertyOptional({ maxLength: 40, description: "Équipe du détenteur à laquelle l'article est affecté (ADR 0027)" }) @IsOptional() @IsString() @MaxLength(40)
  teamId?: string;
}

export class UpdateOwnedEquipDto extends UpdateEquipDto {
  @ApiPropertyOptional({ maxLength: 80 }) @IsOptional() @IsString() @MaxLength(80)
  type?: string;
  @ApiPropertyOptional({ maxLength: 60 }) @IsOptional() @IsString() @MaxLength(60)
  serial?: string;
  @ApiPropertyOptional({ maxLength: 40, description: "Équipe du détenteur ; chaîne vide pour retirer l'article de son équipe" }) @IsOptional() @IsString() @MaxLength(40)
  teamId?: string;
}
