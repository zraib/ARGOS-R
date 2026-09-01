import { Global, Module } from "@nestjs/common";
import { RealtimeService } from "@/modules/realtime/realtime.service";
import { AttachmentsService } from "@/modules/realtime/attachments.service";
import { RealtimeController } from "@/modules/realtime/realtime.controller";

// ============================================================================
// ARGOS — module temps réel (lot COMMS)
//
// `@Global` à dessein : le domaine doit pouvoir POUSSER un événement quand un
// message est posté ou un canal renommé, sans que le module du domaine ait à
// dépendre de celui-ci dans les deux sens. Un bus d'événements est l'un des
// rares cas où la portée globale évite un cycle plutôt que de masquer un
// couplage.
// ============================================================================

@Global()
@Module({
  controllers: [RealtimeController],
  providers: [RealtimeService, AttachmentsService],
  exports: [RealtimeService, AttachmentsService],
})
export class RealtimeModule {}
