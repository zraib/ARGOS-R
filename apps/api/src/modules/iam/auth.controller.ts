import { Body, Controller, ForbiddenException, Get, HttpCode, HttpException, HttpStatus, Ip, Patch, Post, UnauthorizedException } from "@nestjs/common";
import { SelfService } from "@/common/decorators/self-service.decorator";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { SignJWT } from "jose";
import { Public } from "@/common/decorators/public.decorator";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { AuditMeta, type AuditMetaSetter } from "@/common/decorators/audit-meta.decorator";
import { ChangePasswordDto, DevTokenDto, LoginDto, PasswordResetRequestDto, SelectRoleDto, UpdateProfileDto } from "@/modules/iam/dto";
import { displayName, UsersService } from "@/modules/iam/users.service";
import { RateWindow } from "@/modules/iam/rate-window";
import { NoticesService } from "@/modules/realtime/notices.service";
import type { AuthUser } from "@/common/types/auth-user";
import type { Role } from "@/shared/permissions";
import type { AppConfig } from "@/config/configuration";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  /**
   * Débit des demandes « mot de passe oublié » : une par compte et par minute,
   * vingt par adresse et par dix minutes. La route est publique : sans borne,
   * elle serait le moyen le moins cher de faire sonner la cloche de tous les
   * administrateurs, ou de parcourir les noms d'utilisateur.
   */
  private readonly resetByAccount = new RateWindow(1, 60_000);
  private readonly resetByAddress = new RateWindow(20, 10 * 60_000);
  /**
   * Échecs de connexion : dix par compte et par quart d'heure, trois cents par
   * adresse. Seuls les ÉCHECS comptent — un opérateur qui se connecte dix fois
   * dans la journée n'est pas concerné. La station peut être exposée le temps
   * d'une démonstration (deploy/README.md § 10, ADR 0013) : la route de
   * connexion est alors la seule porte publique, et un mot de passe ne se
   * devine pas à la vitesse du réseau. Derrière le proxy de la station toutes
   * les requêtes portent la même adresse : la borne par adresse est large et
   * n'est qu'un frein global ; celle par compte fait le travail.
   */
  private readonly loginByAccount = new RateWindow(10, 15 * 60_000);
  private readonly loginByAddress = new RateWindow(300, 15 * 60_000);

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly users: UsersService,
    private readonly notices: NoticesService,
  ) {}

  /** Signe un jeton HS256 local (mode dev). Interdit hors mode développement. */
  private async signDevToken(username: string, role: Role): Promise<string> {
    if (this.config.get("authMode", { infer: true }) !== "dev") {
      throw new ForbiddenException("Émission de jeton dev désactivée hors mode développement");
    }
    // La station tourne en `AUTH_MODE=dev` (comptes gérés dans l'application),
    // mais elle est en PRODUCTION : sans cette barrière, quiconque joint son
    // adresse obtiendrait un jeton de n'importe quel rôle sans mot de passe.
    // Le mode dev de l'authentification n'est pas le mode dev du processus.
    if ((process.env.NODE_ENV ?? "development") === "production") {
      throw new ForbiddenException("Émission de jeton dev désactivée en production");
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
  @ApiResponse({ status: 201, description: "Jeton de session, rôle actif, entités affectées et état du cycle de vie du compte." })
  @ApiResponse({ status: 429, description: "Trop d'échecs récents pour ce compte ou cette adresse — réessayer plus tard." })
  async login(@Body() dto: LoginDto, @Ip() ip: string) {
    const key = dto.matricule.trim().toLowerCase();
    const addr = ip ?? "?";
    if (this.loginByAccount.exhausted(key) || this.loginByAddress.exhausted(addr)) {
      throw new HttpException("Trop de tentatives — réessayez dans quelques minutes.", HttpStatus.TOO_MANY_REQUESTS);
    }
    const res = this.users.authenticate(dto.matricule, dto.password);
    if (!res) {
      this.loginByAccount.allow(key);
      this.loginByAddress.allow(addr);
      throw new UnauthorizedException("Matricule ou mot de passe incorrect.");
    }
    const activeRole = res.user.roles[0];
    const token = await this.signDevToken(res.user.matricule, activeRole);
    return {
      access_token: token,
      token_type: "Bearer",
      expires_in: 28800,
      role: activeRole,
      roles: res.user.roles,
      // Entités affectées : permettent au frontend d'orienter le responsable
      // vers SA page de gestion. Le cantonnement réel reste appliqué par l'API.
      assignments: res.user.assignments,
      nom: displayName(res.user),
      matricule: res.user.matricule,
      photo: res.user.photo,
      mustChangePassword: res.mustChangePassword,
      mustChooseRole: res.mustChooseRole,
    };
  }

  /**
   * « Mot de passe oublié » — depuis l'écran de connexion, SANS session.
   *
   * Pas d'e-mail (aucune messagerie sur un réseau isolé), pas de lien secret :
   * la demande est posée sur le compte et PORTÉE aux administrateurs qui
   * peuvent y répondre, par la cloche et le flux temps réel. L'un d'eux
   * régénère un code provisoire et le remet par la voie hiérarchique — le
   * circuit de la création du compte. La réponse est LA MÊME que le compte
   * existe ou non : l'écran de connexion n'est pas un annuaire. Le journal
   * d'audit, lui, garde ce qui a été demandé et si une demande a été posée.
   */
  @Public()
  @Post("password-reset-request")
  @HttpCode(202)
  @ApiOperation({ summary: "Mot de passe oublié : demander un code provisoire à l'administration (sans session)" })
  @ApiResponse({ status: 202, description: "Demande prise en compte — même réponse que le compte existe ou non." })
  requestPasswordReset(@Body() dto: PasswordResetRequestDto, @Ip() ip: string, @AuditMeta() audit: AuditMetaSetter) {
    const key = dto.matricule.trim().toLowerCase();
    const admis = this.resetByAddress.allow(ip ?? "?") && this.resetByAccount.allow(key);
    const user = admis ? this.users.requestPasswordReset(key) : null;
    if (user) {
      this.notices.push(
        this.users.listAdminsFor(user).map((a) => a.matricule),
        { kind: "password_reset_requested", userId: user.id, matricule: user.matricule, nom: displayName(user) },
      );
    }
    audit({ matricule: key, registered: !!user });
    return { ok: true };
  }

  /** Profil du compte courant (identité + photo). */
  @Get("profile")
  @SelfService()
  @ApiBearerAuth()
  @ApiOperation({ summary: "Profil du compte connecté (nom, grade, rôles, photo)" })
  profile(@CurrentUser() user: AuthUser) {
    return this.users.ownProfile(user.username);
  }

  /** Mise à jour par l'utilisateur de son propre profil (nom affiché, photo). */
  @Patch("profile")
  @SelfService()
  @ApiBearerAuth()
  @ApiOperation({ summary: "Modifier son profil : nom affiché et/ou photo (audité)" })
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateOwnProfile(user.username, dto);
  }

  /** Sélection du rôle actif d'un compte multi-rôles → nouveau jeton. */
  @Post("select-role")
  @SelfService()
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
  @SelfService()
  @ApiBearerAuth()
  @ApiOperation({ summary: "Changer son mot de passe (1er login) — active le compte" })
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    this.users.changePassword(user.username, dto.newPassword);
    return { ok: true };
  }
}
