// Surface publique de l'assistant — inchangée par la découpe : `@/lib/ai/assistant`
// continue de fournir exactement les mêmes symboles.

export type { AiIntent, AiUnitResult, AiIncidentRow, AiHospitalRow, AiTopEquip, AiAnswerStatsItem, AiAnswerStats, AiCrossUnitRec, AiCrossUnitEquip, AiCrossBlock, AiSuggestion, AiAnswer, AiContext, EnrichedQuery } from "./types";
export { enrichFromHistory } from "./enrich";
export { interpret } from "./router";
export { buildLlmUserMessage } from "./prompt";
