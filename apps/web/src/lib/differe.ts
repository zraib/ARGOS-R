// ============================================================================
// lib/differe.ts — un composant dont le code se charge À PART, sans Suspense
//
// Une fenêtre qu'on ouvre d'un clic (assistant de déclaration, briefing) n'a
// pas à peser sur le chargement de chaque page : son code vit dans son propre
// fichier. Mais `React.lazy` + `<Suspense>` retient l'affichage d'un contenu
// suspendu jusqu'à 300 ms (React regroupe les révélations) — même quand le code
// est déjà là : mesuré, le briefing apparaissait 303 ms après le clic pour 3 ms
// de téléchargement (ADR 0038).
//
// Ici, le code se télécharge quand l'application est au repos, et le composant
// se rend dès qu'il est chargé : jamais de suspension, jamais de repli.
// ============================================================================

import { useEffect, useState } from "react";

/** Un module chargé une seule fois — la même promesse pour tous les demandeurs. */
export interface Differe<C> {
  obtenir: () => Promise<C>;
  /** Le composant s'il est déjà chargé, sinon `null`. */
  charge: () => C | null;
}

export function differe<C>(charger: () => Promise<C>): Differe<C> {
  let pret: C | null = null;
  let enCours: Promise<C> | null = null;
  return {
    obtenir: () => {
      if (pret) return Promise.resolve(pret);
      enCours ??= charger().then(
        (c) => (pret = c),
        (e: unknown) => {
          // Un échec (réseau) n'est pas définitif : la demande suivante retente.
          enCours = null;
          throw e;
        },
      );
      return enCours;
    },
    charge: () => pret,
  };
}

/**
 * Le composant de `d`, ou `null` tant qu'il n'est pas chargé. Son code se
 * télécharge au repos dès que `precharger` est vrai, et sur-le-champ quand il
 * est `demande` (ouvert avant la fin du préchargement).
 */
export function useDiffere<C>(d: Differe<C>, precharger: boolean, demande: boolean): C | null {
  const [composant, setComposant] = useState<C | null>(() => d.charge());
  useEffect(() => {
    if (composant || !(precharger || demande)) return;
    let actif = true;
    const recevoir = () => {
      d.obtenir().then(
        // Un composant est une fonction : passé tel quel, `setState` l'appellerait.
        (c) => actif && setComposant(() => c),
        () => {},
      );
    };
    if (demande) {
      recevoir();
      return () => {
        actif = false;
      };
    }
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(recevoir, { timeout: 8000 });
      return () => {
        actif = false;
        window.cancelIdleCallback(id);
      };
    }
    const id = window.setTimeout(recevoir, 4000);
    return () => {
      actif = false;
      window.clearTimeout(id);
    };
  }, [d, composant, precharger, demande]);
  return composant;
}
