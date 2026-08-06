// ============================================================================
// ARGOS — contour approché du territoire national (Maroc, provinces du Sud
// incluses). Polygone [lng, lat] simplifié (~55 sommets) utilisé pour :
//   - découper les couches météo (température / vent / précipitations) au
//     territoire — rien au-delà des frontières ;
//   - classer un séisme « national » vs « mondial » (alertes différenciées).
// Précision volontairement modérée (usage visuel / classement, pas juridique).
// Une copie existe côté API (seismic-alerts.service.ts) — les deux bases de
// code sont indépendantes ; garder les deux contours synchronisés.
// ============================================================================

/** Contour national approché, sens horaire, [lng, lat]. */
export const MOROCCO_POLY: [number, number][] = [
  // Côte atlantique (du sud vers le nord)
  [-17.06, 20.77], [-16.2, 23.0], [-15.93, 23.72], [-15.2, 24.6],
  [-14.5, 26.13], [-13.4, 27.1], [-12.93, 27.94], [-11.4, 28.4],
  [-10.6, 28.99], [-10.18, 29.37], [-9.81, 30.05], [-9.6, 30.42],
  [-9.88, 30.63], [-9.77, 31.51], [-9.26, 32.3], [-8.5, 33.25],
  [-7.62, 33.6], [-6.84, 34.03], [-6.29, 34.88], [-6.15, 35.19],
  [-5.93, 35.79],
  // Détroit + côte méditerranéenne (de l'ouest vers l'est)
  [-5.56, 35.85], [-5.36, 35.89], [-5.28, 35.6], [-5.09, 35.45],
  [-4.67, 35.21], [-3.93, 35.25], [-2.96, 35.44], [-2.75, 35.12],
  [-2.22, 35.09],
  // Frontière algérienne (du nord vers le sud)
  [-1.79, 34.75], [-1.73, 34.5], [-1.67, 34.09], [-1.55, 33.4],
  [-1.3, 32.9], [-1.13, 32.42], [-1.23, 32.11], [-2.0, 31.85],
  [-2.93, 31.68], [-3.65, 31.1], [-4.6, 30.55], [-5.3, 30.1],
  [-6.5, 29.6], [-7.35, 29.4], [-8.2, 28.9], [-8.67, 28.7],
  [-8.67, 27.66],
  // Limites sahariennes (est puis sud, jusqu'à la côte)
  [-8.67, 26.0], [-12.0, 26.0], [-12.0, 23.45], [-13.0, 22.75],
  [-13.1, 21.33], [-16.96, 21.33],
];

/**
 * Test point-dans-polygone (lancer de rayon) sur le contour national.
 * Coordonnées géographiques [lng, lat] ; O(n) sur ~55 arêtes.
 */
export function pointInMorocco(lng: number, lat: number): boolean {
  let inside = false;
  const n = MOROCCO_POLY.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = MOROCCO_POLY[i];
    const [xj, yj] = MOROCCO_POLY[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
