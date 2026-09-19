// ============================================================================
// ARGOS — graduations d'un axe de graphique
//
// Les valeurs du tableau de bord sont réelles depuis l'ADR 0020, donc souvent
// petites (0, 1, 2 incidents). Arrondir « max × 0,25 / 0,5 / 0,75 / 1 » donne
// alors des doublons (max = 1 → 0, 1, 1, 1) : des lignes superposées et,
// côté React, des clés en double. On ne garde que des graduations distinctes,
// strictement positives — la ligne de base n'a pas besoin d'étiquette.
// ============================================================================

/** Graduations distinctes et croissantes d'un axe dont le maximum est `max` (≥ 1). */
export function axisTicks(max: number, fractions: readonly number[] = [0.25, 0.5, 0.75, 1]): number[] {
  const top = Math.max(1, max);
  return [...new Set(fractions.map((f) => Math.round(top * f)))].filter((v) => v > 0).sort((a, b) => a - b);
}
