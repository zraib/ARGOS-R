"use client";

import { Suspense } from "react";
import { MorgueService } from "@/components/morgue/MorgueService";

/** Service morgue : sites, morgues mobiles, registre des corps et chaîne de garde. `?site=` ouvre la fiche d'un site. */
export default function MorguePage() {
  return (
    <Suspense fallback={null}>
      <MorgueService />
    </Suspense>
  );
}
