import { roleInProfile } from "@/shared/profiles";
import { ProfileService } from "@/modules/mode/profile.service";
import { CanActivate, ExecutionContext, Inject, Injectable, Optional, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";
import { IS_PUBLIC_KEY } from "@/common/decorators/public.decorator";
import { SCOPE_RESOLVER, type ScopeResolver } from "@/common/ports/scope-resolver.port";
import type { AppConfig } from "@/config/configuration";
import { ROLES, isRole, permissionsForRole, type Role } from "@/shared/permissions";
import type { AuthUser } from "@/common/types/auth-user";

// Ordre de priorité si le jeton porte plusieurs rôles (Keycloak realm_access).
const ROLE_PRIORITY = [...ROLES];

interface KeycloakClaims extends JWTPayload {
  preferred_username?: string;
  realm_access?: { roles?: string[] };
  role?: string;
}

/**
 * Garde d'authentification globale. Vérifie le jeton porteur :
 *  - mode `keycloak` : RS256 via le JWKS distant, issuer + audience contrôlés ;
 *  - mode `dev` : HS256 avec un secret local (tests sans serveur Keycloak).
 * Le rôle est lu depuis le jeton mais les PERMISSIONS sont résolues côté serveur
 * (RBAC) — jamais fait confiance à des permissions portées par le client.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private jwks?: JWTVerifyGetKey;

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService<AppConfig, true>,
    // Optionnel : la garde reste fonctionnelle si aucun résolveur n'est fourni
    // (la portée est alors absente, donc le ScopeGuard refuse — default-deny).
    @Optional() @Inject(SCOPE_RESOLVER) private readonly scopes?: ScopeResolver,
    // Le mode de l'application (ADR 0022) : un rôle de l'autre profil n'entre pas.
    @Optional() private readonly profiles?: ProfileService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string>; user?: AuthUser }>();
    const auth = req.headers["authorization"] ?? req.headers["Authorization"];
    if (!auth || !auth.startsWith("Bearer ")) throw new UnauthorizedException("Jeton porteur manquant");
    const token = auth.slice(7).trim();

    const claims = await this.verify(token);
    const role = this.resolveRole(claims);
    if (!role) throw new UnauthorizedException("Aucun rôle IRIS dans le jeton");

    const username = claims.preferred_username ?? String(claims.sub ?? "inconnu");
    const active = this.profiles?.current() ?? "classique";
    if (!roleInProfile(role, active)) throw new UnauthorizedException(this.profiles?.refusal() ?? "Ce rôle n'est pas servi dans le mode en service.");
    req.user = {
      sub: String(claims.sub ?? ""),
      username,
      role,
      profile: active,
      permissions: permissionsForRole(role),
      // Portée ABAC relue à chaque requête depuis le registre des comptes —
      // jamais depuis le jeton : une réaffectation prend effet immédiatement et
      // le client ne peut revendiquer aucun périmètre.
      scope: this.scopes?.resolveScope(username),
    };
    return true;
  }

  private async verify(token: string): Promise<KeycloakClaims> {
    const mode = this.config.get("authMode", { infer: true });
    try {
      if (mode === "dev") {
        const secret = new TextEncoder().encode(this.config.get("devSecret", { infer: true }));
        const { payload } = await jwtVerify(token, secret);
        return payload as KeycloakClaims;
      }
      const kc = this.config.get("keycloak", { infer: true });
      if (!this.jwks) this.jwks = createRemoteJWKSet(new URL(kc.jwksUri));
      const { payload } = await jwtVerify(token, this.jwks, { issuer: kc.issuer, audience: kc.audience });
      return payload as KeycloakClaims;
    } catch {
      throw new UnauthorizedException("Jeton invalide ou expiré");
    }
  }

  private resolveRole(claims: KeycloakClaims): Role | null {
    // Jeton dev : rôle porté directement.
    if (isRole(claims.role)) return claims.role;
    // Keycloak : on retient le rôle ARGOS de plus haute priorité présent.
    const roles = claims.realm_access?.roles ?? [];
    for (const r of ROLE_PRIORITY) if (roles.includes(r)) return r;
    return null;
  }
}
