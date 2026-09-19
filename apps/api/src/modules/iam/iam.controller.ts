import { Controller, Get } from "@nestjs/common";
import { SelfService } from "@/common/decorators/self-service.decorator";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IamService } from "@/modules/iam/iam.service";
import { UsersService } from "@/modules/iam/users.service";
import { FlagsService } from "@/modules/flags/flags.service";
import { ModeService } from "@/modules/mode/mode.service";
import { ProfileService } from "@/modules/mode/profile.service";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import type { AuthUser } from "@/common/types/auth-user";
import { describeProfiles } from "@/shared/profiles";

@ApiTags("iam")
@ApiBearerAuth()
@Controller("iam")
export class IamController {
  constructor(
    private readonly iam: IamService,
    private readonly users: UsersService,
    private readonly flags: FlagsService,
    private readonly mode: ModeService,
    private readonly appProfile: ProfileService,
  ) {}

  @Get("me")
  @SelfService()
  @ApiOperation({ summary: "Profil de l'utilisateur courant + permissions résolues + modules effectifs (drapeaux ∧ rôle ∧ compte, ADR 0016) + mode de la station" })
  async me(@CurrentUser() user: AuthUser) {
    const flags = await this.flags.all();
    return { ...user, modules: this.users.effectiveModules(user.username, user.role, flags), appMode: this.mode.current() };
  }

  @Get("profiles")
  @SelfService()
  @ApiOperation({ summary: "Les deux profils de rôles (ADR 0022) : « classique » et « direx », avec leurs rôles, libellés et échelons" })
  profiles() {
    return { active: this.appProfile.current(), label: this.appProfile.label(), profiles: describeProfiles() };
  }

  @Get("roles")
  @RequirePermission("users:view")
  @ApiOperation({ summary: "Catalogue des rôles et de leurs permissions" })
  roles() {
    return this.iam.listRoles();
  }

  @Get("permissions")
  @RequirePermission("users:view")
  @ApiOperation({ summary: "Catalogue des permissions" })
  permissions() {
    return this.iam.listPermissions();
  }
}
