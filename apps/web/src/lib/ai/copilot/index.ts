// Façade de l'orchestration du Copilot : historique, blocs, tour de parole.
export { buildLlmHistory, purgeLog, MAX_TURNS, type LlmMessage, type LogEntryLike } from "./history";
export { structuredBlocks, shouldMountBlocks, layer1Shortcut, type StructuredBlocks, type Layer1Shortcut } from "./blocks";
export { runLlmTurn, llmTimeoutMs, measureLabel, RENDU_MS, type TurnOutcome, type TurnOptions } from "./turn";
