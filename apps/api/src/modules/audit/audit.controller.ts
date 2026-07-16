import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuditService } from "@/modules/audit/audit.service";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";

@ApiTags("audit")
@ApiBearerAuth()
@Controller("audit")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermission("audit:log:read")
  @ApiOperation({ summary: "Lister les entrées du journal d'audit (rôle Auditeur/Super Admin)" })
  @ApiOkResponse({ description: "Entrées les plus récentes (chaînées par hash)." })
  list(@Query("limit") limit?: string) {
    return this.audit.list(limit ? parseInt(limit, 10) : 100);
  }

  @Get("verify")
  @RequirePermission("audit:log:verify")
  @ApiOperation({ summary: "Vérifier l'intégrité de la chaîne d'audit (tamper-evidence)" })
  verify() {
    return this.audit.verify();
  }
}
