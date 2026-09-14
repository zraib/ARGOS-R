"use client";

import { Suspense, lazy, useEffect, useState } from "react";
import { useArgos } from "@/lib/store";
import { CopilotFab } from "@/components/shell/copilot/CopilotFab";

// ============================================================================
// ARGOS — coquille du Copilot : la FAB seule, le corps à la demande
//
// AppFrame monte ce composant sur CHAQUE écran. Avant cette coupe, il tirait
// statiquement le tiroir complet et lib/ai/assistant.ts (~3 800 lignes à eux
// deux) dans le graphe initial de toutes les routes — pour une modale fermée
// par défaut. La coquille ne garde que le bouton flottant ; le corps arrive au
// premier ⌘K et RESTE monté ensuite (l'historique survit aux fermetures).
//
// Le bouton est `CopilotFab`, le même que le corps affiche quand le tiroir est
// fermé : une seule définition, plus de réplique à tenir à jour.
// ============================================================================

const CopilotBody = lazy(() => import("@/components/shell/CopilotBody"));

export function Copilot() {
  const copilotOpen = useArgos((s) => s.copilotOpen);
  const aiLog = useArgos((s) => s.aiLog);
  // Une fois ouvert, le corps reste monté : historique et état de saisie
  // survivent aux fermetures, exactement comme avant la coupe.
  const [warmed, setWarmed] = useState(false);
  useEffect(() => {
    if (copilotOpen) setWarmed(true);
  }, [copilotOpen]);

  const unread = Math.min(99, aiLog.filter((m) => m.role === "assistant").length);

  if (!warmed) return <CopilotFab unread={unread} />;
  // Pendant le chargement du corps (première ouverture uniquement, ~un battement
  // en local), rien n'est rendu : la FAB vient d'être pressée, le tiroir suit.
  return (
    <Suspense fallback={null}>
      <CopilotBody />
    </Suspense>
  );
}
