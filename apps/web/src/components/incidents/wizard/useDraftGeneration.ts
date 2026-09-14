"use client";

import { useCallback, useState } from "react";
import { useDraftProposal } from "@/components/incidents/IncidentDraftAssist";
import type { DescriptionProposalInput } from "@/lib/ai/draft";
import { generateIncidentDraft, paraphraseIncidentDraft, type IncidentDraftResult } from "@/lib/ai/llmIncidentDraft";
import { resolveProvider } from "@/lib/ai/config";
import { useArgos } from "@/lib/store";
import type { WizardForm } from "@/lib/incidents/wizard";

// ============================================================================
// Génération du titre et de la description par l'IA (dernière étape : 4).
//
// MÉCANISME NOUVEAU (depuis réorganisation) :
//   - Déclenchée AUTOMATIQUEMENT quand l'utilisateur arrive à l'étape 4
//     (useEffect dans IncidentWizard), plus besoin d'un bouton initial.
//   - Si keywords présents : appelle generateIncidentDraft (moteur IA + fallback).
//   - Si keywords VIDE : appelle TOUT DE MÊME, le fallback sémantique
//     (pickTitle / pickDesc) fournira un titre correct « type + localisation »
//     car les champs ville/province/type existent dans DescriptionProposalInput.
//   - Boutons « Régénérer » et « Paraphraser titre/desc » gardés pour édition manuelle.
//   - Champs titre et description restent 100% éditables par l'utilisateur après IA.
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
  // Le modèle est celui des Paramètres — le même que le copilote.
  const aiSettings = useArgos((s) => s.aiSettings);
  const provider = resolveProvider(aiSettings);
  // L'OPÉRATEUR PASSE DEVANT. Le runtime sert une requête à la fois, et les
  // analyses de fond (prédictions de risque, conscience situationnelle)
  // repartent à chaque chargement du domaine : mesuré ici, un brouillon de
  // 2 s attendait 60 s derrière elles. On les interrompt le temps de servir
  // l'opérateur, comme le fait le copilote ; elles reprennent ensuite.
  const setOperatorBusy = useArgos((s) => s.setAiOperatorBusy);

  const setTitle = useCallback((v: string) => patch({ title: v }), [patch]);
  const setDesc = useCallback((v: string) => patch({ desc: v }), [patch]);
  useDraftProposal(input, { currentTitle: form.title, currentDesc: form.desc, autoApplyIfEmpty: false, setTitle, setDesc });

  const applyDraft = useCallback(
    (r: IncidentDraftResult) => patch({ ...(r.title ? { title: r.title } : {}), ...(r.desc ? { desc: r.desc } : {}) }),
    [patch],
  );

  const runAiGenerate = async () => {
    if (!form.type || aiBusy) return;
    setAiBusy(true);
    setAiGenerated(false);
    setOperatorBusy(true);
    try {
      const nextSalt = aiSalt + 1;
      setAiSalt(nextSalt);
      applyDraft(await generateIncidentDraft(form.keywords, input, { salt: nextSalt, provider }));
      setAiGenerated(true);
    } finally {
      setOperatorBusy(false);
      setAiBusy(false);
    }
  };

  const paraphrase = async (field: "title" | "desc", setBusy: (v: boolean) => void, busy: boolean) => {
    if (!aiGenerated || busy) return;
    setBusy(true);
    setOperatorBusy(true);
    try {
      const nextSalt = aiSalt + 1;
      setAiSalt(nextSalt);
      applyDraft(
        await paraphraseIncidentDraft({ keywords: form.keywords, input, currentTitle: form.title, currentDesc: form.desc, field, salt: nextSalt, provider }),
      );
    } finally {
      setOperatorBusy(false);
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
