// ============================================================================
// ARGOS — grades militaires, du plus bas au plus élevé
// Liste fermée : le grade est choisi dans une liste déroulante à la création /
// modification d'un compte (plus de saisie libre → annuaire homogène).
// ============================================================================

export const GRADES = [
  "Caporal",
  "Caporal-chef",
  "Sergent",
  "Sergent-chef",
  "Sergent-major",
  "Adjudant",
  "Adjudant-chef",
  "Sous-Lieutenant",
  "Lieutenant",
  "Capitaine",
  "Commandant",
  "Lieutenant-Colonel",
  "Colonel",
  "Colonel-Major",
  "Général de Brigade",
  "Général de Division",
  "Général de Corps d'Armée",
] as const;

export type Grade = (typeof GRADES)[number];
