// ============================================================================
// lib/ai/copilot/blocks.ts — ce que la réponse porte en plus du texte
//
// LES BLOCS STRUCTURÉS (incidents, hôpitaux, unités, séismes, équipements,
// statistiques, analyse croisée) ne sont montés que si la Couche 1 a RECONNU
// l'intention. Sur une question incomprise (`unknown`), monter la vue globale
// sous une réponse du modèle afficherait trente lignes hors sujet avec
// l'autorité d'un tableau : on laisse alors le modèle seul.
// ============================================================================

import type { AiAnswer } from "@/lib/ai/assistant";

/** Les champs structurés d'un message du Copilot, tels que le journal les stocke. */
export interface StructuredBlocks {
  units?: AiAnswer["units"];
  incidents?: AiAnswer["incidents"];
  hospitals?: AiAnswer["hospitals"];
  quakes?: AiAnswer["quakes"];
  equipment?: AiAnswer["topEquip"];
  stats?: AiAnswer["stats"];
  cross?: AiAnswer["cross"];
}

/** Faut-il monter les blocs sous cette réponse ? Jamais sur une intention incomprise. */
export function shouldMountBlocks(answer: Pick<AiAnswer, "intent">): boolean {
  return answer.intent !== "unknown";
}

/** Les blocs de la réponse — ou aucun, si l'intention n'a pas été reconnue. */
export function structuredBlocks(answer: AiAnswer, mount = shouldMountBlocks(answer)): StructuredBlocks {
  if (!mount) return {};
  return {
    units: answer.units,
    incidents: answer.incidents,
    hospitals: answer.hospitals,
    quakes: answer.quakes,
    equipment: answer.topEquip,
    stats: answer.stats,
    cross: answer.cross,
  };
}

/**
 * Les intentions que la Couche 1 sert SEULE, sans passer par le modèle.
 *
 * Salutations et social : zéro délai, zéro risque de fuite d'invite sur des
 * données vides. Dispositif, potentiel mobilisable, équipements : la Couche 1
 * possède déjà l'état complet ; le modèle a tendance à le diluer ou à
 * répondre « donnée absente » — on rend le résultat structuré directement.
 */
export type Layer1Shortcut = "social" | "cross_analysis" | "mobilizable_potential" | "equipment";

export function layer1Shortcut(answer: Pick<AiAnswer, "intent">): Layer1Shortcut | null {
  switch (answer.intent) {
    case "greeting":
    case "social":
      return "social";
    case "cross_analysis":
      return "cross_analysis";
    case "mobilizable_potential":
      return "mobilizable_potential";
    case "equipment_search":
    case "equipment_critical_status":
      return "equipment";
    default:
      return null;
  }
}
