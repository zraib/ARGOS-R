import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import { Public } from "@/common/decorators/public.decorator";
import type { AppConfig, DbDriver } from "@/config/configuration";

/** Les modules qui ont un adaptateur PostgreSQL (Drizzle) ; les autres restent en mémoire quel que soit le pilote. */
const MODULES_POSTGRES = ["audit", "flags", "orders"] as const;
const MODULES_MEMOIRE = ["iam", "domain", "incident-dashboard", "missions", "nrbc", "aviation", "tracking", "realtime"] as const;

/**
 * Ce qui persiste, et où — DIT par l'API plutôt que supposé. Un auditeur ou un
 * exploitant lit ici, sans ouvrir le code, que six modules restent en mémoire
 * même avec DB_DRIVER=postgres (registre R-1).
 */
export function persistenceReport(driver: DbDriver) {
  const modules: Record<string, "postgres" | "memory"> = {};
  for (const m of MODULES_POSTGRES) modules[m] = driver === "postgres" ? "postgres" : "memory";
  for (const m of MODULES_MEMOIRE) modules[m] = "memory";
  return { driver, modules };
}

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "Sonde de vivacité (publique)" })
  check() {
    return {
      status: "ok",
      service: "argos-api",
      ts: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      persistence: persistenceReport(this.config.get("dbDriver", { infer: true })),
      // Profil de données (ADR 0015) : une station en service répond `empty`.
      dataProfile: this.config.get("dataProfile", { infer: true }),
      appMode: this.config.get("appMode", { infer: true }),
    };
  }
}
