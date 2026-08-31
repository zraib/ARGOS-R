import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";
import configuration from "@/config/configuration";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { PermissionsGuard } from "@/common/guards/permissions.guard";
import { ScopeGuard } from "@/common/guards/scope.guard";
import { AuditInterceptor } from "@/common/interceptors/audit.interceptor";
import { DatabaseModule } from "@/db/database.module";
import { AuditModule } from "@/modules/audit/audit.module";
import { HealthModule } from "@/modules/health/health.module";
import { IamModule } from "@/modules/iam/iam.module";
import { FlagsModule } from "@/modules/flags/flags.module";
import { DomainModule } from "@/modules/domain/domain.module";
import { OrdersModule } from "@/modules/orders/orders.module";
import { AviationModule } from "@/modules/aviation/aviation.module";
import { NrbcModule } from "@/modules/nrbc/nrbc.module";
import { MissionsModule } from "@/modules/missions/missions.module";
import { IncidentDashboardModule } from "@/modules/incident-dashboard/incident-dashboard.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport: process.env.NODE_ENV === "production" ? undefined : { target: "pino-pretty", options: { singleLine: true } },
        autoLogging: true,
      },
    }),
    DatabaseModule,
    AuditModule,
    HealthModule,
    IamModule,
    FlagsModule,
    DomainModule,
    OrdersModule,
    AviationModule,
    NrbcModule,
    MissionsModule,
    IncidentDashboardModule,
  ],
  providers: [
    // Ordre : authentification (JWT), autorisation par rôle (RBAC), puis
    // cantonnement au périmètre affecté (ABAC). Global = default-deny.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: ScopeGuard },
    // Journalisation automatique des mutations dans le journal d'audit chaîné.
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
