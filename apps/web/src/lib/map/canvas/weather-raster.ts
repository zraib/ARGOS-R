// ============================================================================
// ARGOS — carte opérationnelle · carte météo : RASTER interpolé (style carte météo pro) + animation
//
// Fonctions PURES extraites de `MapCanvas.tsx` (2 019 lignes) : aucun React, aucun
// MapLibre instancié — seulement des calculs, désormais testables isolément.
// Même code, déplacé. Voir le composant pour l'orchestration des couches.
// ============================================================================

// --- carte météo : RASTER interpolé (style carte météo pro) + animation ------
// La température est interpolée (IDW) depuis la grille API vers une vraie image
// (source canvas MapLibre) → champ CONTINU comme une carte météo NWS, avec les
// valeurs numériques posées par-dessus et une animation sur les 24 h de
// prévision. Aucune tuile météo externe : uniquement notre grille (§4.3).
const WX_B = { minLat: 20.5, maxLat: 36.5, minLon: -17.5, maxLon: -0.5 }; // = grille API
/** Y de Mercator (le raster est étiré linéairement en Mercator par MapLibre). */
export const wxMercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const WX_K = 6; // voisins IDW par échantillon

// Palette « carte météo » (bleu profond → cyan → vert → jaune → orange → rouge sombre).
export const WX_T_MIN = -10, WX_T_MAX = 46, WX_LUT_N = 512;
const WX_STOPS: [number, string][] = [
  [-10, "#312e81"], [0, "#1d4ed8"], [5, "#3b82f6"], [10, "#22d3ee"], [15, "#22c55e"],
  [20, "#a3e635"], [24, "#fde047"], [28, "#fb923c"], [33, "#ef4444"], [40, "#b91c1c"], [46, "#7f1d1d"],
];
export const WX_GRADIENT = `linear-gradient(90deg, ${WX_STOPS.map(([t, c]) => `${c} ${((((t - WX_T_MIN) / (WX_T_MAX - WX_T_MIN)) * 100)).toFixed(1)}%`).join(", ")})`;
function wxHex(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** Table de correspondance température → RGB (interpolation des arrêts). */
function wxBuildLut(): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(WX_LUT_N * 3);
  for (let i = 0; i < WX_LUT_N; i++) {
    const t = WX_T_MIN + (i / (WX_LUT_N - 1)) * (WX_T_MAX - WX_T_MIN);
    let j = 0;
    while (j < WX_STOPS.length - 2 && t > WX_STOPS[j + 1][0]) j++;
    const [t0, c0] = WX_STOPS[j];
    const [t1, c1] = WX_STOPS[j + 1];
    const f = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
    const a = wxHex(c0), b = wxHex(c1);
    lut[i * 3] = a[0] + (b[0] - a[0]) * f;
    lut[i * 3 + 1] = a[1] + (b[1] - a[1]) * f;
    lut[i * 3 + 2] = a[2] + (b[2] - a[2]) * f;
  }
  return lut;
}
export const WX_LUT = wxBuildLut();

// Tableaux de travail partagés du balayage IDW (mono-thread).
const NAT_BI = new Array<number>(WX_K).fill(0);
const NAT_BD = new Array<number>(WX_K).fill(Infinity);

/**
 * IDW (WX_K voisins) des points de la grille nationale dense en un point
 * [lon, lat] ARBITRAIRE. Balayage direct des ~168 points — assez rapide pour
 * les pixels du rectangle national, les particules et les villes ; aucun
 * maillage précalculé nécessaire.
 */
export function natIdw(pts: { lat: number; lon: number }[], vals: Float32Array, lon: number, lat: number): number {
  const cosl = Math.cos((lat * Math.PI) / 180);
  for (let k = 0; k < WX_K; k++) NAT_BD[k] = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const dla = pts[i].lat - lat;
    const dlo = (pts[i].lon - lon) * cosl;
    const d = dla * dla + dlo * dlo;
    if (d < NAT_BD[WX_K - 1]) {
      let k = WX_K - 1;
      while (k > 0 && NAT_BD[k - 1] > d) { NAT_BD[k] = NAT_BD[k - 1]; NAT_BI[k] = NAT_BI[k - 1]; k--; }
      NAT_BD[k] = d; NAT_BI[k] = i;
    }
  }
  let sum = 0, acc = 0;
  for (let k = 0; k < WX_K; k++) { const w = 1 / (NAT_BD[k] + 1e-6); sum += w; acc += w * vals[NAT_BI[k]]; }
  return acc / sum;
}

/**
 * Pondération du champ national dans le fondu : 1 au cœur du rectangle de la
 * grille dense, 0 dehors, rampe de 1,5° le long des bords — l'échantillon
 * glisse continûment du détail national au champ mondial, aucune couture.
 */
export function natBlend(lon: number, lat: number): number {
  const d = Math.min(lon - WX_B.minLon, WX_B.maxLon - lon, lat - WX_B.minLat, WX_B.maxLat - lat);
  return d <= 0 ? 0 : Math.min(1, d / 1.5);
}

// Palette précipitations (probabilité 0–100 %) : bleu clair → indigo → violet,
// transparence croissante — champ raster léger par-dessus la carte.
const WXP_STOPS: [number, string, number][] = [
  [0, "#60a5fa", 0], [18, "#60a5fa", 0.05], [30, "#3b82f6", 0.42],
  [50, "#4f46e5", 0.62], [70, "#7c3aed", 0.78], [85, "#9333ea", 0.88],
  [100, "#c084fc", 0.95],
];
export const WXP_LUT = (() => {
  const out = new Uint8ClampedArray(101 * 4);
  for (let p = 0; p <= 100; p++) {
    let j = 0;
    while (j < WXP_STOPS.length - 2 && p > WXP_STOPS[j + 1][0]) j++;
    const [p0, c0, a0] = WXP_STOPS[j];
    const [p1, c1, a1] = WXP_STOPS[j + 1];
    const f = Math.min(1, Math.max(0, (p - p0) / (p1 - p0)));
    const A = wxHex(c0), B = wxHex(c1);
    out[p * 4] = A[0] + (B[0] - A[0]) * f;
    out[p * 4 + 1] = A[1] + (B[1] - A[1]) * f;
    out[p * 4 + 2] = A[2] + (B[2] - A[2]) * f;
    out[p * 4 + 3] = Math.round((a0 + (a1 - a0) * f) * 255);
  }
  return out;
})();

/** Jours de la ligne de temps : libellé localisé + index du pas de 12 h (saut). */
export function wxDays(times: string[], lang: string): { date: string; label: string; idx: number }[] {
  const locale = lang === "ar" ? "ar-MA" : lang === "en" ? "en-GB" : "fr-FR";
  const seen = new Map<string, number>();
  times.forEach((t, i) => { const d = t.slice(0, 10); if (!seen.has(d)) seen.set(d, i); });
  return [...seen.entries()].map(([d, firstIdx]) => {
    const noon = times.findIndex((t) => t.startsWith(`${d}T12`));
    return {
      date: d,
      label: new Date(`${d}T00:00:00Z`).toLocaleDateString(locale, { weekday: "short", day: "numeric" }),
      idx: noon >= 0 ? noon : firstIdx,
    };
  });
}

/** Heure de prévision formatée (les heures de la grille sont en UTC). */
export function wxFmtTime(iso: string, lang: string): string {
  const d = new Date(iso.length === 16 ? `${iso}:00Z` : iso);
  if (Number.isNaN(d.getTime())) return "—";
  const locale = lang === "ar" ? "ar-MA" : lang === "en" ? "en-GB" : "fr-FR";
  return d.toLocaleString(locale, { weekday: "short", hour: "2-digit", minute: "2-digit" });
}
