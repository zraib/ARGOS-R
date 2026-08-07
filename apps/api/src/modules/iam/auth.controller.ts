import { Body, Controller, ForbiddenException, Get, Patch, Post, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SignJWT } from "jose";
import { Public } from "@/common/decorators/public.decorator";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { ChangePasswordDto, DevTokenDto, LoginDto, SelectRoleDto, UpdateProfileDto } from "@/modules/iam/dto";
import { displayName, UsersService } from "@/modules/iam/users.service";
import type { AuthUser } from "@/common/types/auth-user";
import type { Role } from "@/shared/permissions";
import type { AppConfig } from "@/config/configuration";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly users: UsersService,
  ) {}

  /** Signe un jeton HS256 local (mode dev). Interdit hors mode développement. */
  private async signDevToken(username: string, role: Role): Promise<string> {
    if (this.config.get("authMode", { infer: true }) !== "dev") {
      throw new ForbiddenException("Émission de jeton dev désactivée hors mode développement");
    }
    const secret = new TextEncoder().encode(this.config.get("devSecret", { infer: true }));
    return new SignJWT({ preferred_username: username, role })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(username)
      .setIssuedAt()
      .setExpirationTime("8h")
      .sign(secret);
  }

  /**
   * Émet un jeton HS256 signé localement pour TESTER l'API sans Keycloak.
   * Disponible uniquement en mode `dev` — en production, l'authentification passe
   * exclusivement par Keycloak (OIDC + MFA).
   */
  @Public()
  @Post("dev-token")
  @ApiOperation({ summary: "Jeton de développement (mode dev uniquement)" })
  async devToken(@Body() dto: DevTokenDto) {
    const token = await this.signDevToken(dto.username, dto.role);
    return { access_token: token, token_type: "Bearer", expires_in: 28800, role: dto.role };
  }

  /**
   * Connexion d'un compte géré (registre serveur) : vérifie le code temporaire
   * ou le mot de passe, renvoie un jeton (rôle actif = 1er rôle) et l'état du
   * cycle de vie (changement de mot de passe / sélection de rôle requis).
   */
  @Public()
  @Post("login")
  @ApiOperation({ summary: "Connexion d'un compte géré (matricule + code/mot de passe)" })
  async login(@Body() dto: LoginDto) {
    const res = this.users.authenticate(dto.matricule, dto.password);
    if (!res) throw new UnauthorizedException("Matricule ou mot de passe incorrect.");
    const activeRole = res.user.roles[0];
    const token = await this.signDevToken(res.user.matricule, activeRole);
    return {
      access_token: token,
      token_type: "Bearer",
      expires_in: 28800,
      role: activeRole,
      roles: res.user.roles,
      nom: displayName(res.user),
      matricule: res.user.matricule,
      photo: res.user.photo,
      mustChangePassword: res.mustChangePassword,
      mustChooseRole: res.mustChooseRole,
    };
  }

  /** Profil du compte courant (identité + photo). */
  @Get("profile")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Profil du compte connecté (nom, grade, rôles, photo)" })
  profile(@CurrentUser() user: AuthUser) {
    return this.users.ownProfile(user.username);
  }

  /** Mise à jour par l'utilisateur de son propre profil (nom affiché, photo). */
  @Patch("profile")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Modifier son profil : nom affiché et/ou photo (audité)" })
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateOwnProfile(user.username, dto);
  }

  /** Sélection du rôle actif d'un compte multi-rôles → nouveau jeton. */
  @Post("select-role")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Choisir le rôle actif (compte multi-rôles) — nouveau jeton" })
  async selectRole(@CurrentUser() user: AuthUser, @Body() dto: SelectRoleDto) {
    if (!this.users.hasRole(user.username, dto.role)) {
      throw new ForbiddenException("Rôle non attribué à ce compte.");
    }
    const token = await this.signDevToken(user.username, dto.role);
    return { access_token: token, token_type: "Bearer", expires_in: 28800, role: dto.role };
  }

  /** 1er login : l'utilisateur pose son mot de passe → compte activé. */
  @Post("change-password")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Changer son mot de passe (1er login) — active le compte" })
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    this.users.changePassword(user.username, dto.newPassword);
    return { ok: true };
  }
}
