import { Injectable } from "@nestjs/common";
import type { FeatureGate } from "@/common/ports/feature-gate.port";
import { FlagsService } from "@/modules/flags/flags.service";
import { UsersService } from "@/modules/iam/users.service";
import type { Feature, ModuleKey, Role } from "@/shared/permissions";

/**
 * Répond à la garde RBAC : « ce module est-il coupé ? » — globalement (drapeaux,
 * dépôt mémoire ou Postgres) ou pour un rôle (matrice rôle → modules du
 * registre des comptes). Voir ADR 0015.
 */
@Injectable()
export class FeatureGateService implements FeatureGate {
  constructor(
    private readonly flags: FlagsService,
    private readonly users: UsersService,
  ) {}

  async moduleDisabled(module: ModuleKey): Promise<boolean> {
    const all = await this.flags.all();
    return all[module] === false;
  }

  roleFeatureDisabled(role: Role, feature: Feature): boolean {
    return !this.users.isFeatureGranted(role, feature);
  }

  roleModuleDisabled(role: Role, module: ModuleKey): boolean {
    return this.users.getRoleFeatures()[role]?.[module] === false;
  }

  userModuleOverride(username: string, module: ModuleKey): boolean | undefined {
    return this.users.userModules(username)[module];
  }
}
