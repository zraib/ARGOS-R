// Style commun des surcouches posées sur la carte. Neutre (ardoise très
// sombre) et non teinté vert : sur de l'imagerie satellite, le vert du thème
// se confondait avec le terrain et rendait les panneaux peu lisibles.
export const OVERLAY_STYLE = {
  background: "rgba(11,15,20,0.92)",
  backdropFilter: "blur(8px)",
  border: "1px solid rgba(255,255,255,0.14)",
} as const;

/** Interrupteur éteint : gris neutre (l'état allumé garde l'or de la charte). */
export const SWITCH_OFF = "bg-white/25";
