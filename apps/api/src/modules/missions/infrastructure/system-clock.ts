// ============================================================================
// ARGOS — adaptateur horloge : le temps réel du système.
// ============================================================================

import { Injectable } from "@nestjs/common";
import type { Clock } from "@/modules/missions/ports/clock.port";

@Injectable()
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  shortLabel(): string {
    const d = this.now();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
}
