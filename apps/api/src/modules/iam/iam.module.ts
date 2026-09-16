import { Module } from "@nestjs/common";
import { IamService } from "@/modules/iam/iam.service";
import { UsersService } from "@/modules/iam/users.service";
import { FeatureGateService } from "@/modules/iam/feature-gate.service";
import { IamController } from "@/modules/iam/iam.controller";
import { UsersController } from "@/modules/iam/users.controller";
import { AuthController } from "@/modules/iam/auth.controller";
import { FlagsModule } from "@/modules/flags/flags.module";
import { SCOPE_RESOLVER } from "@/common/ports/scope-resolver.port";
import { FEATURE_GATE } from "@/common/ports/feature-gate.port";

@Module({
  imports: [FlagsModule],
  controllers: [AuthController, IamController, UsersController],
  providers: [
    IamService,
    UsersService,
    FeatureGateService,
    // Le registre des comptes fournit la portée ABAC à la garde JWT, qui ne
    // connaît que le port `ScopeResolver` (common/ ne dépend pas de modules/).
    { provide: SCOPE_RESOLVER, useExisting: UsersService },
    // Même inversion pour les bascules : la garde RBAC demande « module coupé ? »
    // au port `FeatureGate`, servi par les drapeaux et la matrice rôle → modules.
    { provide: FEATURE_GATE, useExisting: FeatureGateService },
  ],
  exports: [IamService, UsersService, SCOPE_RESOLVER, FEATURE_GATE],
})
export class IamModule {}
