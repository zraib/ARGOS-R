"use client";

import { SWITCH_OFF } from "@/lib/map/overlay";


/** Interrupteur on/off compact. */
export function Switch({ on }: { on: boolean }) {
  return (
    // inline-block obligatoire : un <span> inline ignore h-4/w-8 (largeur nulle).
    <span className={`relative inline-block h-5 w-10 shrink-0 rounded-full transition-colors ${on ? "bg-or-500" : SWITCH_OFF}`}>
      <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all" style={{ left: on ? 22 : 2 }} />
    </span>
  );
}
