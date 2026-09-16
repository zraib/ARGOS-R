// Façade publique du moteur de brouillon d'incident.
export type { DescriptionProposalInput, Proposal } from "./types";
export type { DraftLabels } from "./proposal";
export { extractToponymsFromTokens, getAllLexiconUnion, toponymsFromKeywords } from "./lexicon";
export { pickTitle, pickDesc, DEFAULT_DRAFT_LABELS, mergeDraftLabels } from "./proposal";
