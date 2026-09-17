import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { REGIONS_MA } from "@/modules/domain/provinces.data";
import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateIf, ValidateNested } from "class-validator";
import { MODULE_FEATURES, ROLES, type Role } from "@/shared/permissions";

/**
 * Rattachement d'un compte : l'entité dont il répond, par nature de
 * responsabilité. Une propriété nommée par nature (plutôt qu'un objet libre)
 * pour que le contrat OpenAPI — et donc le client généré — soit typé.
 */
export class AssignmentsDto {
  // --- Rattachements NON-ENTITÉ (lot V-1) -----------------------------------
  // Tous les rôles ne répondent pas d'un établissement : le wali et la place
  // d'armes répondent d'un territoire, la conduite d'une opération.

  @ApiPropertyOptional({
    example: "Casablanca-Settat",
    enum: REGIONS_MA,
    description: "Région administrative (Wali, Place d'Armes) — doit appartenir au référentiel des 12 régions. Un seul titulaire de chaque rôle par région.",
  })
  @IsOptional() @IsIn(REGIONS_MA)
  region?: string;

  @ApiPropertyOptional({
    example: "INC-2607",
    description: "Incident de déploiement (OPCOM, TACOM, cellules, resp. abri et équipement). UN SEUL à la fois.",
  })
  @IsOptional() @IsString()
  incident?: string;

  @ApiPropertyOptional({ example: "H4", description: "Hôpital militaire (Responsable Hôpital)" })
  @IsOptional() @IsString()
  hospital?: string;

  @ApiPropertyOptional({ example: "U2", description: "Unité (Commandant d'unité)" })
  @IsOptional() @IsString()
  unit?: string;

  @ApiPropertyOptional({ example: "AB-04", description: "Abri (Responsable Abri)" })
  @IsOptional() @IsString()
  shelter?: string;

  @ApiPropertyOptional({ example: "M1", description: "Site mortuaire (Responsable Morgue)" })
  @IsOptional() @IsString()
  morgue?: string;

  @ApiPropertyOptional({ example: "U2", description: "Parc d'équipement (Responsable Équipement)" })
  @IsOptional() @IsString()
  equipment?: string;
}

/** Corps de la demande de jeton de développement (mode dev uniquement). */
export class DevTokenDto {
  @ApiProperty({ example: "k.benjelloun" })
  @IsString()
  @MinLength(1)
  username!: string;

  @ApiProperty({ enum: ROLES, example: "superadmin" })
  @IsIn(ROLES as unknown as string[])
  role!: Role;
}

/** Connexion d'un compte géré (matricule + code temporaire ou mot de passe). */
export class LoginDto {
  @ApiProperty({ example: "n.fassi" })
  @IsString()
  @MinLength(1)
  matricule!: string;

  @ApiProperty({ example: "A7X2-K9D3" })
  @IsString()
  @MinLength(1)
  password!: string;
}

/** « Mot de passe oublié » — depuis l'écran de connexion, sans session. */
export class PasswordResetRequestDto {
  @ApiProperty({ example: "n.fassi", description: "Nom d'utilisateur du compte concerné" })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  matricule!: string;
}

/** Changement du mot de passe (1er login). */
export class ChangePasswordDto {
  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

/** Mise à jour du profil par l'utilisateur (nom affiché, photo). */
export class UpdateProfileDto {
  @ApiPropertyOptional({ type: String, description: "Nom affiché" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  nom?: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: "Photo de profil (data URL) ; null pour retirer" })
  @IsOptional()
  @IsString()
  photo?: string | null;
}

/** Sélection du rôle actif (compte multi-rôles). */
export class SelectRoleDto {
  @ApiProperty({ enum: ROLES })
  @IsIn(ROLES as unknown as string[])
  role!: Role;
}

/** Création d'un utilisateur. Les règles d'attribution sont appliquées côté serveur. */
export class CreateUserDto {
  @ApiProperty({ example: "a.saidi" })
  @IsString()
  @MinLength(1)
  matricule!: string;

  @ApiProperty({ example: "Saidi", description: "Nom de famille" })
  @IsString()
  @MinLength(1)
  nom!: string;

  @ApiPropertyOptional({ example: "Ahmed", description: "Prénom" })
  @IsOptional()
  @IsString()
  prenom?: string;

  @ApiPropertyOptional({ example: "+212600000000", description: "Téléphone de contact" })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: "Capitaine" })
  @IsOptional()
  @IsString()
  grade?: string;

  @ApiProperty({ enum: ROLES, isArray: true, example: ["tacom", "bluecell"] })
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(ROLES as unknown as string[], { each: true })
  roles!: Role[];

  @ApiPropertyOptional({
    type: AssignmentsDto,
    description: "Entité affectée par nature de responsabilité (portée ABAC). Obligatoire pour tout rôle « resp_* ».",
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AssignmentsDto)
  assignments?: AssignmentsDto;
}

/** Modification d'un utilisateur (champs optionnels). */
export class UpdateUserDto {
  @ApiPropertyOptional({ example: "a.saidi", description: "Nom d'utilisateur — Super Administrateur uniquement" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  matricule?: string;

  @ApiPropertyOptional({ example: "Saidi" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  nom?: string;

  @ApiPropertyOptional({ example: "Ahmed" })
  @IsOptional()
  @IsString()
  prenom?: string;

  @ApiPropertyOptional({ example: "+212600000000" })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: "Capitaine" })
  @IsOptional()
  @IsString()
  grade?: string;

  @ApiPropertyOptional({ enum: ROLES, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(ROLES as unknown as string[], { each: true })
  roles?: Role[];

  @ApiPropertyOptional({ type: AssignmentsDto, description: "Entité affectée par nature de responsabilité (portée ABAC)." })
  @IsOptional()
  @ValidateNested()
  @Type(() => AssignmentsDto)
  assignments?: AssignmentsDto;
}

/** Activation forcée / suspension d'un compte. */
export class SetActiveDto {
  @ApiProperty()
  @IsBoolean()
  active!: boolean;
}

/** Bascule d'un module pour un rôle (vocabulaire `MODULE_KEYS`, ADR 0015). */
export class ToggleRoleFeatureDto {
  @ApiProperty({ enum: MODULE_FEATURES, description: "Module à ouvrir ou couper pour le rôle" })
  @IsIn(MODULE_FEATURES as unknown as string[])
  feature!: string;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}

/** Bascule d'un module pour UN compte (ADR 0016) ; `enabled` à `null` rend la main au rôle. */
export class ToggleUserModuleDto {
  @ApiProperty({ enum: MODULE_FEATURES, description: "Module à ouvrir ou couper pour le compte" })
  @IsIn(MODULE_FEATURES as unknown as string[])
  module!: string;

  @ApiProperty({ type: Boolean, nullable: true, description: "true : ouvert malgré le rôle ; false : coupé ; null : le rôle décide" })
  @ValidateIf((_, v) => v !== null)
  @IsBoolean()
  enabled!: boolean | null;
}
