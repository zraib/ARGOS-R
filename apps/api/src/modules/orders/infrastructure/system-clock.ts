// ============================================================================
// ARGOS — adaptateur horloge : horloge système
// Implémentation par défaut du port `Clock`. En test, on lui substitue une
// horloge figée : le service devient déterministe sans être modifié.
// ============================================================================

import { Injectable } from "@nestjs/common";
import type { Clock } from "@/modules/orders/ports/clock.port";

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
