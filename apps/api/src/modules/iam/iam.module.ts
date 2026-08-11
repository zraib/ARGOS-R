import { Module } from "@nestjs/common";
import { IamService } from "@/modules/iam/iam.service";
import { UsersService } from "@/modules/iam/users.service";
import { IamController } from "@/modules/iam/iam.controller";
import { UsersController } from "@/modules/iam/users.controller";
import { AuthController } from "@/modules/iam/auth.controller";
import { SCOPE_RESOLVER } from "@/common/ports/scope-resolver.port";

@Module({
  controllers: [AuthController, IamController, UsersController],
  providers: [
    IamService,
    UsersService,
    // Le registre des comptes fournit la portée ABAC à la garde JWT, qui ne
    // connaît que le port `ScopeResolver` (common/ ne dépend pas de modules/).
    { provide: SCOPE_RESOLVER, useExisting: UsersService },
  ],
  exports: [IamService, UsersService, SCOPE_RESOLVER],
})
export class IamModule {}
