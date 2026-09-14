"use client";

import { useEffect, useRef, useState } from "react";

// ============================================================================
// Sortie animée d'une liste : un élément retiré reste rendu le temps de son
// animation de fin, marqué `leaving`, puis disparaît. Un élément qui revient
// avant la fin annule sa sortie. Les nouveaux venus prennent la place demandée ;
// ceux qui partent gardent la leur — une fenêtre ne saute pas pendant qu'elle
// se replie.
// ============================================================================

export interface ExitItem {
  id: string;
  leaving: boolean;
}

export function useExitList(ids: readonly string[], exitMs: number): ExitItem[] {
  const [rendered, setRendered] = useState<ExitItem[]>(() => ids.map((id) => ({ id, leaving: false })));
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // La liste demandée change d'identité à chaque rendu chez l'appelant ; on ne
  // réagit qu'à son CONTENU (les identifiants de canaux ne portent pas de « | »).
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const cle = ids.join("|");

  useEffect(() => {
    const voulus = idsRef.current;
    const ensemble = new Set(voulus);
    setRendered((prev) => {
      const next: ExitItem[] = voulus.map((id) => ({ id, leaving: false }));
      prev.forEach((r, i) => {
        if (ensemble.has(r.id)) return;
        next.splice(Math.min(i, next.length), 0, { id: r.id, leaving: true });
        if (!timers.current.has(r.id)) {
          timers.current.set(
            r.id,
            setTimeout(() => {
              timers.current.delete(r.id);
              setRendered((cur) => cur.filter((x) => x.id !== r.id));
            }, exitMs),
          );
        }
      });
      return next;
    });
    // Un retour annule la sortie en cours.
    for (const id of voulus) {
      const t = timers.current.get(id);
      if (t) {
        clearTimeout(t);
        timers.current.delete(id);
      }
    }
  }, [cle, exitMs]);

  useEffect(() => {
    const encours = timers.current;
    return () => {
      for (const t of encours.values()) clearTimeout(t);
    };
  }, []);

  return rendered;
}
