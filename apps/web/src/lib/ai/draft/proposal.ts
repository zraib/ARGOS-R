// ============================================================================
// lib/ai/draft/proposal.ts — choix d'un titre et d'une description
//
// Le `salt` rend la proposition reproductible : même saisie, même salt, même
// texte — la régénération change le salt, pas la règle.
// Logique PURE, sans React : extraite de IncidentDraftAssist.tsx pour être
// testée seule et réutilisée par le brouillon LLM (lib/ai/llmIncidentDraft.ts)
// sans qu'une bibliothèque n'importe plus un composant.
// ============================================================================

import { buildSemanticDescription , buildSemanticTitle} from "./semantic";
import { buildDesc , inject, keywordTokens, labelOf, lieuOf, rngSeed} from "./lexicon";
import { DescPair } from "./types";
import { DESC_POOL , DESC_POOL_GEN, TITLE_POOL, TITLE_POOL_GEN} from "./pools";
import type { DescriptionProposalInput } from "./types";

export function pickTitle(input: DescriptionProposalInput, salt: number): string {
  if (!input.type) return "";
  const label = labelOf(input);
  const lieu = lieuOf(input);
  const tokens = keywordTokens(input.keywords);
  const titles = TITLE_POOL[input.type] ?? TITLE_POOL_GEN;
  const tpl = titles[rngSeed(salt * 131 + titles.length * 17 + 7, titles.length)] ?? TITLE_POOL_GEN[0];
  const injected = inject(tpl as string, label, lieu).replace(/\s+/g, " ").trim();
  if (tokens.length === 0) return injected;
  return buildSemanticTitle(tokens, input.type, injected, lieu, input.incidentTypes, salt);
}

/** Pick DESCRIPTION — si keywords présents, construit via buildSemanticDescription. */
export function pickDesc(input: DescriptionProposalInput, salt: number): string {
  if (!input.type) return "";
  const label = labelOf(input);
  const lieu = lieuOf(input);
  const lieuDet = lieu ? ` au niveau de ${lieu}` : "";
  const tokens = keywordTokens(input.keywords);
  const descs = DESC_POOL[input.type] ?? DESC_POOL_GEN;
  const dTpl: DescPair = (descs[rngSeed(salt * 271 + descs.length * 53 + 11, descs.length)] as DescPair) ?? DESC_POOL_GEN[0];
  const base = buildDesc(dTpl, label, lieu);
  if (tokens.length === 0) return base;
  return buildSemanticDescription(tokens, input.type, dTpl.l1, dTpl.l2, lieuDet, input.incidentTypes, salt);
}

/* ====================== HOOK PRINCIPAL : 2 COMPTEURS / 2 SETTERS SÉPARÉS ====================== */
