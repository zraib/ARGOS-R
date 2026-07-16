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

  @ApiProperty({ example: "Cne. A. Saidi" })
  @IsString()
  @MinLength(1)
  nom!: string;

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
  @ApiPropertyOptional({ example: "Cne. A. Saidi" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  nom?: string;

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
