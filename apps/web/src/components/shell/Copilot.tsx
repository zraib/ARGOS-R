"use client";

import { useState } from "react";
import { useArgos } from "@/lib/store";
import { differe, useDiffere } from "@/lib/differe";
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

const CORPS = differe(() => import("@/components/shell/CopilotBody").then((m) => m.default));

export function Copilot() {
  const copilotOpen = useArgos((s) => s.copilotOpen);
  const aiLog = useArgos((s) => s.aiLog);
  // Une fois ouvert, le corps reste monté : historique et état de saisie
  // survivent aux fermetures, exactement comme avant la coupe.
  const [warmed, setWarmed] = useState(false);
  if (copilotOpen && !warmed) setWarmed(true);
  // Le corps se charge à la première ouverture, sans Suspense (lib/differe) : le
  // tiroir paraît dès que son code est là — plus 300 ms de repli vide pendant
  // lesquels la FAB elle-même disparaissait (ADR 0038). Pas de préchargement :
  // le corps et l'assistant pèsent lourd, et beaucoup de sessions ne l'ouvrent pas.
  const CopilotBody = useDiffere(CORPS, false, warmed);

  const unread = Math.min(99, aiLog.filter((m) => m.role === "assistant").length);

  if (!warmed || !CopilotBody) return <CopilotFab unread={unread} />;
  return <CopilotBody />;
}
