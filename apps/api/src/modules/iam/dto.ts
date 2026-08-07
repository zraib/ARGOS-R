import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, MinLength } from "class-validator";
import { MODULE_FEATURES, ROLES, type Role } from "@/shared/permissions";

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

  @ApiProperty({ enum: ROLES, isArray: true, example: ["command", "dispatcher"] })
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(ROLES as unknown as string[], { each: true })
  roles!: Role[];
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
}

/** Activation forcée / suspension d'un compte. */
export class SetActiveDto {
  @ApiProperty()
  @IsBoolean()
  active!: boolean;
}

/** Bascule d'une fonctionnalité pour un rôle. */
export class ToggleRoleFeatureDto {
  @ApiProperty({ enum: MODULE_FEATURES })
  @IsIn(MODULE_FEATURES as unknown as string[])
  feature!: string;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}
