// ============================================================================
// ARGOS — crues sans clé : Open-Meteo Flood (GloFAS v4, Copernicus / ECMWF)
//
// Open-Meteo sert le débit de rivière prévu (et son historique depuis 1984)
// sur une grille de 5 km, SANS clé ni inscription, en licence ouverte, et se
// laisse auto-héberger — le même statut que la météo du projet (ADR 0002).
// GloFAS ne publie pas de seuils d'alerte par point : ils se DÉRIVENT ici de
// l'historique — les maxima annuels sur quatre ans, dont la médiane vaut
// à peu près la crue biennale, le 80e centile la quinquennale, le maximum la
// décennale. C'est une approximation nommée comme telle, pas une doctrine.
//
// Les points sont choisis par nous : les grands oueds, aux villes qu'ils
// menacent. Tout ici est pur (testé sans réseau) ; l'appel vit dans le service.
//
// LE QUOTA GRATUIT SE RESPECTE : Open-Meteo compte une requête au prorata des
// lieux et des jours demandés. Dix ans d'historique pour vingt points d'un
// coup répondaient « 429 ». D'où : UNE requête « voisinage + prévision » à la
// fois (3 × 3 cellules par point, deux semaines), et l'historique point par
// point, espacé, en arrière-plan, gardé un mois.
// ============================================================================

import type { FloodSeverity, FloodThresholds, FloodTrend } from "@/modules/domain/flood.service";

/** Un point de rivière suivi : un oued, une ville, une position sur la grille GloFAS. */
export interface RiverPoint {
  gaugeId: string;
  siteName: string;
  river: string;
  /** [lng, lat] */
  ll: [number, number];
}

/** Les grands oueds du pays, aux points qui comptent pour la conduite. */
export const RIVER_POINTS: readonly RiverPoint[] = [
  { gaugeId: "om-sebou-kenitra", siteName: "Oued Sebou — Kénitra", river: "Sebou", ll: [-6.58, 34.26] },
  { gaugeId: "om-sebou-mechra", siteName: "Oued Sebou — Mechra Bel Ksiri", river: "Sebou", ll: [-5.95, 34.57] },
  { gaugeId: "om-ouergha-jorf", siteName: "Oued Ouergha — barrage Al Wahda (aval)", river: "Ouergha", ll: [-5.24, 34.72] },
  { gaugeId: "om-inaouene-taza", siteName: "Oued Inaouène — Taza", river: "Inaouène", ll: [-4.01, 34.22] },
  { gaugeId: "om-beht-sidislimane", siteName: "Oued Beht — Sidi Slimane", river: "Beht", ll: [-5.93, 34.26] },
  { gaugeId: "om-loukkos-ksar", siteName: "Oued Loukkos — Ksar El Kébir", river: "Loukkos", ll: [-5.90, 35.00] },
  { gaugeId: "om-martil-tetouan", siteName: "Oued Martil — Tétouan", river: "Martil", ll: [-5.36, 35.57] },
  { gaugeId: "om-nekor-alhoceima", siteName: "Oued Nekor — Al Hoceïma", river: "Nekor", ll: [-3.85, 35.20] },
  { gaugeId: "om-moulouya-guercif", siteName: "Oued Moulouya — Guercif", river: "Moulouya", ll: [-3.35, 34.23] },
  { gaugeId: "om-moulouya-zaio", siteName: "Oued Moulouya — Zaïo (embouchure)", river: "Moulouya", ll: [-2.35, 35.10] },
  { gaugeId: "om-bouregreg-rabat", siteName: "Oued Bouregreg — Rabat-Salé", river: "Bouregreg", ll: [-6.80, 34.02] },
  { gaugeId: "om-oumerrbia-azemmour", siteName: "Oum Er-Rbia — Azemmour", river: "Oum Er-Rbia", ll: [-8.34, 33.29] },
  { gaugeId: "om-oumerrbia-kasbatadla", siteName: "Oum Er-Rbia — Kasba Tadla", river: "Oum Er-Rbia", ll: [-6.27, 32.60] },
  { gaugeId: "om-tensift-marrakech", siteName: "Oued Tensift — Marrakech", river: "Tensift", ll: [-8.00, 31.70] },
  { gaugeId: "om-ourika-alhaouz", siteName: "Oued Ourika — Al Haouz", river: "Ourika", ll: [-7.78, 31.36] },
  { gaugeId: "om-souss-agadir", siteName: "Oued Souss — Aït Melloul / Agadir", river: "Souss", ll: [-9.48, 30.35] },
  { gaugeId: "om-draa-zagora", siteName: "Oued Draa — Zagora", river: "Draa", ll: [-5.84, 30.33] },
  { gaugeId: "om-ziz-errachidia", siteName: "Oued Ziz — Errachidia", river: "Ziz", ll: [-4.43, 31.93] },
  { gaugeId: "om-guir-boudnib", siteName: "Oued Guir — Boudnib", river: "Guir", ll: [-3.61, 31.95] },
  { gaugeId: "om-tata", siteName: "Oued Tata — Tata", river: "Tata", ll: [-7.97, 29.75] },
];

/** Une série journalière : dates ISO et valeurs (m³/s), `null` quand GloFAS ne dit rien. */
export interface DailySeries {
  time: string[];
  values: (number | null)[];
}

const OM_BASE = "https://flood-api.open-meteo.com/v1/flood";
/** Années d'historique par point pour les seuils : quatre maxima annuels, c'est le minimum utile sous le quota. */
const HISTORY_YEARS = 4;
/** Pas de la grille GloFAS (0,05°) : le voisinage sondé autour d'un point en compte 3 × 3 cellules. */
const CELL_DEG = 0.05;
/** En dessous de ce maximum décennal (m³/s), la cellule n'est pas un lit de rivière : on ne conclut pas. */
export const MIN_DECADAL_PEAK = 1;

/** Les positions de cellules candidates autour d'un point : la sienne et ses huit voisines. */
export function neighborhood(ll: [number, number]): [number, number][] {
  const out: [number, number][] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) out.push([ll[0] + dx * CELL_DEG, ll[1] + dy * CELL_DEG]);
  return out;
}

const coords = (lls: readonly [number, number][]) =>
  `latitude=${lls.map((l) => l[1].toFixed(4)).join(",")}&longitude=${lls.map((l) => l[0].toFixed(4)).join(",")}`;

/**
 * URL « voisinage + prévision » : les 3 × 3 cellules autour de chaque point,
 * une semaine passée et sept jours prévus, en UNE requête. La cellule au
 * débit moyen le plus fort est le lit de l'oued — le point posé à la ville
 * tombe souvent à côté, sur une cellule de plaine qui ne dit rien — et sa
 * série est la prévision servie.
 */
export function openMeteoForecastUrl(points: readonly RiverPoint[]): string {
  return `${OM_BASE}?${coords(points.flatMap((p) => neighborhood(p.ll)))}&daily=river_discharge,river_discharge_max&forecast_days=7&past_days=7`;
}

/** Parmi les 3 × 3 séries de chaque point, l'indice de la cellule au débit moyen le plus fort (4 = le point lui-même, faute de mieux). */
export function snapToChannel(points: readonly RiverPoint[], series: readonly DailySeries[]): number[] {
  return points.map((_, i) => {
    let best = 4;
    let bestMean = -1;
    for (let j = 0; j < 9; j++) {
      const serie = series[i * 9 + j];
      const v = serie?.values.filter((x): x is number => x !== null) ?? [];
      const mean = v.length ? v.reduce((a, b) => a + b, 0) / v.length : -1;
      if (mean > bestMean) {
        bestMean = mean;
        best = j;
      }
    }
    return best;
  });
}

/** URL de l'historique (quatre ans de débit journalier) pour UNE position — une requête par point, espacée. */
export function openMeteoHistoryUrl(ll: [number, number], now = new Date()): string {
  const fin = new Date(now.getTime() - 2 * 86_400_000);
  const debut = new Date(fin.getTime());
  debut.setUTCFullYear(debut.getUTCFullYear() - HISTORY_YEARS);
  const jour = (d: Date) => d.toISOString().slice(0, 10);
  return `${OM_BASE}?${coords([ll])}&daily=river_discharge&start_date=${jour(debut)}&end_date=${jour(fin)}`;
}

interface RawDaily { time?: unknown; river_discharge?: unknown; river_discharge_max?: unknown }
interface RawLocation { daily?: RawDaily }

const nombres = (v: unknown): (number | null)[] => (Array.isArray(v) ? v.map((x) => (typeof x === "number" && Number.isFinite(x) ? x : null)) : []);

/**
 * Découpe une réponse Open-Meteo — un objet pour un point, un tableau pour
 * plusieurs — en séries, dans l'ordre demandé ; un point manquant rend une
 * série vide plutôt que de décaler les autres.
 */
export function parseOpenMeteoDaily(res: unknown, n: number, field: "river_discharge" | "river_discharge_max" = "river_discharge"): DailySeries[] {
  const liste: RawLocation[] = Array.isArray(res) ? (res as RawLocation[]) : res && typeof res === "object" ? [res as RawLocation] : [];
  return Array.from({ length: n }, (_, i) => {
    const d = liste[i]?.daily;
    const time = Array.isArray(d?.time) ? (d!.time as unknown[]).map(String) : [];
    return { time, values: nombres(d?.[field]).slice(0, time.length) };
  });
}

function centile(tries: number[], p: number): number {
  const i = Math.min(tries.length - 1, Math.max(0, Math.round((tries.length - 1) * p)));
  return tries[i];
}

/**
 * Seuils dérivés de l'historique : les maxima annuels, triés ; il en faut au
 * moins trois années pour dire quelque chose. Médiane ≈ crue biennale
 * (vigilance), 80e centile ≈ quinquennale (danger), maximum ≈ décennale
 * (danger extrême). Un oued à sec toute l'année rend des seuils nuls : on
 * refuse alors de conclure.
 */
export function thresholdsFromHistory(hist: DailySeries): FloodThresholds | null {
  const parAn = new Map<string, number>();
  hist.time.forEach((t, i) => {
    const v = hist.values[i];
    if (v === null) return;
    const an = t.slice(0, 4);
    parAn.set(an, Math.max(parAn.get(an) ?? -Infinity, v));
  });
  const maxima = [...parAn.values()].sort((a, b) => a - b);
  if (maxima.length < 3 || maxima[maxima.length - 1] < MIN_DECADAL_PEAK) return null;
  return { warning: centile(maxima, 0.5), danger: centile(maxima, 0.8), extreme: maxima[maxima.length - 1], unit: "m3/s" };
}

/** Le pic prévu contre les seuils. Sans seuil ni pic : inconnu. */
export function severityFrom(peak: number | null, th: FloodThresholds | null): FloodSeverity {
  if (peak === null || !th || th.danger <= 0) return "unknown";
  if (th.extreme !== undefined && peak >= th.extreme) return "extreme";
  if (peak >= th.danger) return "severe";
  if (peak >= th.warning) return "above_normal";
  return "no_flooding";
}

/** Tendance de la prévision : la fin contre le début, à 10 % près. */
export function trendFrom(values: readonly (number | null)[]): FloodTrend {
  const v = values.filter((x): x is number => x !== null);
  if (v.length < 2) return "unknown";
  const k = Math.max(1, Math.floor(v.length / 3));
  const debut = v.slice(0, k).reduce((a, b) => a + b, 0) / k;
  const fin = v.slice(-k).reduce((a, b) => a + b, 0) / k;
  const ref = Math.max(debut, 0.001);
  if (fin > debut * 1.1) return "rise";
  if (fin < debut * 0.9 && (debut - fin) / ref > 0.1) return "fall";
  return "no_change";
}

/** Le pic d'une série, `null` si elle est vide. */
export function peakOf(values: readonly (number | null)[]): number | null {
  let best: number | null = null;
  for (const v of values) if (v !== null && (best === null || v > best)) best = v;
  return best;
}
