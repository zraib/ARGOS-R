// ============================================================================
// ARGOS — carte opérationnelle · rendu UNIFIÉ : un seul jeu de canvas planétaires
//
// Fonctions PURES extraites de `MapCanvas.tsx` (2 019 lignes) : aucun React, aucun
// MapLibre instancié — seulement des calculs, désormais testables isolément.
// Même code, déplacé. Voir le composant pour l'orchestration des couches.
// ============================================================================

import { wxMercY } from "./weather-raster";
import { WXG_B, WXG_COLS , WXG_LON0, WXG_DLON, WXG_DLAT, WXG_LAT0, WXG_ROWS} from "./weather-grid";

// --- rendu UNIFIÉ : un seul jeu de canvas planétaires ------------------------
// Un champ HOMOGÈNE sur toute la carte (fini le rectangle national visible) :
// chaque échantillon fond l'IDW de la grille dense nationale dans le bilinéaire
// mondial via natBlend — mêmes données modèle des deux côtés. Température et
// précipitations partagent une boucle de pixels redessinée au plus toutes les
// WXU_RASTER_MS ; le vent est UN SEUL système de particules planétaire.
export const WXU_W = 1080; // 3 px/°
export const WXU_H = Math.round((WXU_W * (wxMercY(WXG_B.maxLat) - wxMercY(WXG_B.minLat))) / (((WXG_B.maxLon - WXG_B.minLon) * Math.PI) / 180));
// Vent : particules en ESPACE ÉCRAN (façon Windy). Le canvas est superposé à
// la carte (PAS géoréférencé) : les traits font toujours ~1 px écran quel que
// soit le zoom (aucun flou d'agrandissement possible) et la densité est
// constante par surface d'écran. Chaque particule est dé-projetée (unproject)
// pour échantillonner le champ u/v géographique. Pendant un déplacement de la
// carte, le canvas est effacé (les positions écran perdent leur ancrage) et le
// champ se reforme en ~1 s.
export const WXS_MAX = 4000; // plafond de particules (l'effectif suit la surface d'écran)
export const WXS_PER_PX = 1 / 200; // particules par pixel CSS (densité écran constante, élevée)
export const WXU_RASTER_MS = 200; // redessin des rasters (~5 im/s : fluide pour 1 h/s)

// Les villes étiquetées viennent de lib/map/cities (niveau de détail par zoom).

/**
 * Échantillonnage bilinéaire du champ mondial : la grille est RÉGULIÈRE (10°),
 * les 4 voisins se déduisent des indices (pas de maillage IDW nécessaire).
 * Enroulement en longitude (170°E → 180° → 180°W continu).
 */
export function wxgSample(a: Float32Array, lon: number, lat: number): number {
  const fc = (lon - WXG_LON0) / WXG_DLON;
  let fr = (WXG_LAT0 - lat) / WXG_DLAT;
  if (fr < 0) fr = 0; else if (fr > WXG_ROWS - 1) fr = WXG_ROWS - 1;
  const c0 = Math.floor(fc), r0 = Math.min(WXG_ROWS - 1, Math.floor(fr));
  const tc = fc - c0, tr = fr - r0;
  const c0m = ((c0 % WXG_COLS) + WXG_COLS) % WXG_COLS;
  const c1m = (c0m + 1) % WXG_COLS;
  const r1 = Math.min(WXG_ROWS - 1, r0 + 1);
  const top = a[r0 * WXG_COLS + c0m] + (a[r0 * WXG_COLS + c1m] - a[r0 * WXG_COLS + c0m]) * tc;
  const bot = a[r1 * WXG_COLS + c0m] + (a[r1 * WXG_COLS + c1m] - a[r1 * WXG_COLS + c0m]) * tc;
  return top + (bot - top) * tr;
}

/** Composante u/v du vent d'un point de grille au pas s (mélange sans saut de cap). */
export function wxToUV(pt: { wind: number[]; windDir: number[] }, s: number, comp: "u" | "v"): number {
  const sp = pt.wind[s] ?? 0;
  const rad = (((pt.windDir[s] ?? 0) + 180) * Math.PI) / 180;
  return comp === "u" ? sp * Math.sin(rad) : sp * Math.cos(rad);
}

/** Carte opérationnelle MapLibre : marqueurs en direct, convois animés, bascule 2D/3D + fond. */
/**
 * Cadence d'interrogation du flux. Le palier public d'OpenSky publie un point
 * toutes les ~10 s ; sonder plus vite ne rapporterait rien et consommerait du
 * quota. Le mouvement affiché entre deux points vient de l'estime, pas du
 * réseau.
 */
export const ACFT_POLL_MS = 6_000;

/** Cadence de réaffichage de la position estimée (~4 images/s). */
export const ACFT_FRAME_MS = 250;

/** Au-delà, le dernier contact est trop ancien : le marqueur s'estompe. */
export const ACFT_STALE_S = 45;
