/**
 * IncidentDraftAssist.tsx — PROPOSITIONS INDÉPENDANTES TITRE / DESCRIPTION.
 *
 * Ce fichier ne garde que la partie REACT (le hook et les boutons) ; le moteur
 * sémantique vit dans `lib/ai/draft/` et se teste sans navigateur.
 *
 * MOTEUR SÉMANTIQUE :
 *   - PLUS de recopie 1 phrase par keyword
 *   - GROUPES de mots reliés : « Bâtiments »+« Endommagés » → « bâtiments endommagés »
 *     « Risque »+« D'effondrement » → « risque d'effondrement »
 *     « Magnitude »+« Épicentre » → caractéristiques sismiques
 *   - DÉDUCTION TYPE INCIDENT si explicite keywords (ex: magnitude+epicentre → SÉISME)
 *   - TITRE = [type incident détecté] — [groupe critique MAX priority]
 *   - DESCRIPTION = 2-3 phrases COHÉRENTES du contexte global, PAS 1/keyword
 *   - JAMAIS d'invention valeur precise : pas magnitude 6.2, pas ville « Casablanca », pas 3 victimes
 */

import { Proposal } from "@/lib/ai/draft/types";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { pickDesc, pickTitle, type DescriptionProposalInput } from "@/lib/ai/draft";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* =========================== TYPES =========================== */

export function useDraftProposal(
  input: DescriptionProposalInput,
  opts?: {
    currentTitle: string;
    currentDesc: string;
    autoApplyIfEmpty?: boolean;
    setTitle: (t: string) => void;
    setDesc: (d: string) => void;
  },
) {
  const [regenT, setRegenT] = useState(1);
  const [regenD, setRegenD] = useState(1);
  const prevSaltT = useRef(0);
  const prevSaltD = useRef(0);
  const firstInitDone = useRef(false);

  const titleProposal = useMemo(() => pickTitle(input, regenT), [
    input.type, input.adresse, input.province, input.ville, input.pt,
    input.lang, input.incidentTypes, regenT,
  ]);
  const descProposal = useMemo(() => pickDesc(input, regenD), [
    input.type, input.adresse, input.province, input.ville, input.pt,
    input.lang, input.incidentTypes, regenD,
  ]);

  const proposal: Proposal = { title: titleProposal, desc: descProposal };
  const titleUsed = Boolean(opts && opts.currentTitle.trim() === titleProposal.trim() && titleProposal);
  const descUsed = Boolean(opts && opts.currentDesc.trim() === descProposal.trim() && descProposal);

  useEffect(() => {
    if (!opts || !input.type) return;
    if (regenT !== prevSaltT.current) {
      if (regenT > 1) {
        if (titleProposal) opts.setTitle(titleProposal);
      } else if (opts.autoApplyIfEmpty && !firstInitDone.current && !opts.currentTitle.trim()) {
        if (titleProposal) opts.setTitle(titleProposal);
      }
      prevSaltT.current = regenT;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regenT, input.type]);

  useEffect(() => {
    if (!opts || !input.type) return;
    if (regenD !== prevSaltD.current) {
      if (regenD > 1) {
        if (descProposal) opts.setDesc(descProposal);
      } else if (opts.autoApplyIfEmpty && !firstInitDone.current && !opts.currentDesc.trim()) {
        if (descProposal) opts.setDesc(descProposal);
      }
      prevSaltD.current = regenD;
    }
    firstInitDone.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regenD, input.type]);

  const regenFreshT = useCallback(() => setRegenT((x) => x + 1), []);
  const regenFreshD = useCallback(() => setRegenD((x) => x + 1), []);
  const applyTitle = useCallback(() => { if (titleProposal && opts) opts.setTitle(titleProposal); }, [titleProposal, opts]);
  const applyDesc = useCallback(() => { if (descProposal && opts) opts.setDesc(descProposal); }, [descProposal, opts]);

  return {
    proposal, regenFreshT, regenFreshD, applyTitle, applyDesc,
    regenFresh: regenFreshT, titleUsed, descUsed,
  };
}

/* ====================== COMPOSANTS BOUTONS INTÉGRÉS DANS LES CHAMPS ====================== */
const BTN_BASE = "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors";

function AssistButtons(props: {
  label: string; onApply: () => void; onRegen: () => void; applied: boolean; disabled?: boolean;
}): ReactNode {
  const { label, onApply, onRegen, applied, disabled } = props;
  return (
    <div className="flex shrink-0 items-center gap-1" aria-label={`Assistant IA · ${label}`}>
      <button
        type="button" onClick={onApply} disabled={disabled || applied}
        title={applied ? `Proposition ${label} déjà appliquée` : `Appliquer la proposition IA · ${label}`}
        className={cn(BTN_BASE, applied
          ? "border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-400"
          : "border-or-500/25 bg-or-500/8 text-or-700 hover:bg-or-500/16 dark:text-or-300",
          disabled ? "cursor-not-allowed opacity-40" : "")}
      >
        <Icon path={applied ? UI_ICONS.check : UI_ICONS.sparkles} className="h-3.5 w-3.5" />
      </button>
      <button
        type="button" onClick={onRegen} disabled={disabled}
        title={`Régénérer la proposition IA · ${label} — uniquement ${label.toLowerCase()}`}
        className={cn(BTN_BASE, "border-gray-300/80 bg-white/90 text-gray-700 hover:bg-gray-100 dark:border-white/10 dark:bg-white/[0.06] dark:text-rdia-200 dark:hover:bg-white/[0.12]", disabled ? "cursor-not-allowed opacity-40" : "")}
      >
        <Icon path={UI_ICONS.refresh} className="h-3 w-3" />
      </button>
    </div>
  );
}

export function TitleAssistButtons(props: { onApply: () => void; onRegen: () => void; applied: boolean; disabled?: boolean; }): ReactNode {
  return <AssistButtons label="Titre" {...props} />;
}
export function DescAssistButtons(props: { onApply: () => void; onRegen: () => void; applied: boolean; disabled?: boolean; }): ReactNode {
  return <AssistButtons label="Description" {...props} />;
}

/* ====================== RETRO-COMPAT (ancien composant → affiche RIEN) ====================== */
