import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuditService } from "@/modules/audit/audit.service";
import { AuditController } from "@/modules/audit/audit.controller";
import { AUDIT_REPOSITORY, type AuditRepository } from "@/modules/audit/audit.repository";
import { AuditMemoryRepository } from "@/modules/audit/audit.memory.repository";
import { AuditDrizzleRepository } from "@/modules/audit/audit.drizzle.repository";
import { DRIZZLE } from "@/db/database.module";
import type { Db } from "@/db/client";
import type { DbDriver } from "@/config/configuration";

/** Module d'audit — global pour que l'intercepteur puisse l'injecter partout. */
@Global()
@Module({
  controllers: [AuditController],
  providers: [
    AuditService,
    {
      provide: AUDIT_REPOSITORY,
      inject: [ConfigService, DRIZZLE],
      useFactory: (config: ConfigService, db: Db | null): AuditRepository =>
        config.get<DbDriver>("dbDriver") === "postgres" && db ? new AuditDrizzleRepository(db) : new AuditMemoryRepository(),
    },
  ],
  exports: [AuditService],
})
export class AuditModule {}
