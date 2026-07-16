import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "@/common/decorators/public.decorator";

@ApiTags("health")
@Controller("health")
export class HealthController {
  @Public()
  @Get()
  @ApiOperation({ summary: "Sonde de vivacité (publique)" })
  check() {
    return { status: "ok", service: "argos-api", ts: new Date().toISOString(), uptime: Math.round(process.uptime()) };
  }
}
