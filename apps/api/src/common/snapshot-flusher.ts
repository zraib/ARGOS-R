import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { flushDevState } from "@/common/dev-store";

// ============================================================================
// ARGOS — à la fermeture de l'application Nest (`app.close()` : tests,
// outillage), les instantanés encore différés sont écrits (ADR 0033). En
// service, l'arrêt par signal (docker stop, mode watch) les écrit aussi :
// voir main.ts.
// ============================================================================
@Injectable()
export class SnapshotFlusher implements OnApplicationShutdown {
  onApplicationShutdown(): void {
    flushDevState();
  }
}
