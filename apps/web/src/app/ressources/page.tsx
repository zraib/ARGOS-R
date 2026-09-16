"use client";

import { Suspense } from "react";
import { ResourcesScreen } from "@/components/resources/ResourcesScreen";
import { Loading } from "@/components/responsibility/Shared";

/** Écran « Ressources » (ADR 0016) — les paramètres d'URL exigent une frontière Suspense. */
export default function RessourcesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ResourcesScreen />
    </Suspense>
  );
}
