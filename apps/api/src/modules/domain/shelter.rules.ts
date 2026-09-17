// ============================================================================
// ARGOS — typologie d'un abri et règle de capacité
//
// Un abri est soit un CAMP DE TENTES, soit un BÂTIMENT EN DUR. La distinction
// n'est pas cosmétique : elle change ce qu'on demande à l'ouverture et ce
// qu'on peut promettre.
//
//  • Tentes : la capacité n'est pas saisie, elle est DÉDUITE — nombre de
//    tentes × personnes par tente. Saisir une capacité à côté du nombre de
//    tentes ouvre la porte à deux chiffres qui se contredisent au premier
//    ravitaillement. Le standard Sphère donne 3,5 m² de surface couverte par
//    personne : une tente familiale de 16 à 23 m² héberge 4 à 6 personnes,
//    d'où la valeur proposée par défaut (6), modifiable selon le modèle reçu.
//  • En dur : la capacité est saisie, et la NATURE du bâtiment est dite —
//    abri dédié, école, collège, lycée ou autre établissement. Un lycée
//    réquisitionné n'est pas un abri dédié : il faudra le rendre à la
//    rentrée, et sa capacité dépend de salles qu'on n'a pas conçues pour ça.
//
// Ce module est PUR (aucune dépendance Nest) : la règle est testable seule et
// le web peut en reprendre la lecture pour afficher la capacité déduite.
// ============================================================================

export const SHELTER_KINDS = ["tentes", "dur"] as const;
export type ShelterKind = (typeof SHELTER_KINDS)[number];

export const SHELTER_BUILDINGS = ["dedie", "ecole", "college", "lycee", "autre"] as const;
export type ShelterBuilding = (typeof SHELTER_BUILDINGS)[number];

/**
 * Organe d'origine d'un abri (ADR 0019) : qui l'ouvre et le tient — la
 * Protection civile, les FAR, les Forces Auxiliaires, la commune, le
 * Croissant-Rouge, l'Entraide nationale, l'Éducation nationale (écoles et
 * lycées mis à disposition), la Santé, ou un autre organisme. Se lit sur la
 * tuile de l'abri, à côté de sa commune, comme le corps d'une unité.
 */
export const SHELTER_ORGANS = ["dgpc", "far", "fa", "commune", "croissant_rouge", "entraide", "education", "sante", "autre"] as const;
export type ShelterOrgan = (typeof SHELTER_ORGANS)[number];

/** Personnes par tente proposées par défaut (Sphère : 3,5 m² couverts par personne, tente familiale 16–23 m²). */
export const DEFAULT_PER_TENT = 6;

export interface ShelterTypologyInput {
  kind: ShelterKind;
  building?: ShelterBuilding;
  tents?: number;
  perTent?: number;
  capacity?: number;
}

export type ShelterTypology =
  | { kind: "tentes"; tents: number; perTent: number; capacity: number; building?: undefined }
  | { kind: "dur"; building: ShelterBuilding; capacity: number; tents?: undefined; perTent?: undefined };

/**
 * Résout la typologie et la capacité, ou dit POURQUOI elle ne tient pas.
 * Rend une raison en français prête à remonter à l'écran.
 */
export function resolveShelterTypology(input: ShelterTypologyInput): { ok: true; value: ShelterTypology } | { ok: false; reason: string } {
  if (input.kind === "tentes") {
    const tents = input.tents ?? 0;
    const perTent = input.perTent ?? DEFAULT_PER_TENT;
    if (!Number.isInteger(tents) || tents < 1) return { ok: false, reason: "Un camp de tentes exige un nombre de tentes (au moins une)." };
    if (!Number.isInteger(perTent) || perTent < 1) return { ok: false, reason: "La capacité par tente doit être d'au moins une personne." };
    return { ok: true, value: { kind: "tentes", tents, perTent, capacity: tents * perTent } };
  }
  if (input.kind === "dur") {
    if (!input.building) return { ok: false, reason: "Un abri en dur exige la nature du bâtiment (dédié, école, collège, lycée, autre)." };
    const capacity = input.capacity ?? 0;
    if (!Number.isInteger(capacity) || capacity < 1) return { ok: false, reason: "Un abri en dur exige une capacité d'accueil (au moins une personne)." };
    return { ok: true, value: { kind: "dur", building: input.building, capacity } };
  }
  return { ok: false, reason: "Type d'abri inconnu : tentes ou en dur." };
}
