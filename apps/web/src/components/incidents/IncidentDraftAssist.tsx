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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pickDesc, pickTitle, type DescriptionProposalInput } from "@/lib/ai/draft";

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
  // Les réglages (setters + valeurs courantes) sont lus par RÉFÉRENCE : l'objet
  // `opts` est recréé à chaque rendu du parent, et le mettre en dépendance
  // rejouait les effets à chaque frappe — jusqu'à faire perdre le focus aux
  // champs situés plus bas (mots-clés de l'assistant de déclaration).
  const optsRef = useRef(opts);
  useEffect(() => { optsRef.current = opts; }, [opts]);
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
    const o = optsRef.current;
    if (!o || !input.type) return;
    if (regenT !== prevSaltT.current) {
      if (regenT > 1) {
        if (titleProposal) o.setTitle(titleProposal);
      } else if (o.autoApplyIfEmpty && !firstInitDone.current && !o.currentTitle.trim()) {
        if (titleProposal) o.setTitle(titleProposal);
      }
      prevSaltT.current = regenT;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regenT, input.type]);

  useEffect(() => {
    const o = optsRef.current;
    if (!o || !input.type) return;
    if (regenD !== prevSaltD.current) {
      if (regenD > 1) {
        if (descProposal) o.setDesc(descProposal);
      } else if (o.autoApplyIfEmpty && !firstInitDone.current && !o.currentDesc.trim()) {
        if (descProposal) o.setDesc(descProposal);
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

/* ====================== RETRO-COMPAT (ancien composant → affiche RIEN) ====================== */
