import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { FlagsService } from "@/modules/flags/flags.service";
import { ToggleFlagDto } from "@/modules/flags/dto";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";

@ApiTags("flags")
@ApiBearerAuth()
@Controller("flags")
export class FlagsController {
  constructor(private readonly flags: FlagsService) {}

  @Get()
  @RequirePermission("admin:feature_flags:read")
  @ApiOperation({ summary: "Lire la matrice des feature flags" })
  all() {
    return this.flags.all();
  }

  @Patch(":key")
  @RequirePermission("admin:feature_flags:toggle")
  @ApiOperation({ summary: "Activer/désactiver un module (Super Admin) — audité" })
  toggle(@Param("key") key: string, @Body() dto: ToggleFlagDto) {
    return this.flags.set(key, dto.enabled);
  }
}
