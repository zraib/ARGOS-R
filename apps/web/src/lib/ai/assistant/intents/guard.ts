// ============================================================================
// ARGOS — assistant IA · Garde commune des intentions qui visent UN incident.
//
// Cinq intentions répétaient les mêmes huit lignes : lire un identifiant
// INC-xxxx, vérifier qu'il existe, sinon deviner la cible par le texte. Ici en
// un seul endroit, avec deux règles de fond : un identifiant absent du
// catalogue reçoit une réponse négative FACTUELLE (jamais un repli générique
// qui laisserait croire que l'incident existe), et les suggestions viennent du
// contexte, jamais d'un identifiant codé en dur.
// ============================================================================

import type { Incident } from "@/lib/types";
import { resolveTarget } from "../enrich";
import type { AiAnswer, AiContext, AiIntent, AiSuggestion } from "../types";

export type IncidentIdCheck =
  | { found: true; incident: Incident }
  | { found: false; id: string; invalid: true }
  | { found: false; id: null; invalid: false };

/** Lit un identifiant INC-xxxx dans la question et le confronte au catalogue. */
export function parseAndValidateIncidentId(q: string, incidents: Incident[]): IncidentIdCheck {
  const m = q.toUpperCase().match(/\b(INC-\d{3,6})\b/);
  if (!m) return { found: false, id: null, invalid: false };
  const hit = incidents.find((i) => i.id === m[1]);
  return hit ? { found: true, incident: hit } : { found: false, id: m[1], invalid: true };
}

/** Exemple d'identifiant tiré du contexte courant — jamais codé en dur. */
export function exampleIncidentId(ctx: AiContext): string {
  return ctx.incidents[0]?.id ?? "INC-0000";
}

/** Un identifiant absent du catalogue : on le dit, sans rien inventer. */
export function incidentNotFoundResponse(id: string, ctx: AiContext, intent: AiIntent): AiAnswer {
  const derniers = ctx.incidents.map((i) => i.id).sort().slice(-5);
  const dispo = derniers.length ? ` (derniers identifiants du catalogue : ${derniers.join(" · ")})` : "";
  return {
    intent,
    layer1: `incident ${id} introuvable dans le catalogue → réponse factuelle négative`,
    text: [
      `❌ Incident **${id}** absent du catalogue opérationnel IRIS à l'instant T. Cet identifiant n'existe pas dans la base des incidents en cours${dispo}.`,
      "Conseil : demande « liste des incidents en cours » ou ouvre une fiche depuis le tableau de bord pour lire son identifiant.",
    ].join("\n"),
    suggestions: ["Liste des incidents en cours", "Situation globale opérationnelle", "Dernier incident créé"],
    analytics: ctx.analytics ?? null,
  };
}

/**
 * Enveloppe des intentions à cible : identifiant invalide → réponse négative ;
 * cible trouvée (identifiant ou texte) → `handler` ; sinon `onNoTarget`, puis
 * une consigne de précision adaptée à l'intention.
 */
export function withValidIncident(
  q: string,
  ctx: AiContext,
  intent: AiIntent,
  handler: (inc: Incident) => AiAnswer,
  onNoTarget?: () => AiAnswer | null,
): AiAnswer {
  const incidents = ctx.incidents ?? [];
  const check = parseAndValidateIncidentId(q, incidents);
  if (!check.found && check.invalid) return incidentNotFoundResponse(check.id, ctx, intent);
  const target = check.found ? check.incident : resolveTarget(q, incidents);
  if (target) return handler(target);
  const r = onNoTarget?.();
  if (r) return r;
  const ex = exampleIncidentId(ctx);
  const hint =
    intent === "hospitals_nearest"
      ? `Précisez une zone (ex. Al Haouz, Ourika) ou un incident (ex. ${ex}) pour classer les hôpitaux par proximité.`
      : intent === "cross_analysis"
        ? "Précisez une zone ou un incident pour croiser : incidents × unités × hôpitaux × équipements × météo/séismes."
        : intent === "incident_details"
          ? `Aucun incident ne correspond. Précisez un identifiant (ex. ${ex}), une région (Al Haouz, Ourika…) ou un mot du titre.`
          : `Précisez une zone, un incident cible (ex. ${ex}) ou une région pour obtenir ce rapport.`;
  return { intent, layer1: `${intent} — cible non résolue`, text: hint, analytics: ctx.analytics ?? null };
}

/** Suggestions construites depuis l'incident visé. */
export function suggestionsForIncident(inc: Incident, extras: (AiSuggestion | string)[] = []): AiSuggestion[] {
  const base: AiSuggestion[] = [
    { label: `Dispositif pour ${inc.id}`, query: `Dispositif recommandé pour ${inc.id}`, priority: "primary" },
    { label: `Analyse croisée ${inc.id}`, query: `Analyse croisée ${inc.id}` },
    { label: `Bilan humain ${inc.id}`, query: `Bilan humain ${inc.id}` },
  ];
  return [...base, ...extras.map((e) => (typeof e === "string" ? { label: e, query: e } : e))];
}

/** Suggestions génériques : une principale optionnelle, puis des entrées nationales. */
export function suggestionsGeneric(opts: { national?: (AiSuggestion | string)[]; primary?: AiSuggestion | string } = {}): AiSuggestion[] {
  const out: AiSuggestion[] = [];
  if (opts.primary) out.push(typeof opts.primary === "string" ? { label: opts.primary, query: opts.primary, priority: "primary" } : opts.primary);
  for (const e of opts.national ?? []) out.push(typeof e === "string" ? { label: e, query: e } : e);
  return out;
}
