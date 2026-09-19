import { Global, Module } from "@nestjs/common";
import { ModeService } from "@/modules/mode/mode.service";
import { ProfileService } from "@/modules/mode/profile.service";

/** Le mode de la station et le mode de l'application (ADR 0022) sont lus par plusieurs modules : fournis globalement. */
@Global()
@Module({ providers: [ModeService, ProfileService], exports: [ModeService, ProfileService] })
export class ModeModule {}
