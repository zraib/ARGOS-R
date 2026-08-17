"use client";

import { Suspense, lazy, useEffect, useState } from "react";
import { useArgos } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";

// ============================================================================
// ARGOS — coquille du Copilot : la FAB seule, le corps à la demande
//
// AppFrame monte ce composant sur CHAQUE écran. Avant cette coupe, il tirait
// statiquement le tiroir complet et lib/ai/assistant.ts (~3 800 lignes à eux
// deux) dans le graphe initial de toutes les routes — pour une modale fermée
// par défaut. La coquille ne garde que le bouton flottant ; le corps arrive au
// premier ⌘K et RESTE monté ensuite (l'historique survit aux fermetures).
//
// La FAB ci-dessous est la réplique exacte de celle du corps (CopilotBody
// l'affiche quand le tiroir est fermé) : si l'une change, changer l'autre.
// ============================================================================

const CopilotBody = lazy(() => import("@/components/shell/CopilotBody"));

/** Bouton flottant d'ouverture — réplique de la FAB du corps. */
function Fab({ unread }: { unread: number }) {
  return (
    <button
      aria-label="Ouvrir le Copilot ARGOS (⌘K)"
      title="Ouvrir le Copilot ARGOS (⌘K)"
      onClick={() => useArgos.getState().openCopilot()}
      className="group fixed bottom-4 end-4 z-50 sm:bottom-6 sm:end-6"
    >
      <span className="absolute -inset-1 rounded-full bg-gradient-to-tr from-or-500 via-rdia-500 to-red-500 blur opacity-40 group-hover:opacity-70 transition-opacity duration-300" />
      <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr from-or-500 to-rdia-500 text-white shadow-2xl shadow-or-500/40 ring-4 ring-white dark:ring-rdia-800 transition-transform duration-200 group-hover:scale-110 active:scale-95">
        <Icon path={UI_ICONS.copilot} size={24} strokeWidth={2} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-white bg-red-500 px-1 text-[10px] font-bold text-white dark:border-rdia-800">
            {unread}
          </span>
        )}
      </span>
      {/* Bulle d'aide : masquée sous sm — au doigt il n'y a pas de survol,
          et elle débordait de l'écran à 375 px. */}
      <span className="absolute end-full top-1/2 me-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-rdia-800 px-2.5 py-1 text-[11px] font-semibold text-white opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100 sm:block dark:bg-rdia-700">
        Copilot · ⌘K
      </span>
    </button>
  );
}

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

  if (!warmed) return <Fab unread={unread} />;
  // Pendant le chargement du corps (première ouverture uniquement, ~un battement
  // en local), rien n'est rendu : la FAB vient d'être pressée, le tiroir suit.
  return (
    <Suspense fallback={null}>
      <CopilotBody />
    </Suspense>
  );
}
