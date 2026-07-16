import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IamService } from "@/modules/iam/iam.service";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import type { AuthUser } from "@/common/types/auth-user";

@ApiTags("iam")
@ApiBearerAuth()
@Controller("iam")
export class IamController {
  constructor(private readonly iam: IamService) {}

  @Get("me")
  @ApiOperation({ summary: "Profil de l'utilisateur courant + permissions résolues" })
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @Get("roles")
  @RequirePermission("iam:roles:read")
  @ApiOperation({ summary: "Catalogue des rôles et de leurs permissions" })
  roles() {
    return this.iam.listRoles();
  }

  @Get("permissions")
  @RequirePermission("iam:permissions:read")
  @ApiOperation({ summary: "Catalogue des permissions" })
  permissions() {
    return this.iam.listPermissions();
  }
}
