"use client";

import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  EMPTY_FORM,
  choosePlace,
  clearLocation,
  placePoint,
  typeAddress,
  typeCoords,
  type GeoRef,
  type PlaceChoice,
  type WizardForm,
} from "@/lib/incidents/wizard";

// ============================================================================
// L'état du formulaire de l'assistant — un seul objet, des gestes nommés.
//
// Les trente `useState` d'avant sont devenus une valeur et des transitions
// (`patch`, `update`, `setPoint`, `load`, `reset`) ; les étapes reçoivent les
// deux et ne connaissent pas le magasin. Les gestes de localisation passent
// tous par `lib/incidents/wizard` : c'est là que se décide qui, du lieu choisi,
// des coordonnées ou du point posé, tient la vérité.
// ============================================================================

export interface WizardActions {
  patch: (p: Partial<WizardForm>) => void;
  update: (fn: (f: WizardForm) => Partial<WizardForm>) => void;
  /** Un point posé (carte, géolocalisation) : tout en découle, rien n'est verrouillé. */
  setPoint: (ll: [number, number]) => void;
  /** L'adresse libre ; un nom de lieu reconnu pose le point si rien d'explicite ne le tient. */
  setAddress: (v: string) => void;
  /** Un lieu choisi dans la cascade région → province → ville. */
  choosePlace: (v: PlaceChoice) => void;
  /** Une coordonnée saisie. */
  typeCoords: (typed: { lat?: string; lng?: string }) => void;
  clearLocation: () => void;
  load: (f: WizardForm) => void;
  reset: () => void;
  toggleUnit: (id: string) => void;
  toggleHosp: (id: string) => void;
  toggleMorgue: (id: string) => void;
  addKeyword: () => void;
  removeKeyword: (index: number) => void;
  onKeywordKey: (e: KeyboardEvent<HTMLInputElement>) => void;
}

export function useWizardForm(geo: GeoRef): { form: WizardForm; actions: WizardActions } {
  const [form, setForm] = useState<WizardForm>(EMPTY_FORM);
  // Le référentiel se lit au moment du geste, à travers une référence : les
  // actions restent stables même quand le magasin recharge ses listes.
  const geoRef = useRef(geo);
  geoRef.current = geo;
  const patch = useCallback((p: Partial<WizardForm>) => setForm((f) => ({ ...f, ...p })), []);
  const update = useCallback((fn: (f: WizardForm) => Partial<WizardForm>) => setForm((f) => ({ ...f, ...fn(f) })), []);
  const setPoint = useCallback((ll: [number, number]) => setForm((f) => placePoint(f, ll, geoRef.current)), []);
  const setAddress = useCallback((v: string) => setForm((f) => typeAddress(f, v, geoRef.current)), []);
  const choose = useCallback((v: PlaceChoice) => setForm((f) => choosePlace(f, v, geoRef.current)), []);
  const coords = useCallback((typed: { lat?: string; lng?: string }) => setForm((f) => typeCoords(f, typed, geoRef.current)), []);
  const clearLoc = useCallback(() => setForm((f) => clearLocation(f)), []);
  const load = useCallback((f: WizardForm) => setForm(f), []);
  const reset = useCallback(() => setForm(EMPTY_FORM), []);

  const toggleIn = (key: "units" | "hospitals" | "morgues", id: string) =>
    update((f) => ({ [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id] }));
  const toggleUnit = useCallback((id: string) => toggleIn("units", id), [update]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleHosp = useCallback((id: string) => toggleIn("hospitals", id), [update]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleMorgue = useCallback((id: string) => toggleIn("morgues", id), [update]); // eslint-disable-line react-hooks/exhaustive-deps

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
    () => ({
      patch,
      update,
      setPoint,
      setAddress,
      choosePlace: choose,
      typeCoords: coords,
      clearLocation: clearLoc,
      load,
      reset,
      toggleUnit,
      toggleHosp,
      toggleMorgue,
      addKeyword,
      removeKeyword,
      onKeywordKey,
    }),
    [patch, update, setPoint, setAddress, choose, coords, clearLoc, load, reset, toggleUnit, toggleHosp, toggleMorgue, addKeyword, removeKeyword, onKeywordKey],
  );
  return { form, actions };
}
