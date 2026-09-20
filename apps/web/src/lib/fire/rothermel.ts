// ============================================================================
// ARGOS — modèle de Rothermel (1972) : vitesse de propagation d'un feu de
// surface, intensité et longueur de flamme, sur les 13 modèles de combustible
// standard (Anderson 1982), avec les corrections d'Albini (1976) et la
// formulation d'Andrews (2018, USDA RMRS-GTR-371) — le modèle des outils
// opérationnels BehavePlus, FARSITE et FlamMap.
//
// Ce que ce module calcule, pour un lit de combustible, une humidité par
// classe, un vent à mi-flamme et une pente :
//   - la vitesse de propagation R (m/min) sans vent ni pente (R0), et les
//     facteurs de vent φw et de pente φs ;
//   - l'intensité de réaction I_R (kW/m²), l'intensité du front I_B
//     (Byram 1959, kW/m), la longueur de flamme L (Byram : 0,45 · I_B^0,46 ft),
//     le temps de résidence t_r = 384/σ (Anderson 1969, min) ;
//   - le vent effectif équivalent à une pente, pour combiner vent et pente en
//     un seul vecteur (Finney 1998, Andrews 2018).
// Le calcul se fait dans les unités du modèle (pieds, livres, Btu) et convertit
// aux bornes : c'est ainsi que les valeurs publiées se vérifient. Pur, testé
// contre le tableau d'Anderson (1982).
// ============================================================================

export type FuelClass = "d1h" | "d10h" | "d100h" | "herb" | "woody";

/** Un modèle de combustible : charges (t/ac), rapport surface/volume du 1 h (1/ft), épaisseur (ft), humidité d'extinction. */
export interface FuelModel {
  /** Numéro Anderson (1–13). */
  id: number;
  code: string;
  /** Libellé d'origine (Anderson 1982). */
  name: string;
  /** Charges en tonnes par acre : mort 1 h, 10 h, 100 h ; vif herbacé, vif ligneux. */
  w1h: number;
  w10h: number;
  w100h: number;
  wHerb: number;
  wWoody: number;
  /** Rapport surface/volume du combustible mort 1 h (1/ft) ; 10 h = 109, 100 h = 30, vif = 1 500. */
  sav1h: number;
  /** Épaisseur du lit (ft). */
  depth: number;
  /** Humidité d'extinction du combustible mort (fraction). */
  mx: number;
  /** Facteur d'ajustement du vent 20 ft → mi-flamme, lit non abrité (Andrews 2012). */
  waf: number;
}

/** Les 13 modèles d'Anderson (1982), tels que publiés. */
export const FUEL_MODELS: readonly FuelModel[] = [
  { id: 1, code: "FM1", name: "Short grass", w1h: 0.74, w10h: 0, w100h: 0, wHerb: 0, wWoody: 0, sav1h: 3500, depth: 1.0, mx: 0.12, waf: 0.36 },
  { id: 2, code: "FM2", name: "Timber (grass and understory)", w1h: 2.0, w10h: 1.0, w100h: 0.5, wHerb: 0.5, wWoody: 0, sav1h: 3000, depth: 1.0, mx: 0.15, waf: 0.36 },
  { id: 3, code: "FM3", name: "Tall grass", w1h: 3.01, w10h: 0, w100h: 0, wHerb: 0, wWoody: 0, sav1h: 1500, depth: 2.5, mx: 0.25, waf: 0.44 },
  { id: 4, code: "FM4", name: "Chaparral", w1h: 5.01, w10h: 4.01, w100h: 2.0, wHerb: 0, wWoody: 5.01, sav1h: 2000, depth: 6.0, mx: 0.2, waf: 0.55 },
  { id: 5, code: "FM5", name: "Brush", w1h: 1.0, w10h: 0.5, w100h: 0, wHerb: 0, wWoody: 2.0, sav1h: 2000, depth: 2.0, mx: 0.2, waf: 0.42 },
  { id: 6, code: "FM6", name: "Dormant brush, hardwood slash", w1h: 1.5, w10h: 2.5, w100h: 2.0, wHerb: 0, wWoody: 0, sav1h: 1750, depth: 2.5, mx: 0.25, waf: 0.44 },
  { id: 7, code: "FM7", name: "Southern rough", w1h: 1.13, w10h: 1.87, w100h: 1.5, wHerb: 0, wWoody: 0.37, sav1h: 1750, depth: 2.5, mx: 0.4, waf: 0.44 },
  { id: 8, code: "FM8", name: "Closed timber litter", w1h: 1.5, w10h: 1.0, w100h: 2.5, wHerb: 0, wWoody: 0, sav1h: 2000, depth: 0.2, mx: 0.3, waf: 0.28 },
  { id: 9, code: "FM9", name: "Hardwood litter", w1h: 2.92, w10h: 0.41, w100h: 0.15, wHerb: 0, wWoody: 0, sav1h: 2500, depth: 0.2, mx: 0.25, waf: 0.28 },
  { id: 10, code: "FM10", name: "Timber (litter and understory)", w1h: 3.01, w10h: 2.0, w100h: 5.01, wHerb: 0, wWoody: 2.0, sav1h: 2000, depth: 1.0, mx: 0.25, waf: 0.36 },
  { id: 11, code: "FM11", name: "Light logging slash", w1h: 1.5, w10h: 4.51, w100h: 5.51, wHerb: 0, wWoody: 0, sav1h: 1500, depth: 1.0, mx: 0.15, waf: 0.36 },
  { id: 12, code: "FM12", name: "Medium logging slash", w1h: 4.01, w10h: 14.03, w100h: 16.53, wHerb: 0, wWoody: 0, sav1h: 1500, depth: 2.3, mx: 0.2, waf: 0.43 },
  { id: 13, code: "FM13", name: "Heavy logging slash", w1h: 7.01, w10h: 23.04, w100h: 28.05, wHerb: 0, wWoody: 0, sav1h: 1500, depth: 3.0, mx: 0.25, waf: 0.46 },
];

export function fuelModel(id: number): FuelModel {
  return FUEL_MODELS.find((f) => f.id === id) ?? FUEL_MODELS[4];
}

/** Humidité (fraction de la masse sèche) par classe. */
export interface FuelMoisture {
  d1h: number;
  d10h: number;
  d100h: number;
  herb: number;
  woody: number;
}

// --- constantes du modèle ----------------------------------------------------
const RHO_P = 32; // masse volumique des particules (lb/ft³)
const S_T = 0.0555; // teneur minérale totale
const S_E = 0.01; // teneur minérale effective
const HEAT = 8000; // pouvoir calorifique (Btu/lb)
const SAV_10H = 109;
const SAV_100H = 30;
const SAV_LIVE = 1500;
const TPA_TO_LBFT2 = 0.0459137; // tonnes/acre → lb/ft²
const FTMIN_PER_MPS = 196.85; // m/s → ft/min
const FT_TO_M = 0.3048;
const BTU_FT_S_TO_KW_M = 3.4613;
const BTU_FT2_MIN_TO_KW_M2 = 0.1891;

/**
 * Humidité d'équilibre du combustible fin mort (Simard 1968, telle qu'utilisée
 * par le NFDRS et Rothermel 1983) : température (°C) et humidité relative (%)
 * → fraction. Ni ombrage ni heure du jour : la valeur nominale, en plein
 * soleil, pour un cadrage.
 */
export function equilibriumMoisture(tempC: number, rhPct: number): number {
  const T = tempC * 1.8 + 32;
  const H = Math.max(0, Math.min(100, rhPct));
  let emc: number;
  if (H < 10) emc = 0.03229 + 0.281073 * H - 0.000578 * H * T;
  else if (H < 50) emc = 2.22749 + 0.160107 * H - 0.01478 * T;
  else emc = 21.0606 + 0.005565 * H * H - 0.00035 * H * T - 0.483199 * H;
  return Math.max(0.01, Math.min(0.35, emc / 100));
}

/**
 * Le jeu d'humidités d'un scénario : le 1 h à l'équilibre, le 10 h et le 100 h
 * plus lents à sécher (+2 % et +4 %, la règle des tables de Rothermel 1983),
 * le vif selon la saison (`liveMoisture`, fraction — 0,6 en été sec, 1,2 au
 * printemps, ligneux 30 % plus humide que l'herbacé).
 */
export function moistureScenario(tempC: number, rhPct: number, liveMoisture: number): FuelMoisture {
  const d1h = equilibriumMoisture(tempC, rhPct);
  return { d1h, d10h: d1h + 0.02, d100h: d1h + 0.04, herb: liveMoisture, woody: liveMoisture * 1.3 };
}

/** Vent à 10 m (km/h) → vent à mi-flamme (m/s) : 20 ft ≈ 0,87 × 10 m, puis le facteur d'ajustement du modèle. */
export function midflameWind(wind10mKmh: number, fm: FuelModel): number {
  return (Math.max(0, wind10mKmh) / 3.6) * 0.87 * fm.waf;
}

export interface RothermelResult {
  /** Vitesse de propagation avec vent et pente (m/min), et sans (R0). */
  ros: number;
  ros0: number;
  /** Facteurs de vent et de pente (sans dimension). */
  phiW: number;
  phiS: number;
  /** Intensité de réaction (kW/m²), intensité du front (kW/m), longueur de flamme (m). */
  reactionIntensity: number;
  firelineIntensity: number;
  flameLength: number;
  /** Temps de résidence des flammes (min). */
  residenceTime: number;
  /** Coefficients du facteur de vent (φw = C · U^B · ratio^-E, U en ft/min) — pour le vent équivalent. */
  windCoef: { C: number; B: number; E: number; ratio: number };
  /** Tassement du lit β (sans dimension) — le facteur de pente en dépend. */
  beta: number;
  /** Vent à mi-flamme retenu (m/s), après la borne de Rothermel (U ≤ 0,9 I_R). */
  windUsed: number;
}

/**
 * Le modèle. `midflameWindMps` : vent à mi-flamme, dans la direction de
 * propagation ; `slopeTan` : tangente de la pente, montée positive (0 en
 * descente : le modèle n'accélère qu'à la montée).
 */
export function rothermel(fm: FuelModel, m: FuelMoisture, midflameWindMps: number, slopeTan: number): RothermelResult {
  // Les classes du lit : charge (lb/ft²), σ (1/ft), humidité, catégorie.
  const classes = [
    { w: fm.w1h * TPA_TO_LBFT2, s: fm.sav1h, m: m.d1h, live: false },
    { w: fm.w10h * TPA_TO_LBFT2, s: SAV_10H, m: m.d10h, live: false },
    { w: fm.w100h * TPA_TO_LBFT2, s: SAV_100H, m: m.d100h, live: false },
    { w: fm.wHerb * TPA_TO_LBFT2, s: SAV_LIVE, m: m.herb, live: true },
    { w: fm.wWoody * TPA_TO_LBFT2, s: SAV_LIVE, m: m.woody, live: true },
  ].filter((c) => c.w > 0);
  const cats = [false, true].map((live) => classes.filter((c) => c.live === live)).filter((c) => c.length > 0);
  // Surfaces et poids (Rothermel 1972, éq. 53–56).
  const areaOf = (c: { w: number; s: number }) => (c.s * c.w) / RHO_P;
  const catArea = cats.map((cs) => cs.reduce((a, c) => a + areaOf(c), 0));
  const totalArea = catArea.reduce((a, b) => a + b, 0);
  if (totalArea <= 0) return zeroResult();
  const fCat = catArea.map((a) => a / totalArea);
  const fIn = cats.map((cs, i) => cs.map((c) => areaOf(c) / catArea[i]));
  // σ caractéristique, masse volumique apparente, tassement.
  const sigmaCat = cats.map((cs, i) => cs.reduce((a, c, j) => a + fIn[i][j] * c.s, 0));
  const sigma = sigmaCat.reduce((a, s, i) => a + fCat[i] * s, 0);
  const w0 = classes.reduce((a, c) => a + c.w, 0);
  const rhoB = w0 / fm.depth;
  const beta = rhoB / RHO_P;
  const betaOp = 3.348 * Math.pow(sigma, -0.8189);
  const ratio = beta / betaOp;
  // Vitesse de réaction (Albini 1976).
  const gammaMax = Math.pow(sigma, 1.5) / (495 + 0.0594 * Math.pow(sigma, 1.5));
  const A = 133 * Math.pow(sigma, -0.7913);
  const gamma = gammaMax * Math.pow(ratio, A) * Math.exp(A * (1 - ratio));
  // Charge nette par catégorie, groupée par classe de taille (Albini 1976).
  const sizeClass = (s: number) => (s >= 1200 ? 0 : s >= 192 ? 1 : s >= 96 ? 2 : s >= 48 ? 3 : s >= 16 ? 4 : 5);
  const wnCat = cats.map((cs, i) => {
    const g = new Array<number>(6).fill(0);
    cs.forEach((c, j) => {
      g[sizeClass(c.s)] += fIn[i][j];
    });
    return cs.reduce((a, c) => a + g[sizeClass(c.s)] * c.w * (1 - S_T), 0);
  });
  // Humidités : celle de la catégorie, et l'extinction du vif (Albini 1976).
  const mfCat = cats.map((cs, i) => cs.reduce((a, c, j) => a + fIn[i][j] * c.m, 0));
  const dead = classes.filter((c) => !c.live);
  const live = classes.filter((c) => c.live);
  const mxCat = cats.map((cs) => {
    if (!cs[0].live || live.length === 0) return fm.mx;
    const wDead = dead.reduce((a, c) => a + c.w * Math.exp(-138 / c.s), 0);
    const wLive = live.reduce((a, c) => a + c.w * Math.exp(-500 / c.s), 0);
    const W = wLive > 0 ? wDead / wLive : 0;
    const mfDeadFine = wDead > 0 ? dead.reduce((a, c) => a + c.w * c.m * Math.exp(-138 / c.s), 0) / wDead : 0;
    return Math.max(fm.mx, 2.9 * W * (1 - mfDeadFine / fm.mx) - 0.226);
  });
  const etaM = cats.map((_, i) => {
    const r = Math.min(1, mfCat[i] / mxCat[i]);
    return Math.max(0, 1 - 2.59 * r + 5.11 * r * r - 3.52 * r * r * r);
  });
  const etaS = 0.174 * Math.pow(S_E, -0.19);
  const iR = gamma * cats.reduce((a, _, i) => a + wnCat[i] * HEAT * etaM[i] * etaS, 0); // Btu/ft²/min
  // Flux propagé, puits de chaleur.
  const xi = Math.exp((0.792 + 0.681 * Math.sqrt(sigma)) * (beta + 0.1)) / (192 + 0.2595 * sigma);
  const heatSink = rhoB * cats.reduce((a, cs, i) => a + fCat[i] * cs.reduce((b, c, j) => b + fIn[i][j] * Math.exp(-138 / c.s) * (250 + 1116 * c.m), 0), 0);
  const ros0ft = heatSink > 0 ? (iR * xi) / heatSink : 0;
  // Vent (borné : U ≤ 0,9 I_R, Rothermel 1972) et pente.
  const C = 7.47 * Math.exp(-0.133 * Math.pow(sigma, 0.55));
  const B = 0.02526 * Math.pow(sigma, 0.54);
  const E = 0.715 * Math.exp(-3.59e-4 * sigma);
  const uFtMin = Math.min(Math.max(0, midflameWindMps) * FTMIN_PER_MPS, 0.9 * iR);
  const phiW = C * Math.pow(uFtMin, B) * Math.pow(ratio, -E);
  const tan = Math.max(0, slopeTan);
  const phiS = 5.275 * Math.pow(beta, -0.3) * tan * tan;
  const rosFt = ros0ft * (1 + phiW + phiS);
  const residence = 384 / sigma;
  const iB = (iR * residence * rosFt) / 60; // Btu/ft/s
  const flameFt = 0.45 * Math.pow(iB, 0.46);
  return {
    ros: rosFt * FT_TO_M,
    ros0: ros0ft * FT_TO_M,
    phiW,
    phiS,
    reactionIntensity: iR * BTU_FT2_MIN_TO_KW_M2,
    firelineIntensity: iB * BTU_FT_S_TO_KW_M,
    flameLength: flameFt * FT_TO_M,
    residenceTime: residence,
    windCoef: { C, B, E, ratio },
    beta,
    windUsed: uFtMin / FTMIN_PER_MPS,
  };
}

/** Facteur de pente de Rothermel : φs = 5,275 · β^-0,3 · tan²φ (montée seulement). */
export function slopePhi(beta: number, slopeTan: number): number {
  const tan = Math.max(0, slopeTan);
  return 5.275 * Math.pow(Math.max(1e-4, beta), -0.3) * tan * tan;
}

function zeroResult(): RothermelResult {
  return { ros: 0, ros0: 0, phiW: 0, phiS: 0, reactionIntensity: 0, firelineIntensity: 0, flameLength: 0, residenceTime: 0, windCoef: { C: 0, B: 1, E: 0, ratio: 1 }, beta: 0, windUsed: 0 };
}

/** Le vent (m/s) qui produirait à lui seul ce facteur (φ = C U^B ratio^-E) — pour combiner vent et pente en un seul vecteur. */
export function equivalentWind(phi: number, coef: RothermelResult["windCoef"]): number {
  if (phi <= 0 || coef.C <= 0) return 0;
  return Math.pow(phi / (coef.C * Math.pow(coef.ratio, -coef.E)), 1 / coef.B) / FTMIN_PER_MPS;
}

/** Allongement de l'ellipse de propagation selon le vent effectif à mi-flamme (m/s) — Anderson 1983, tel que FARSITE l'emploie ; borné à 8. */
export function lengthToBreadthFromWind(windMps: number): number {
  const u = Math.max(0, windMps);
  return Math.max(1, Math.min(8, 0.936 * Math.exp(0.2566 * u) + 0.461 * Math.exp(-0.1548 * u) - 0.397));
}

/**
 * Longueur de flamme → ce qu'elle permet (Andrews & Rothermel 1982, « hauling
 * chart ») : `direct` (< 1,2 m : attaque directe à la main), `engins` (< 2,4 m :
 * engins et retardant), `indirect` (< 3,4 m : attaque indirecte), `hors` (au-delà :
 * feu de cime probable, aucune attaque sur le front).
 */
export function tacticalClass(flameLengthM: number): "direct" | "engins" | "indirect" | "hors" {
  return flameLengthM < 1.2 ? "direct" : flameLengthM < 2.4 ? "engins" : flameLengthM < 3.4 ? "indirect" : "hors";
}
