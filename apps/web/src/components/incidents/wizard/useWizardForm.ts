"use client";

import { useCallback, useMemo, useState, type KeyboardEvent } from "react";
import { EMPTY_FORM, withPoint, type WizardForm } from "@/lib/incidents/wizard";

// ============================================================================
// L'état du formulaire de l'assistant — un seul objet, des gestes nommés.
//
// Les trente `useState` d'avant sont devenus une valeur et des transitions
// (`patch`, `update`, `setPoint`, `load`, `reset`) ; les étapes reçoivent les
// deux et ne connaissent pas le magasin.
// ============================================================================

export interface WizardActions {
  patch: (p: Partial<WizardForm>) => void;
  update: (fn: (f: WizardForm) => Partial<WizardForm>) => void;
  setPoint: (ll: [number, number]) => void;
  load: (f: WizardForm) => void;
  reset: () => void;
  toggleUnit: (id: string) => void;
  toggleHosp: (id: string) => void;
  addKeyword: () => void;
  removeKeyword: (index: number) => void;
  onKeywordKey: (e: KeyboardEvent<HTMLInputElement>) => void;
}

export function useWizardForm(): { form: WizardForm; actions: WizardActions } {
  const [form, setForm] = useState<WizardForm>(EMPTY_FORM);
  const patch = useCallback((p: Partial<WizardForm>) => setForm((f) => ({ ...f, ...p })), []);
  const update = useCallback((fn: (f: WizardForm) => Partial<WizardForm>) => setForm((f) => ({ ...f, ...fn(f) })), []);
  const setPoint = useCallback((ll: [number, number]) => setForm((f) => withPoint(f, ll)), []);
  const load = useCallback((f: WizardForm) => setForm(f), []);
  const reset = useCallback(() => setForm(EMPTY_FORM), []);

  const toggleIn = (key: "units" | "hospitals", id: string) =>
    update((f) => ({ [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id] }));
  const toggleUnit = useCallback((id: string) => toggleIn("units", id), [update]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleHosp = useCallback((id: string) => toggleIn("hospitals", id), [update]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Ajoute le mot-clé en cours de saisie (Entrée, virgule ou bouton). Un doublon est simplement effacé. */
  const addKeyword = useCallback(
    () =>
      update((f) => {
        const mot = f.keywordDraft.trim();
        if (!mot) return {};
        if (f.keywords.includes(mot)) return { keywordDraft: "" };
        return { keywords: [...f.keywords, mot], keywordDraft: "" };
      }),
    [update],
  );
  const removeKeyword = useCallback((index: number) => update((f) => ({ keywords: f.keywords.filter((_, i) => i !== index) })), [update]);
  const onKeywordKey = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === "," || e.key === ";") {
        e.preventDefault();
        addKeyword();
      } else if (e.key === "Backspace") {
        // Retour arrière sur un champ vide : on reprend le dernier mot-clé.
        update((f) => (!f.keywordDraft && f.keywords.length > 0 ? { keywords: f.keywords.slice(0, -1) } : {}));
      }
    },
    [addKeyword, update],
  );

  // Un objet STABLE : les effets de la coquille en dépendent, et un objet
  // recréé à chaque rendu les relancerait — l'étape retomberait à 1 à chaque
  // frappe. Toutes les fonctions ci-dessus sont mémorisées ; l'objet aussi.
  const actions = useMemo<WizardActions>(
    () => ({ patch, update, setPoint, load, reset, toggleUnit, toggleHosp, addKeyword, removeKeyword, onKeywordKey }),
    [patch, update, setPoint, load, reset, toggleUnit, toggleHosp, addKeyword, removeKeyword, onKeywordKey],
  );
  return { form, actions };
}
