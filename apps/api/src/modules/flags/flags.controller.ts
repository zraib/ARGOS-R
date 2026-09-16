import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { FlagsService } from "@/modules/flags/flags.service";
import { ToggleFlagDto } from "@/modules/flags/dto";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import { SelfService } from "@/common/decorators/self-service.decorator";

@ApiTags("flags")
@ApiBearerAuth()
@Controller("flags")
export class FlagsController {
  constructor(private readonly flags: FlagsService) {}

  @ApiOperation({
    summary: "Lire la matrice des feature flags.",
    description:
      "Lisible par tout compte authentifié : le navigateur masque les modules coupés, l'API les refuse (ADR 0015). " +
      "Avant, la route exigeait `settings:view` — un rôle non administrateur ne recevait jamais les drapeaux.",
  })
  @Get()
  @SelfService()
  all() {
    return this.flags.all();
  }

  @Patch(":key")
  @RequirePermission("settings:update")
  @ApiOperation({ summary: "Activer/désactiver un module (Super Admin) — audité, effectif côté API dès la requête suivante" })
  toggle(@Param("key") key: string, @Body() dto: ToggleFlagDto) {
    return this.flags.set(key, dto.enabled);
  }
}
