import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FlagsService } from "@/modules/flags/flags.service";
import { FlagsController } from "@/modules/flags/flags.controller";
import { FLAGS_REPOSITORY, type FlagsRepository } from "@/modules/flags/flags.repository";
import { FlagsMemoryRepository } from "@/modules/flags/flags.memory.repository";
import { FlagsDrizzleRepository } from "@/modules/flags/flags.drizzle.repository";
import { DRIZZLE } from "@/db/database.module";
import type { Db } from "@/db/client";
import type { DbDriver } from "@/config/configuration";

@Module({
  controllers: [FlagsController],
  providers: [
    FlagsService,
    {
      provide: FLAGS_REPOSITORY,
      inject: [ConfigService, DRIZZLE],
      useFactory: (config: ConfigService, db: Db | null): FlagsRepository =>
        config.get<DbDriver>("dbDriver") === "postgres" && db ? new FlagsDrizzleRepository(db) : new FlagsMemoryRepository(),
    },
  ],
  exports: [FlagsService],
})
export class FlagsModule {}
