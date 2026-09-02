// Façade publique du moteur de brouillon d'incident.
export type { DescriptionProposalInput, Proposal } from "./types";
export { extractToponymsFromTokens } from "./lexicon";
export { pickTitle, pickDesc } from "./proposal";
