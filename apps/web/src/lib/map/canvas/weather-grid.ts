// ============================================================================
// ARGOS — carte opérationnelle · grille MONDIALE régulière (10°, 36×14, 70°N → 60°S)
//
// Fonctions PURES extraites de `MapCanvas.tsx` (2 019 lignes) : aucun React, aucun
// MapLibre instancié — seulement des calculs, désormais testables isolément.
// Même code, déplacé. Voir le composant pour l'orchestration des couches.
// ============================================================================

// --- grille MONDIALE régulière (10°, 36×14, 70°N → 60°S) ---------------------
export const WXG_B = { minLat: -60, maxLat: 70, minLon: -180, maxLon: 180 };
export const WXG_COLS = 36, WXG_ROWS = 14, WXG_DLAT = 10, WXG_DLON = 10, WXG_LAT0 = 70, WXG_LON0 = -180;
