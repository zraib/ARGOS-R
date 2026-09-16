import { Global, Module } from "@nestjs/common";
import { ModeService } from "@/modules/mode/mode.service";

/** Le mode de la station est lu par plusieurs modules : fourni globalement. */
@Global()
@Module({ providers: [ModeService], exports: [ModeService] })
export class ModeModule {}
