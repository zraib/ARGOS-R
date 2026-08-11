// ============================================================================
// ARGOS — règles du parcours d'identification des victimes (DVI)
//
// Fichier PUR : aucune dépendance à NestJS, à la persistance ou au HTTP. Les
// invariants d'un registre mortuaire sont trop sensibles pour être noyés dans
// un service — on les isole ici pour qu'ils soient lisibles et testables seuls.
// Même esprit que le module `orders` (voir docs/02-solid-hexagonal.md), sans
// aller jusqu'à une tranche hexagonale complète pour une seule entité.
// ============================================================================

import type { DviStatus, MortuaryRecord } from "@/modules/domain/domain.service";

/**
 * Politique de transition. Table de données plutôt que cascade de `if` :
 * faire évoluer le parcours se fait ici, sans toucher au service.
 *
 * Un corps peut être identifié directement depuis « non identifié »
 * (reconnaissance formelle immédiate) sans passer par « en cours ».
 * « Restitué » est TERMINAL : un dossier clos ne se rouvre pas.
 */
const ALLOWED: Readonly<Record<DviStatus, readonly DviStatus[]>> = {
  unidentified: ["in_progress", "identified"],
  in_progress: ["identified", "unidentified"],
  identified: ["released", "in_progress"],
  released: [],
};

/** Message d'erreur métier, ou `null` si la mutation est recevable. */
export function checkRecordUpdate(
  current: MortuaryRecord,
  patch: Partial<Omit<MortuaryRecord, "id" | "mid" | "admittedAt" | "updatedAt">>,
): string | null {
  // Dossier clos : plus aucune modification.
  if (current.status === "released") {
    return `Dossier ${current.reference} clos (corps restitué) : il n'est plus modifiable.`;
  }

  const next = patch.status ?? current.status;

  if (patch.status !== undefined && patch.status !== current.status && !ALLOWED[current.status].includes(patch.status)) {
    return `Transition interdite : « ${current.status} » → « ${patch.status} ».`;
  }

  // Une identité confirmée est exigée dès le statut « identifié ».
  const identity = patch.identifiedAs ?? current.identifiedAs;
  if ((next === "identified" || next === "released") && !identity?.trim()) {
    return "Passage à « identifié » impossible : l'identité confirmée est obligatoire.";
  }

  // La restitution exige de tracer à qui le corps a été remis.
  const releasedTo = patch.releasedTo ?? current.releasedTo;
  if (next === "released" && !releasedTo?.trim()) {
    return "Restitution impossible : indiquez à qui le corps est remis.";
  }

  return null;
}

/** États atteignables depuis l'état courant (utile à l'IHM). */
export function nextStatuses(current: DviStatus): readonly DviStatus[] {
  return ALLOWED[current];
}
