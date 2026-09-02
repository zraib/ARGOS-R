"use client";

import { useCallback, useState } from "react";
import { useDraftProposal } from "@/components/incidents/IncidentDraftAssist";
import type { DescriptionProposalInput } from "@/lib/ai/draft";
import { generateIncidentDraft, paraphraseIncidentDraft, type IncidentDraftResult } from "@/lib/ai/llmIncidentDraft";
import type { WizardForm } from "@/lib/incidents/wizard";

// ============================================================================
// Génération du titre et de la description par l'IA (étape 2).
//
// UNE SEULE méthode de génération, sur demande : des mots-clés → un bouton →
// titre + description, puis deux paraphrases séparées. Jamais d'application
// automatique : tant que rien n'a été généré, les champs restent masqués. Le
// `salt` change à chaque geste, ce qui rend « régénérer » reproductible.
// ============================================================================

export interface DraftGeneration {
  aiGenerated: boolean;
  aiBusy: boolean;
  aiBusyT: boolean;
  aiBusyD: boolean;
  /** Mode édition : le titre et la description existent déjà, on montre les champs. */
  markGenerated: (v: boolean) => void;
  reset: () => void;
  runAiGenerate: () => Promise<void>;
  regenTitle: () => Promise<void>;
  regenDesc: () => Promise<void>;
}

export function useDraftGeneration(
  input: DescriptionProposalInput,
  form: Pick<WizardForm, "type" | "keywords" | "title" | "desc">,
  patch: (p: Partial<WizardForm>) => void,
): DraftGeneration {
  const [aiGenerated, setAiGenerated] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiBusyT, setAiBusyT] = useState(false);
  const [aiBusyD, setAiBusyD] = useState(false);
  const [aiSalt, setAiSalt] = useState(1);

  const setTitle = useCallback((v: string) => patch({ title: v }), [patch]);
  const setDesc = useCallback((v: string) => patch({ desc: v }), [patch]);
  useDraftProposal(input, { currentTitle: form.title, currentDesc: form.desc, autoApplyIfEmpty: false, setTitle, setDesc });

  const applyDraft = useCallback(
    (r: IncidentDraftResult) => patch({ ...(r.title ? { title: r.title } : {}), ...(r.desc ? { desc: r.desc } : {}) }),
    [patch],
  );

  const runAiGenerate = async () => {
    if (!form.type || form.keywords.length === 0 || aiBusy) return;
    setAiBusy(true);
    setAiGenerated(false);
    try {
      const nextSalt = aiSalt + 1;
      setAiSalt(nextSalt);
      applyDraft(await generateIncidentDraft(form.keywords, input, { salt: nextSalt }));
      setAiGenerated(true);
    } finally {
      setAiBusy(false);
    }
  };

  const paraphrase = async (field: "title" | "desc", setBusy: (v: boolean) => void, busy: boolean) => {
    if (!aiGenerated || busy) return;
    setBusy(true);
    try {
      const nextSalt = aiSalt + 1;
      setAiSalt(nextSalt);
      applyDraft(
        await paraphraseIncidentDraft({ keywords: form.keywords, input, currentTitle: form.title, currentDesc: form.desc, field, salt: nextSalt }),
      );
    } finally {
      setBusy(false);
    }
  };

  return {
    aiGenerated,
    aiBusy,
    aiBusyT,
    aiBusyD,
    markGenerated: setAiGenerated,
    reset: () => {
      setAiGenerated(false);
      setAiBusy(false);
    },
    runAiGenerate,
    regenTitle: () => paraphrase("title", setAiBusyT, aiBusyT),
    regenDesc: () => paraphrase("desc", setAiBusyD, aiBusyD),
  };
}
