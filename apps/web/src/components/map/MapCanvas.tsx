"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { TILES_MODE } from "@/lib/map/tiles";
import { useArgos, useDict } from "@/lib/store";
import { FLUX } from "@/lib/i18n/flux";
import { canReportIncident } from "@/lib/roles";
import { MAP_CENTER, MAP_STYLE, MAP_ZOOM } from "@/lib/map/style";
import { routeThrough, type RouteResult } from "@/lib/map/routing";
import { extrapolate } from "@/lib/map/deadReckoning";
import { OVERLAY_STYLE } from "@/lib/map/overlay";
import { Icon } from "@/components/ui/Icon";
import { NAV_ICONS, UI_ICONS } from "@/lib/icons";
import { WeatherPopup } from "@/components/flux/WeatherPopup";
import { WX_CITIES, nearestCity } from "@/lib/map/cities";
import { hospKind } from "@/lib/hospitals";
import {
  fieldLL,
  fieldMarkerHTML,
  hospMarkerHTML,
  incMarkerHTML,
  unitMarkerHTML,
  vehMarkerHTML,
  acftMarkerHTML,
  vehPos,
} from "@/lib/map/markers";
import type { MarkerKind, WeatherGridSeries } from "@/lib/types";

interface VehMarker {
  mk: maplibregl.Marker;
  routeIndex: number;
}

// --- Altitude : échantillonnage direct du MNT « terrarium » -----------------
// Indépendant du terrain 3D (queryTerrainElevation n'est fiable que si le mesh
// de terrain est monté). Encodage terrarium : alt = R*256 + G + B/256 - 32768.
const DEM_Z = 11;
const demCache = new Map<string, ImageData | null>();

function lngLatToTile(lng: number, lat: number, z: number) {
  const n = 2 ** z;
  const fx = ((lng + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return { xt: Math.floor(fx), yt: Math.floor(fy), px: Math.min(255, Math.floor((fx % 1) * 256)), py: Math.min(255, Math.floor((fy % 1) * 256)) };
}

async function demElevation(lng: number, lat: number): Promise<number | null> {
  const { xt, yt, px, py } = lngLatToTile(lng, lat, DEM_Z);
  const key = `${DEM_Z}/${xt}/${yt}`;
  if (!demCache.has(key)) {
    // Tuiles d'altitude : source EXTERNE (AWS). En mode souverain on ne les
    // demande pas du tout — l'altitude affichée devient « — » plutôt que de
    // révéler à un tiers les points que l'opérateur interroge (ADR 0006).
    if (TILES_MODE !== "external") {
      demCache.set(key, null);
      return null;
    }
    try {
      // Passer par fetch + blob : un <img crossOrigin> sur ce bucket ne résout
      // pas, alors que fetch aboutit ; le blob est same-origin donc le canvas
      // n'est pas « tainted » et getImageData reste autorisé.
      const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${DEM_Z}/${xt}/${yt}.png`);
      if (!res.ok) throw new Error(String(res.status));
      const bmp = await createImageBitmap(await res.blob());
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 256;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(bmp, 0, 0);
      demCache.set(key, ctx.getImageData(0, 0, 256, 256));
    } catch {
      demCache.set(key, null);
    }
  }
  const data = demCache.get(key);
  if (!data) return null;
  const i = (py * 256 + px) * 4;
  return data.data[i] * 256 + data.data[i + 1] + data.data[i + 2] / 256 - 32768;
}

/** Heure locale compacte pour le bandeau séisme. */
function qLocalTime(iso: string, lang: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const locale = lang === "ar" ? "ar-MA" : lang === "en" ? "en-GB" : "fr-FR";
  return d.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

/** Échappe le texte externe (EMSC) avant injection HTML dans la popup. */
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));
}

/** Couleur hex du bandeau selon la magnitude. */
function qMagHex(m: number): { bg: string; fg: string } {
  if (m >= 5) return { bg: "#ef4444", fg: "#ffffff" };
  if (m >= 4) return { bg: "#C9A84C", fg: "#12210f" };
  if (m >= 3) return { bg: "#fbbf24", fg: "#3a2f0a" };
  return { bg: "#9ca3af", fg: "#1f2937" };
}

// Style de la couche sismique (partagé setupStyle / animation de pulsation).
const QUAKE_COLOR: maplibregl.DataDrivenPropertyValueSpecification<string> =
  ["step", ["get", "mag"], "#94a3b8", 3, "#fbbf24", 4, "#f59e0b", 5, "#ef4444"];
const QUAKE_HALO_R: maplibregl.DataDrivenPropertyValueSpecification<number> =
  ["interpolate", ["linear"], ["get", "mag"], 3, 12, 5, 30, 7, 52];
const QUAKE_DOT_R: maplibregl.DataDrivenPropertyValueSpecification<number> =
  ["interpolate", ["linear"], ["get", "mag"], 2, 5, 5, 13, 7, 22];

// Couleur des zones du panache NRBC par sévérité (partagée setupStyle / applyPlume).
const PLUME_LEVEL_COLOR: maplibregl.ExpressionSpecification = [
  "match", ["get", "level"],
  "danger", "#EF4444",
  "protection", "#F97316",
  "#FACC15",
];

// --- carte météo : RASTER interpolé (style carte météo pro) + animation ------
// La température est interpolée (IDW) depuis la grille API vers une vraie image
// (source canvas MapLibre) → champ CONTINU comme une carte météo NWS, avec les
// valeurs numériques posées par-dessus et une animation sur les 24 h de
// prévision. Aucune tuile météo externe : uniquement notre grille (§4.3).
const WX_B = { minLat: 20.5, maxLat: 36.5, minLon: -17.5, maxLon: -0.5 }; // = grille API
/** Y de Mercator (le raster est étiré linéairement en Mercator par MapLibre). */
const wxMercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const WX_K = 6; // voisins IDW par échantillon

// Palette « carte météo » (bleu profond → cyan → vert → jaune → orange → rouge sombre).
const WX_T_MIN = -10, WX_T_MAX = 46, WX_LUT_N = 512;
const WX_STOPS: [number, string][] = [
  [-10, "#312e81"], [0, "#1d4ed8"], [5, "#3b82f6"], [10, "#22d3ee"], [15, "#22c55e"],
  [20, "#a3e635"], [24, "#fde047"], [28, "#fb923c"], [33, "#ef4444"], [40, "#b91c1c"], [46, "#7f1d1d"],
];
const WX_GRADIENT = `linear-gradient(90deg, ${WX_STOPS.map(([t, c]) => `${c} ${((((t - WX_T_MIN) / (WX_T_MAX - WX_T_MIN)) * 100)).toFixed(1)}%`).join(", ")})`;
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
const WX_LUT = wxBuildLut();

// Tableaux de travail partagés du balayage IDW (mono-thread).
const NAT_BI = new Array<number>(WX_K).fill(0);
const NAT_BD = new Array<number>(WX_K).fill(Infinity);

/**
 * IDW (WX_K voisins) des points de la grille nationale dense en un point
 * [lon, lat] ARBITRAIRE. Balayage direct des ~168 points — assez rapide pour
 * les pixels du rectangle national, les particules et les villes ; aucun
 * maillage précalculé nécessaire.
 */
function natIdw(pts: { lat: number; lon: number }[], vals: Float32Array, lon: number, lat: number): number {
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
function natBlend(lon: number, lat: number): number {
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
const WXP_LUT = (() => {
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
function wxDays(times: string[], lang: string): { date: string; label: string; idx: number }[] {
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
function wxFmtTime(iso: string, lang: string): string {
  const d = new Date(iso.length === 16 ? `${iso}:00Z` : iso);
  if (Number.isNaN(d.getTime())) return "—";
  const locale = lang === "ar" ? "ar-MA" : lang === "en" ? "en-GB" : "fr-FR";
  return d.toLocaleString(locale, { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

// --- grille MONDIALE régulière (10°, 36×14, 70°N → 60°S) ---------------------
const WXG_B = { minLat: -60, maxLat: 70, minLon: -180, maxLon: 180 };
const WXG_COLS = 36, WXG_ROWS = 14, WXG_DLAT = 10, WXG_DLON = 10, WXG_LAT0 = 70, WXG_LON0 = -180;

// --- rendu UNIFIÉ : un seul jeu de canvas planétaires ------------------------
// Un champ HOMOGÈNE sur toute la carte (fini le rectangle national visible) :
// chaque échantillon fond l'IDW de la grille dense nationale dans le bilinéaire
// mondial via natBlend — mêmes données modèle des deux côtés. Température et
// précipitations partagent une boucle de pixels redessinée au plus toutes les
// WXU_RASTER_MS ; le vent est UN SEUL système de particules planétaire.
const WXU_W = 1080; // 3 px/°
const WXU_H = Math.round((WXU_W * (wxMercY(WXG_B.maxLat) - wxMercY(WXG_B.minLat))) / (((WXG_B.maxLon - WXG_B.minLon) * Math.PI) / 180));
// Vent : particules en ESPACE ÉCRAN (façon Windy). Le canvas est superposé à
// la carte (PAS géoréférencé) : les traits font toujours ~1 px écran quel que
// soit le zoom (aucun flou d'agrandissement possible) et la densité est
// constante par surface d'écran. Chaque particule est dé-projetée (unproject)
// pour échantillonner le champ u/v géographique. Pendant un déplacement de la
// carte, le canvas est effacé (les positions écran perdent leur ancrage) et le
// champ se reforme en ~1 s.
const WXS_MAX = 4000; // plafond de particules (l'effectif suit la surface d'écran)
const WXS_PER_PX = 1 / 200; // particules par pixel CSS (densité écran constante, élevée)
const WXU_RASTER_MS = 200; // redessin des rasters (~5 im/s : fluide pour 1 h/s)

// Les villes étiquetées viennent de lib/map/cities (niveau de détail par zoom).

/**
 * Échantillonnage bilinéaire du champ mondial : la grille est RÉGULIÈRE (10°),
 * les 4 voisins se déduisent des indices (pas de maillage IDW nécessaire).
 * Enroulement en longitude (170°E → 180° → 180°W continu).
 */
function wxgSample(a: Float32Array, lon: number, lat: number): number {
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
function wxToUV(pt: { wind: number[]; windDir: number[] }, s: number, comp: "u" | "v"): number {
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
const ACFT_POLL_MS = 6_000;

/** Cadence de réaffichage de la position estimée (~4 images/s). */
const ACFT_FRAME_MS = 250;

/** Au-delà, le dernier contact est trop ancien : le marqueur s'estompe. */
const ACFT_STALE_S = 45;

export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const vehMarkersRef = useRef<VehMarker[]>([]);
  /**
   * Marqueurs d'aéronefs, indexés par identifiant. Registre PERSISTANT : on
   * déplace les marqueurs existants au lieu de les recréer, sinon la carte
   * clignoterait à chaque rafraîchissement de position.
   */
  const acftMarkersRef = useRef<Map<string, { mk: maplibregl.Marker; el: HTMLElement; html: string }>>(new Map());
  const vehProgRef = useRef<number[]>([0.1, 0.45, 0.7]);
  const rafRef = useRef<number>(0);
  const readyRef = useRef(false);
  /** Panache déjà cadré — évite de recadrer à chaque échéance ou bascule. */
  const fitPlumeRef = useRef<string | null>(null);
  const quakeBound = useRef(false); // handlers hover/clic de la couche séismes posés une fois
  const quakePopupRef = useRef<maplibregl.Popup | null>(null); // bandeau collé au séisme
  // --- météo UNIFIÉE : canvas planétaires + séries par pas + villes ---
  const wxuTempCvRef = useRef<HTMLCanvasElement | null>(null);
  const wxuTempCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const wxuTempImgRef = useRef<ImageData | null>(null);
  const wxuPrecipCvRef = useRef<HTMLCanvasElement | null>(null);
  const wxuPrecipCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const wxuPrecipImgRef = useRef<ImageData | null>(null);
  // Vent écran : canvas DOM superposé (voir WXS_*), particules en px appareil.
  const wxsCvRef = useRef<HTMLCanvasElement | null>(null);
  const wxsCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const wxsPartsRef = useRef<Float32Array | null>(null);
  const wxsCountRef = useRef(0);
  const wxsDprRef = useRef(1);
  const wxuLastRasterRef = useRef(0);
  const wxGridRef = useRef<WeatherGridSeries | null>(null); // grille nationale dense (points pour l'IDW)
  // Séries par pas horaire (une Float32Array par heure) : national / monde × T, u, v, précip.
  const natTRef = useRef<Float32Array[]>([]);
  const natURef = useRef<Float32Array[]>([]);
  const natVRef = useRef<Float32Array[]>([]);
  const natPRef = useRef<Float32Array[]>([]);
  const wldTRef = useRef<Float32Array[]>([]);
  const wldURef = useRef<Float32Array[]>([]);
  const wldVRef = useRef<Float32Array[]>([]);
  const wldPRef = useRef<Float32Array[]>([]);
  // Tampons du pas courant (mélange temporel), réutilisés d'une image à l'autre.
  const curRef = useRef<Record<"natT" | "natU" | "natV" | "natP" | "wldT" | "wldU" | "wldV" | "wldP", Float32Array | null>>({
    natT: null, natU: null, natV: null, natP: null, wldT: null, wldU: null, wldV: null, wldP: null,
  });
  // Étiquettes de température aux villes (DOM, au-dessus du point).
  const wxCityRef = useRef<{ mk: maplibregl.Marker; el: HTMLDivElement; lon: number; lat: number; minZoom: number }[]>([]);
  const wxAnimRef = useRef({ playing: true, idx: 0, lastInt: -2 });
  const [wxTimeIdx, setWxTimeIdx] = useState(0);
  const [wxPlaying, setWxPlaying] = useState(true);
  // --- menu contextuel (Maj + clic droit) + pop-up météo du point ---
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; ll: [number, number] } | null>(null);
  const [wxPopup, setWxPopup] = useState<{ ll: [number, number]; place: string | null } | null>(null);
  const role = useArgos((s) => s.role);
  const openWizard = useArgos((s) => s.openWizard);
  // Lecture position curseur : écriture directe dans le DOM (pas de state →
  // pas de re-rendu React à chaque mouvement de souris).
  const latRef = useRef<HTMLSpanElement | null>(null);
  const lngRef = useRef<HTMLSpanElement | null>(null);
  const altRef = useRef<HTMLSpanElement | null>(null);
  const altSeqRef = useRef(0);
  // Outil de mesure multi-points.
  const [measureOn, setMeasureOn] = useState(false);
  const [pts, setPts] = useState<[number, number][]>([]);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const measureOnRef = useRef(false);
  measureOnRef.current = measureOn;

  // abonnements qui doivent déclencher une re-synchro des marqueurs
  const layers = useArgos((s) => s.layers);
  const selMarker = useArgos((s) => s.selMarker);
  const incidents = useArgos((s) => s.incidents);
  const fieldHosps = useArgos((s) => s.fieldHosps);
  const aircraft = useArgos((s) => s.aircraft);
  const map3d = useArgos((s) => s.map3d);
  const mapSat = useArgos((s) => s.mapSat);
  // Couche sismique (EMSC) : points colorés/dimensionnés par magnitude.
  const quakes = useArgos((s) => s.quakes);
  const quakesOn = useArgos((s) => s.quakesOn);
  const quakeFocus = useArgos((s) => s.quakeFocus);
  const focusQuake = useArgos((s) => s.focusQuake);
  const incidentFocus = useArgos((s) => s.incidentFocus);
  const incidentFocusAt = useArgos((s) => s.incidentFocusAt);
  const focusIncident = useArgos((s) => s.focusIncident);
  const mapCenterRequest = useArgos((s) => s.mapCenterRequest);
  const setMapCenter = useArgos((s) => s.setMapCenter);
  const quakeSelected = useArgos((s) => s.quakeSelected);
  // Panache NRBC (ADR 0005) : données + style de combinaison des référentiels.
  const plumeData = useArgos((s) => s.plumeData);
  const plumeModels = useArgos((s) => s.plumeModels);
  const plumeEnvelope = useArgos((s) => s.plumeEnvelope);
  const plumeIncidentId = useArgos((s) => s.plumeIncidentId);
  const wxGrid = useArgos((s) => s.wxGrid);
  const wxWorld = useArgos((s) => s.wxWorld);
  const wxLayers = useArgos((s) => s.wxLayers);
  const lang = useArgos((s) => s.lang);
  const t = useDict();

  const mkEl = (html: string, kind: MarkerKind, id: string) => {
    const el = document.createElement("div");
    el.innerHTML = html;
    el.style.cursor = "pointer";
    // Marqueurs agrandis (lisibilité console/terrain) sans casser l'ancrage :
    // on met à l'échelle le contenu, pas l'élément positionné par MapLibre.
    const inner = el.firstElementChild as HTMLElement | null;
    if (inner) inner.style.transform = "scale(1.4)";
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      useArgos.getState().select(kind, id);
    });
    return el;
  };

  const syncMarkers = () => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const state = useArgos.getState();
    const L = state.layers;
    const sm = state.selMarker;
    const isSel = (kind: MarkerKind, id: string) => !!sm && sm.kind === kind && sm.id === id;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    vehMarkersRef.current.forEach((v) => v.mk.remove());
    vehMarkersRef.current = [];

    const add = (ll: [number, number], el: HTMLElement) => {
      const mk = new maplibregl.Marker({ element: el }).setLngLat(ll).addTo(map);
      markersRef.current.push(mk);
    };

    if (L.units) useArgos.getState().units.forEach((u) => add(u.ll, mkEl(unitMarkerHTML(u, isSel("unit", u.id)), "unit", u.id)));
    // Santé : deux couches distinctes (militaire / civil) — le réseau civil
    // compte plus de cent établissements et se masque d'un seul interrupteur.
    // Le civil est posé d'abord pour que les hôpitaux militaires, réseau de
    // commandement, restent au-dessus dans les villes où les deux coexistent.
    const hosps = useArgos.getState().hospitals;
    const addHosp = (h: (typeof hosps)[number]) => add(h.ll, mkEl(hospMarkerHTML(h, isSel("hosp", h.id)), "hosp", h.id));
    if (L.hospitalsCiv) hosps.filter((h) => hospKind(h) !== "mil").forEach(addHosp);
    if (L.hospitals) hosps.filter((h) => hospKind(h) === "mil").forEach(addHosp);
    if (L.field) state.fieldHosps.forEach((f) => add(fieldLL(f), mkEl(fieldMarkerHTML(f, isSel("field", f.nom)), "field", f.nom)));
    if (L.incidents) state.incidents.forEach((i) => add(i.ll, mkEl(incMarkerHTML(i, isSel("inc", i.id)), "inc", i.id)));

    if (L.vehicles) {
      useArgos.getState().vehRoutes.forEach((v, routeIndex) => {
        const el = mkEl(vehMarkerHTML(v, isSel("veh", v.id)), "veh", v.id);
        const start = vehPos(v.route, vehProgRef.current[routeIndex]);
        const mk = new maplibregl.Marker({ element: el }).setLngLat(start).addTo(map);
        vehMarkersRef.current.push({ mk, routeIndex });
      });
    }

    // Les aéronefs ne passent PAS par cette reconstruction : ils bougent en
    // continu, alors que `syncMarkers` détruit et recrée l'intégralité des
    // marqueurs (unités, centaines d'hôpitaux, incidents). Les rebâtir à chaque
    // rafraîchissement de position ferait clignoter toute la carte. Ils ont leur
    // propre registre, déplacé par `setLngLat`. Voir l'effet « suivi aérien ».

    if (map.getLayer("routes-line")) {
      map.setLayoutProperty("routes-line", "visibility", L.vehicles ? "visible" : "none");
    }
  };

  const startVehAnim = () => {
    let last = performance.now();
    let lastPulse = 0;
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      vehMarkersRef.current.forEach(({ mk, routeIndex }) => {
        const v = useArgos.getState().vehRoutes[routeIndex];
        vehProgRef.current[routeIndex] = (vehProgRef.current[routeIndex] + v.speed * dt) % 1;
        mk.setLngLat(vehPos(v.route, vehProgRef.current[routeIndex]));
      });
      // Pulsation « ping sonar » de la couche sismique (throttle ~15 fps).
      if (now - lastPulse > 66) {
        lastPulse = now;
        const map = mapRef.current;
        if (map && map.getLayer("quakes-pulse")) {
          const tt = (now % 1800) / 1800; // 0 → 1
          map.setPaintProperty("quakes-pulse", "circle-radius", ["*", 1 + tt * 1.6, QUAKE_HALO_R]);
          map.setPaintProperty("quakes-pulse", "circle-opacity", 0.4 * (1 - tt));
        }
        // Étiquettes de villes : visibilité selon couche température + zoom.
        if (map) syncCityVisibility();
      }
      // Animation météo : fait défiler la semaine de prévision (1 s par heure),
      // raster interpolé en continu, particules de vent advectées en temps réel.
      const wl = useArgos.getState().wxLayers;
      const clock = natTRef.current.length > 1 ? natTRef.current : wldTRef.current;
      if ((wl.temp || wl.wind || wl.precip) && clock.length > 1) {
        const wa = wxAnimRef.current;
        if (wa.playing) wa.idx = (wa.idx + dt / 1.0) % (clock.length - 1);
        // Rasters throttlés (le mélange horaire n'a pas besoin de 60 im/s).
        if ((wl.temp || wl.precip) && now - wxuLastRasterRef.current > WXU_RASTER_MS) {
          wxuLastRasterRef.current = now;
          drawWxuRasters(wl.temp, wl.precip);
        }
        if (wl.wind) stepWxsWind(Math.min(dt, 0.05)); // dt borné (retour d'onglet)
        const it = Math.min(Math.floor(wa.idx), clock.length - 1);
        if (it !== wa.lastInt) {
          wa.lastInt = it;
          applyWxStep(it);
          setWxTimeIdx(it);
        }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
  };

  /** Mélange temporel du pas fractionnaire courant d'une série ; null si vide. */
  const blendSteps = (steps: Float32Array[], buf: Float32Array | null): Float32Array | null => {
    if (steps.length === 0) return null;
    const last = steps.length - 1;
    const a = Math.min(Math.floor(wxAnimRef.current.idx), last);
    const f = Math.min(wxAnimRef.current.idx - a, 1);
    const A = steps[a], B = steps[Math.min(a + 1, last)];
    const out = buf && buf.length === A.length ? buf : new Float32Array(A.length);
    for (let i = 0; i < A.length; i++) out[i] = A[i] + (B[i] - A[i]) * f;
    return out;
  };

  /**
   * Échantillon du champ au point [lon, lat] : bilinéaire mondial, fondu avec
   * l'IDW de la grille dense nationale à l'approche du territoire (natBlend).
   */
  const sampleField = (nat: Float32Array | null, wld: Float32Array | null, lon: number, lat: number): number => {
    const g = wxGridRef.current;
    const f = nat && g && g.points.length > 0 ? natBlend(lon, lat) : 0;
    // NaN si aucune donnée ne couvre le point : le pixel reste transparent et
    // la particule est recyclée (pas de faux 0 °C / vent nul).
    const w = wld ? wxgSample(wld, lon, lat) : NaN;
    if (f <= 0) return w;
    const n = natIdw(g!.points, nat!, lon, lat);
    return wld ? n * f + w * (1 - f) : n;
  };

  // Rasters température + précipitations : UNE boucle de pixels planétaire
  // (latitude par ligne en Mercator inverse), partagée par les deux champs.
  // Redessinée au plus toutes les WXU_RASTER_MS (throttle dans la boucle rAF).
  const drawWxuRasters = (tempOn: boolean, precipOn: boolean) => {
    const cur = curRef.current;
    const natT = tempOn ? (cur.natT = blendSteps(natTRef.current, cur.natT)) : null;
    const wldT = tempOn ? (cur.wldT = blendSteps(wldTRef.current, cur.wldT)) : null;
    const natP = precipOn ? (cur.natP = blendSteps(natPRef.current, cur.natP)) : null;
    const wldP = precipOn ? (cur.wldP = blendSteps(wldPRef.current, cur.wldP)) : null;
    const doTemp = tempOn && (natT !== null || wldT !== null);
    const doPrecip = precipOn && (natP !== null || wldP !== null);
    if (!doTemp && !doPrecip) return;
    let tD: Uint8ClampedArray | null = null, pD: Uint8ClampedArray | null = null;
    if (doTemp) {
      const cv = wxuTempCvRef.current;
      if (cv) {
        if (!wxuTempCtxRef.current) wxuTempCtxRef.current = cv.getContext("2d");
        if (wxuTempCtxRef.current && !wxuTempImgRef.current) wxuTempImgRef.current = wxuTempCtxRef.current.createImageData(WXU_W, WXU_H);
        tD = wxuTempImgRef.current?.data ?? null;
      }
    }
    if (doPrecip) {
      const cv = wxuPrecipCvRef.current;
      if (cv) {
        if (!wxuPrecipCtxRef.current) wxuPrecipCtxRef.current = cv.getContext("2d");
        if (wxuPrecipCtxRef.current && !wxuPrecipImgRef.current) wxuPrecipImgRef.current = wxuPrecipCtxRef.current.createImageData(WXU_W, WXU_H);
        pD = wxuPrecipImgRef.current?.data ?? null;
      }
    }
    if (!tD && !pD) return;
    const scale = (WX_LUT_N - 1) / (WX_T_MAX - WX_T_MIN);
    const yTop = wxMercY(WXG_B.maxLat), yBot = wxMercY(WXG_B.minLat);
    let p = 0;
    for (let r = 0; r < WXU_H; r++) {
      const ym = yTop - ((r + 0.5) / WXU_H) * (yTop - yBot);
      const lat = (Math.atan(Math.exp(ym)) * 2 - Math.PI / 2) * (180 / Math.PI);
      for (let c = 0; c < WXU_W; c++, p++) {
        const lon = WXG_B.minLon + ((c + 0.5) / WXU_W) * 360;
        const q = p * 4;
        if (tD) {
          const v = sampleField(natT, wldT, lon, lat);
          if (Number.isNaN(v)) { tD[q + 3] = 0; }
          else {
          let li = ((v - WX_T_MIN) * scale) | 0;
          if (li < 0) li = 0; else if (li > WX_LUT_N - 1) li = WX_LUT_N - 1;
          const l3 = li * 3;
          tD[q] = WX_LUT[l3]; tD[q + 1] = WX_LUT[l3 + 1]; tD[q + 2] = WX_LUT[l3 + 2]; tD[q + 3] = 255;
          }
        }
        if (pD) {
          const pv = sampleField(natP, wldP, lon, lat);
          if (Number.isNaN(pv)) { pD[q + 3] = 0; }
          else {
          let pr = Math.round(pv);
          if (pr < 0) pr = 0; else if (pr > 100) pr = 100;
          const b = pr * 4;
          pD[q] = WXP_LUT[b]; pD[q + 1] = WXP_LUT[b + 1]; pD[q + 2] = WXP_LUT[b + 2]; pD[q + 3] = WXP_LUT[b + 3];
          }
        }
      }
    }
    if (tD && wxuTempCtxRef.current && wxuTempImgRef.current) wxuTempCtxRef.current.putImageData(wxuTempImgRef.current, 0, 0);
    if (pD && wxuPrecipCtxRef.current && wxuPrecipImgRef.current) wxuPrecipCtxRef.current.putImageData(wxuPrecipImgRef.current, 0, 0);
  };

  /** (Re)dimensionne le canvas vent écran sur son conteneur + réamorce les particules. */
  const sizeWxsCanvas = () => {
    const cv = wxsCvRef.current, host = containerRef.current;
    if (!cv || !host) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    wxsDprRef.current = dpr;
    const w = Math.max(1, Math.round(host.clientWidth * dpr));
    const h = Math.max(1, Math.round(host.clientHeight * dpr));
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
      wxsCtxRef.current = null;
      wxsPartsRef.current = null; // réamorçage à la nouvelle géométrie
    }
    wxsCountRef.current = Math.min(WXS_MAX, Math.round(host.clientWidth * host.clientHeight * WXS_PER_PX));
  };

  // Vent : particules en ESPACE ÉCRAN — traits nets (~1 px écran) et densité
  // constante à TOUT zoom. Advection : dé-projection de chaque particule puis
  // échantillonnage du champ u/v fondu (national dense ↔ mondial).
  const stepWxsWind = (dt: number) => {
    const map = mapRef.current, cv = wxsCvRef.current;
    if (!map || !cv || cv.width === 0) return;
    let ctx = wxsCtxRef.current;
    if (!ctx) { ctx = cv.getContext("2d"); if (!ctx) return; wxsCtxRef.current = ctx; }
    const W = cv.width, H = cv.height;
    // Carte en mouvement : les positions écran perdent leur ancrage géographique
    // → on efface et on laisse le champ se reformer (comportement Windy).
    if (map.isMoving()) {
      ctx.clearRect(0, 0, W, H);
      return;
    }
    const cur = curRef.current;
    const natU = (cur.natU = blendSteps(natURef.current, cur.natU));
    const natV = (cur.natV = blendSteps(natVRef.current, cur.natV));
    const wldU = (cur.wldU = blendSteps(wldURef.current, cur.wldU));
    const wldV = (cur.wldV = blendSteps(wldVRef.current, cur.wldV));
    if (!natU && !wldU) return;
    const dpr = wxsDprRef.current;
    const count = wxsCountRef.current;
    let P = wxsPartsRef.current;
    if (!P) {
      P = new Float32Array(WXS_MAX * 4); // x, y, âge, durée de vie (px appareil)
      for (let i = 0; i < WXS_MAX; i++) {
        P[i * 4] = Math.random() * W;
        P[i * 4 + 1] = Math.random() * H;
        P[i * 4 + 2] = Math.random() * 4;
        P[i * 4 + 3] = 2.5 + Math.random() * 3.5;
      }
      wxsPartsRef.current = P;
    }
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0,0,0,0.02)";
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
    ctx.lineCap = "round";
    // Vitesse visuelle : suit le zoom (bornée) — vive au zoom national, posée
    // à l'échelle planétaire. En px CSS par (km/h)·s.
    const z = map.getZoom();
    const S = Math.max(0.12, Math.min(4.5, 0.45 * Math.pow(2, z - 4))) * dpr;
    // Rotation de la carte (boussole) : le nord n'est plus « écran vers le haut ».
    const B = (-map.getBearing() * Math.PI) / 180;
    const cosB = Math.cos(B), sinB = Math.sin(B);
    for (let i = 0; i < count; i++) {
      const o = i * 4;
      const x = P[o], y = P[o + 1];
      const ll = map.unproject([x / dpr, y / dpr]);
      // Hors de l'emprise des données (lat > 70° / < -60°) : recyclage.
      if (ll.lat > WXG_B.maxLat || ll.lat < WXG_B.minLat) {
        P[o] = Math.random() * W; P[o + 1] = Math.random() * H; P[o + 2] = 0;
        continue;
      }
      const u = sampleField(natU, wldU, ll.lng, ll.lat);
      const v = sampleField(natV, wldV, ll.lng, ll.lat);
      if (Number.isNaN(u) || Number.isNaN(v)) {
        P[o] = Math.random() * W; P[o + 1] = Math.random() * H; P[o + 2] = 0;
        continue;
      }
      const nx = x + (u * cosB - v * sinB) * S * dt;
      const ny = y - (v * cosB + u * sinB) * S * dt;
      P[o + 2] += dt;
      if (P[o + 2] > P[o + 3] || nx < 0 || nx >= W || ny < 0 || ny >= H) {
        P[o] = Math.random() * W; P[o + 1] = Math.random() * H; P[o + 2] = 0;
        continue;
      }
      const sp = Math.sqrt(u * u + v * v);
      // Vent quasi nul : recyclage (pas d'amas de points immobiles).
      if (sp < 0.6 && Math.random() < 0.02) {
        P[o] = Math.random() * W; P[o + 1] = Math.random() * H; P[o + 2] = 0;
        continue;
      }
      // Trait TOUJOURS fin à l'écran (px CSS × dpr) — jamais agrandi par le zoom.
      ctx.lineWidth = (0.9 + Math.min(0.6, sp / 70)) * dpr;
      ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.6, 0.14 + sp / 85)})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      P[o] = nx; P[o + 1] = ny;
    }
  };

  // Étiquettes de température AUX VILLES (au-dessus du point) — remplace
  // l'ancienne matrice de chiffres de la grille. Villes nationales visibles au
  // zoom ≥ 4 ; grandes villes mondiales toujours (elles sont clairsemées).
  const buildCityLabels = () => {
    const map = mapRef.current;
    if (!map || wxCityRef.current.length > 0) return;
    const mkCity = (name: string, lon: number, lat: number, minZoom: number) => {
      const root = document.createElement("div");
      root.style.cssText = "display:flex;flex-direction:column;align-items:center;pointer-events:none;";
      const t = document.createElement("div");
      t.style.cssText = "font:700 13px/1 -apple-system,system-ui,sans-serif;color:#fff;text-shadow:0 1px 3px rgba(8,18,11,.95),0 0 2px rgba(8,18,11,.95);";
      const n = document.createElement("div");
      n.style.cssText = "font:600 9px/1.4 -apple-system,system-ui,sans-serif;color:rgba(255,255,255,.85);text-shadow:0 1px 2px rgba(8,18,11,.95);";
      n.textContent = name;
      root.append(t, n);
      const m = new maplibregl.Marker({ element: root, anchor: "bottom", offset: [0, -2] }).setLngLat([lon, lat]).addTo(map);
      wxCityRef.current.push({ mk: m, el: t, lon, lat, minZoom });
    };
    for (const city of WX_CITIES) mkCity(city.name, city.lon, city.lat, city.minZoom);
    applyWxStep(Math.max(0, wxAnimRef.current.lastInt));
    syncCityVisibility();
  };

  /**
   * Applique l'état courant du panache NRBC : données, style de combinaison
   * (référentiel primaire rempli, secondaires en contour tireté) et enveloppe
   * prudente (tout rouge, remplissage intégral). Appelée par setupStyle (le
   * changement de fond repose le style) et par l'effet plumeData/plumeModels.
   */
  const applyPlume = () => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("nrbc-plume") as maplibregl.GeoJSONSource | undefined;
    if (!src || !map.getLayer("nrbc-plume-fill")) return;
    const { plumeData, plumeModels, plumeEnvelope, plumeIncidentId } = useArgos.getState();
    const empty = { type: "FeatureCollection" as const, features: [] };
    src.setData(plumeIncidentId && plumeData ? (plumeData.fc as GeoJSON.FeatureCollection) : empty);

    // Cadrage sur l'emprise RÉELLE des zones, une seule fois par panache : à
    // l'échelle nationale un panache de quelques kilomètres est un point
    // invisible. On ne recadre pas aux changements d'échéance ou de
    // référentiel — l'opérateur garde la main sur sa caméra ensuite.
    if (plumeIncidentId && plumeData && fitPlumeRef.current !== plumeIncidentId) {
      const rings = plumeData.fc.features.flatMap((f) => f.geometry.coordinates[0]);
      if (rings.length > 0) {
        const lons = rings.map((p) => p[0]);
        const lats = rings.map((p) => p[1]);
        map.fitBounds(
          [
            [Math.min(...lons), Math.min(...lats)],
            [Math.max(...lons), Math.max(...lats)],
          ],
          // Marge à gauche : le panneau NRBC (300 px) recouvre la carte au-delà de `lg`.
          { padding: { top: 80, bottom: 80, left: map.getContainer().clientWidth >= 1024 ? 380 : 60, right: 60 }, duration: 900, maxZoom: 13 },
        );
        fitPlumeRef.current = plumeIncidentId;
      }
    }
    if (!plumeIncidentId) fitPlumeRef.current = null;
    // Primaire = premier référentiel actif (ordre de l'ADR : ATP-45 puis ERG).
    const primary = plumeModels.atp45 ? "atp45" : "erg";
    if (plumeEnvelope) {
      // Enveloppe prudente : directive de STYLE, pas d'union géométrique —
      // toutes les zones remplies de la même teinte, plus de hiérarchie.
      map.setPaintProperty("nrbc-plume-fill", "fill-color", "#EF4444");
      map.setPaintProperty("nrbc-plume-line", "line-color", "#EF4444");
      map.setFilter("nrbc-plume-fill", null);
      map.setFilter("nrbc-plume-line", null);
      map.setFilter("nrbc-plume-line-2", ["==", ["get", "model"], "__none__"]);
    } else {
      map.setPaintProperty("nrbc-plume-fill", "fill-color", PLUME_LEVEL_COLOR);
      map.setPaintProperty("nrbc-plume-line", "line-color", PLUME_LEVEL_COLOR);
      map.setFilter("nrbc-plume-fill", ["==", ["get", "model"], primary]);
      map.setFilter("nrbc-plume-line", ["==", ["get", "model"], primary]);
      map.setFilter("nrbc-plume-line-2", ["!=", ["get", "model"], primary]);
    }
  };

  /** Visibilité des étiquettes de villes : couche température + zoom (nationales ≥ 4). */
  const syncCityVisibility = () => {
    const on = useArgos.getState().wxLayers.temp;
    const z = mapRef.current?.getZoom() ?? 2;
    for (const c of wxCityRef.current) {
      c.mk.getElement().style.display = on && z >= c.minZoom ? "" : "none";
    }
  };

  /** Applique un pas horaire : met à jour la température affichée sur chaque ville. */
  const applyWxStep = (s: number) => {
    const natT = natTRef.current, wldT = wldTRef.current;
    const nat = natT.length ? natT[Math.min(Math.max(0, s), natT.length - 1)] : null;
    const wld = wldT.length ? wldT[Math.min(Math.max(0, s), wldT.length - 1)] : null;
    if (!nat && !wld) return;
    for (const c of wxCityRef.current) {
      c.el.textContent = `${Math.round(sampleField(nat, wld, c.lon, c.lat))}°`;
    }
  };

  // --- initialisation de la carte (une fois) ---
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      // Clone profond : MapLibre MUTE l'objet style qu'on lui passe — réutiliser
      // le module MAP_STYLE tel quel casse toute reconstruction de la carte
      // (remontage React/Fast Refresh → carte sans style).
      style: structuredClone(MAP_STYLE),
      center: MAP_CENTER,
      zoom: MAP_ZOOM,
      pitch: 0,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    // Canvas vent en espace écran : inséré dans le conteneur de canvas MapLibre
    // juste APRÈS le canvas WebGL (les marqueurs DOM, ajoutés ensuite, restent
    // au-dessus). Aucune interception de la souris.
    const wxsCv = document.createElement("canvas");
    wxsCv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;";
    const ccont = map.getCanvasContainer();
    ccont.insertBefore(wxsCv, ccont.children[1] ?? null);
    wxsCvRef.current = wxsCv;
    wxsCtxRef.current = null;
    wxsPartsRef.current = null;
    wxsCv.style.display = useArgos.getState().wxLayers.wind ? "" : "none";
    sizeWxsCanvas();
    // Diagnostic dev : trace les erreurs internes MapLibre (style, sources) —
    // les 403 de tuiles sont attendus sous étranglement CDN, le reste non.
    if (process.env.NODE_ENV !== "production") {
      map.on("error", (e) => console.error("[MapLibre]", (e as { error?: Error }).error?.message ?? e));
    }
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");

    // Bouton « recentrer » ajouté sous la boussole (revient au cadrage national).
    const centerCtrl: maplibregl.IControl = {
      onAdd() {
        const div = document.createElement("div");
        div.className = "maplibregl-ctrl maplibregl-ctrl-group";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.title = "Recentrer";
        btn.setAttribute("aria-label", "Recentrer");
        btn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin:auto"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><path d="M12 1.5v3 M12 19.5v3 M1.5 12h3 M19.5 12h3"/></svg>`;
        btn.addEventListener("click", () => map.easeTo({ center: MAP_CENTER, zoom: MAP_ZOOM, pitch: 0, bearing: 0, duration: 900 }));
        div.appendChild(btn);
        return div;
      },
      onRemove() {},
    };
    map.addControl(centerCtrl, "bottom-right");

    // (Maj + clic droit : géré par onContextMenu sur le conteneur React —
    // indépendant du pipeline d'événements interne de MapLibre.)

    // Lecture continue de la position du curseur (+ altitude via le MNT).
    map.on("mousemove", (e) => {
      if (latRef.current) latRef.current.textContent = `${e.lngLat.lat.toFixed(5)}°`;
      if (lngRef.current) lngRef.current.textContent = `${e.lngLat.lng.toFixed(5)}°`;
      // Altitude : échantillon MNT (asynchrone, tuiles mises en cache).
      const seq = ++altSeqRef.current;
      void demElevation(e.lngLat.lng, e.lngLat.lat).then((alt) => {
        if (seq !== altSeqRef.current || !altRef.current) return; // résultat périmé
        altRef.current.textContent = alt == null ? "—" : `${Math.round(alt)} m`;
      });
    });

    // Clic sur la carte : en mode mesure → ajoute un point ; sinon → sélectionne
    // un séisme si le clic tombe sur un marqueur (bandeau de détail).
    map.on("click", (e) => {
      if (measureOnRef.current) {
        setPts((prev) => [...prev, [e.lngLat.lng, e.lngLat.lat]]);
        return;
      }
      if (!map.getLayer("quakes-circle")) return;
      const hit = map.queryRenderedFeatures(e.point, { layers: ["quakes-circle"] })[0];
      const id = hit?.properties?.id;
      if (typeof id === "string") {
        const q = useArgos.getState().quakes.find((x) => x.id === id);
        if (q) useArgos.getState().selectQuake(q);
      }
    });

    // Les marqueurs sont des surcouches DOM indépendantes du chargement des
    // tuiles : on les ajoute tout de suite — la carte reste utilisable même là où
    // les tuiles de fond externes sont lentes ou injoignables (air-gap, réseaux restreints).
    readyRef.current = true;
    syncMarkers();
    startVehAnim();

    // La ligne d'itinéraires + terrain + bascules de fond ont besoin du style
    // analysé. On s'accroche au premier signal de disponibilité (`styledata` se
    // déclenche sans tuiles).
    const setupStyle = () => {
      // Seul le style JSON doit être prêt (getStyle) — PAS les tuiles
      // (isStyleLoaded) : sous étranglement du CDN, isStyleLoaded peut rester
      // faux très longtemps alors qu'addSource fonctionne déjà. Un appel trop
      // précoce lève « Style is not done loading » : attrapé par trySetup,
      // retenté par le filet.
      if (!map.getStyle()) return;
      // Accès console dev : seule l'instance VIVANTE arrive ici (les doubles
      // montages StrictMode sont retirés avant que leur style ne charge).
      if (process.env.NODE_ENV !== "production") {
        (window as unknown as { __map?: maplibregl.Map }).__map = map;
      }
      if (!map.getSource("routes")) {
        map.addSource("routes", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: useArgos.getState().vehRoutes.map((v) => ({
              type: "Feature" as const,
              properties: { id: v.id },
              geometry: { type: "LineString" as const, coordinates: v.route },
            })),
          },
        });
        map.addLayer({
          id: "routes-line",
          type: "line",
          source: "routes",
          paint: { "line-color": "#C9A84C", "line-width": 4.5, "line-dasharray": [2, 2], "line-opacity": 0.95 },
        });
      }
      // Couche de mesure (polyligne + sommets).
      if (!map.getSource("measure")) {
        map.addSource("measure", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({
          id: "measure-line",
          type: "line",
          source: "measure",
          filter: ["==", "$type", "LineString"],
          paint: { "line-color": "#38BDF8", "line-width": 4, "line-dasharray": [1.5, 1] },
        });
        map.addLayer({
          id: "measure-pt",
          type: "circle",
          source: "measure",
          filter: ["==", "$type", "Point"],
          paint: { "circle-radius": 6, "circle-color": "#38BDF8", "circle-stroke-color": "#0f1f14", "circle-stroke-width": 2.5 },
        });
      }
      // Couches météo UNIFIÉES : 3 canvas planétaires — température et
      // précipitations SOUS les repères (« lbl »), vent au-dessus. Un seul
      // style homogène sur toute la carte (posées avant la couche sismique).
      if (!map.getSource("wxu-temp-src")) {
        const wxuCoords = [
          [WXG_B.minLon, WXG_B.maxLat],
          [WXG_B.maxLon, WXG_B.maxLat],
          [WXG_B.maxLon, WXG_B.minLat],
          [WXG_B.minLon, WXG_B.minLat],
        ];
        const mkCv = (w = WXU_W, h = WXU_H) => {
          const cv = document.createElement("canvas");
          cv.width = w;
          cv.height = h;
          return cv;
        };
        const under = map.getLayer("lbl") ? "lbl" : map.getLayer("routes-line") ? "routes-line" : undefined;
        const tcv = mkCv();
        wxuTempCvRef.current = tcv;
        wxuTempCtxRef.current = null;
        wxuTempImgRef.current = null;
        map.addSource("wxu-temp-src", { type: "canvas", canvas: tcv, animate: true, coordinates: wxuCoords } as unknown as maplibregl.SourceSpecification);
        map.addLayer(
          {
            id: "wx-temp",
            type: "raster",
            source: "wxu-temp-src",
            layout: { visibility: "none" },
            // Opacité modérée : le champ se lit SANS masquer terrain et toponymes.
            paint: { "raster-opacity": 0.52, "raster-fade-duration": 0 },
          },
          under,
        );
        const pcv = mkCv();
        wxuPrecipCvRef.current = pcv;
        wxuPrecipCtxRef.current = null;
        wxuPrecipImgRef.current = null;
        map.addSource("wxu-precip-src", { type: "canvas", canvas: pcv, animate: true, coordinates: wxuCoords } as unknown as maplibregl.SourceSpecification);
        map.addLayer(
          {
            id: "wx-precip",
            type: "raster",
            source: "wxu-precip-src",
            layout: { visibility: "none" },
            // L'alpha est déjà porté par la palette (0 % → transparent).
            paint: { "raster-opacity": 1, "raster-fade-duration": 0 },
          },
          under,
        );
        // (Le vent est un canvas DOM en espace écran — voir stepWxsWind.)
        // Visibilité initiale + étiquettes de villes + premier rendu si les
        // grilles étaient déjà chargées (le style peut arriver APRÈS les données).
        const wl = useArgos.getState().wxLayers;
        for (const [id, on] of [["wx-temp", wl.temp], ["wx-precip", wl.precip]] as const) {
          map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
        }
        if (wxsCvRef.current) wxsCvRef.current.style.display = wl.wind ? "" : "none";
        buildCityLabels();
        wxuLastRasterRef.current = 0; // force un premier redessin des rasters
      }
      // Couche sismique (EMSC) : marqueur distinct — anneau pulsé (ping sonar)
      // + point plein bordé, couleur/rayon pilotés par la magnitude.
      if (!map.getSource("quakes")) {
        map.addSource("quakes", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        // Anneau de pulsation (rayon/opacité animés dans la boucle rAF).
        map.addLayer({
          id: "quakes-pulse",
          type: "circle",
          source: "quakes",
          paint: {
            "circle-radius": QUAKE_HALO_R,
            "circle-color": QUAKE_COLOR,
            "circle-opacity": 0.3,
          },
        });
        // Point plein bordé de blanc (plus gros qu'avant).
        map.addLayer({
          id: "quakes-circle",
          type: "circle",
          source: "quakes",
          paint: {
            "circle-radius": QUAKE_DOT_R,
            "circle-color": QUAKE_COLOR,
            "circle-opacity": 0.95,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
          },
        });
        // Alimentation initiale (les séismes peuvent déjà être chargés).
        const qs = useArgos.getState();
        (map.getSource("quakes") as maplibregl.GeoJSONSource).setData({
          type: "FeatureCollection",
          features: qs.quakes.map((q) => ({ type: "Feature" as const, properties: { mag: q.mag, id: q.id }, geometry: { type: "Point" as const, coordinates: q.ll } })),
        });
        const qvis = qs.quakesOn ? "visible" : "none";
        map.setLayoutProperty("quakes-pulse", "visibility", qvis);
        map.setLayoutProperty("quakes-circle", "visibility", qvis);
        // Curseur main au survol d'un séisme (indique qu'il est cliquable).
        if (!quakeBound.current) {
          map.on("mouseenter", "quakes-circle", () => { map.getCanvas().style.cursor = "pointer"; });
          map.on("mouseleave", "quakes-circle", () => { map.getCanvas().style.cursor = measureOnRef.current ? "crosshair" : ""; });
          quakeBound.current = true;
        }
      }
      // Panache NRBC (ADR 0005) : zones remplies + contours. Le référentiel
      // « primaire » est rempli, les secondaires en contour tireté — l'effet
      // d'alimentation (plumeData) pilote données, filtres et opacités.
      if (!map.getSource("nrbc-plume")) {
        map.addSource("nrbc-plume", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({
          id: "nrbc-plume-fill",
          type: "fill",
          source: "nrbc-plume",
          paint: { "fill-color": PLUME_LEVEL_COLOR, "fill-opacity": 0.25 },
        });
        map.addLayer({
          id: "nrbc-plume-line",
          type: "line",
          source: "nrbc-plume",
          paint: { "line-color": PLUME_LEVEL_COLOR, "line-width": 1.5, "line-opacity": 0.9 },
        });
        // Référentiels secondaires : contour tireté, sans remplissage (le
        // dasharray ne pouvant pas être piloté par feature, couche séparée).
        map.addLayer({
          id: "nrbc-plume-line-2",
          type: "line",
          source: "nrbc-plume",
          filter: ["==", ["get", "model"], "__none__"],
          paint: { "line-color": PLUME_LEVEL_COLOR, "line-width": 2, "line-dasharray": [2, 2], "line-opacity": 0.9 },
        });
        applyPlume(); // un panache déjà actif survit au changement de fond de carte
      }
      const st = useArgos.getState();
      map.setLayoutProperty("routes-line", "visibility", st.layers.vehicles ? "visible" : "none");
      applyBase(st.mapSat);
      // Terrain toujours posé (exagération nulle en 2D) → altitude interrogeable.
      apply3d(st.map3d);
    };
    // isStyleLoaded peut basculer entre la garde et un addSource (tuiles en
    // re-tentative) : toute exécution est enveloppée, le filet retente.
    const trySetup = () => { try { setupStyle(); } catch { /* style pas prêt — retenté par le filet */ } };
    if (map.isStyleLoaded()) trySetup();
    else {
      map.on("styledata", trySetup);
      map.once("load", trySetup);
    }
    // Filet : quand le CDN de tuiles étrangle (403 en re-tentative), « load »
    // peut ne jamais venir alors que le style est prêt et que « styledata » est
    // passé trop tôt (garde isStyleLoaded fausse). On retente jusqu'à ce que
    // les sources soient réellement posées.
    const setupTimer = setInterval(() => {
      if (map.getSource("wxu-temp-src")) { clearInterval(setupTimer); return; }
      trySetup();
    }, 600);

    // Le conteneur change de taille (plein écran, repli du rail) → resize du canvas.
    const ro = new ResizeObserver(() => { mapRef.current?.resize(); sizeWxsCanvas(); });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      clearInterval(setupTimer);
      cancelAnimationFrame(rafRef.current);
      readyRef.current = false;
      wxCityRef.current.forEach((c) => c.mk.remove());
      wxCityRef.current = [];
      wxsCvRef.current?.remove();
      wxsCvRef.current = null;
      map.remove();
      // Ne pas laisser l'accès console dev pointer sur une instance retirée
      // (double-montage StrictMode).
      const w = window as unknown as { __map?: maplibregl.Map };
      if (w.__map === map) delete w.__map;
      mapRef.current = null;
      markersRef.current = [];
      vehMarkersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- re-synchro des marqueurs si données / sélection / couche changent ---
  useEffect(() => {
    syncMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, selMarker, incidents, fieldHosps]);

  // --- suivi aérien : interrogation du flux ---
  // Le minuteur s'arrête dès que la couche est masquée, pour ne pas consommer
  // de quota au profit d'une carte que personne ne regarde.
  useEffect(() => {
    if (!layers.aircraft) return;
    const load = () => void useArgos.getState().loadAircraft();
    load();
    const timer = window.setInterval(load, ACFT_POLL_MS);
    return () => window.clearInterval(timer);
  }, [layers.aircraft]);

  // --- suivi aérien : marqueurs propres + navigation à l'estime ---
  //
  // Le flux public ne livre un point que toutes les 10 s environ. Attendre le
  // point suivant laisserait le marqueur figé puis le ferait sauter ; on avance
  // donc la position estimée à cadence d'affichage, entre deux contacts.
  //
  // L'effet ne dépend QUE de la visibilité de la couche : la boucle relit l'état
  // du store à chaque image, donc inutile de la reconstruire quand les positions
  // changent.
  useEffect(() => {
    const map = mapRef.current;
    const registry = acftMarkersRef.current;
    const dropAll = () => {
      registry.forEach((e) => e.mk.remove());
      registry.clear();
    };
    if (!map || !layers.aircraft) {
      dropAll();
      return;
    }

    const render = () => {
      const now = Date.now();
      const st = useArgos.getState();
      const sel = st.selMarker;
      const vus = new Set<string>();

      st.aircraft.forEach((a) => {
        // Sans écho, pas de position : l'appareil reste listé dans le panneau
        // mais n'est pas placé sur la carte.
        if (!a.position) return;
        const id = a.aircraft.id;
        vus.add(id);

        const est = extrapolate(a.position, now);
        let entry = registry.get(id);
        if (!entry) {
          const el = mkEl("", "acft", id);
          const mk = new maplibregl.Marker({ element: el }).setLngLat(est.ll).addTo(map);
          entry = { mk, el, html: "" };
          registry.set(id, entry);
        }

        // Le balisage n'est réécrit que s'il change réellement (cap, état,
        // sélection) : réécrire innerHTML à chaque image saccaderait le rendu.
        const html = acftMarkerHTML(
          a.aircraft.label,
          a.aircraft.role,
          a.status,
          a.position.heading,
          sel?.kind === "acft" && sel.id === id,
          est.ageSec > ACFT_STALE_S,
        );
        if (html !== entry.html) {
          entry.el.innerHTML = html;
          // `mkEl` agrandit le contenu à la création ; réécrire le balisage
          // remplace cet enfant, il faut donc réappliquer l'échelle.
          const inner = entry.el.firstElementChild as HTMLElement | null;
          if (inner) inner.style.transform = "scale(1.4)";
          entry.html = html;
        }
        entry.mk.setLngLat(est.ll);
      });

      // Appareils retirés du suivi ou ayant perdu leur écho.
      registry.forEach((entry, id) => {
        if (!vus.has(id)) {
          entry.mk.remove();
          registry.delete(id);
        }
      });
    };

    render();
    const timer = window.setInterval(render, ACFT_FRAME_MS);
    return () => {
      window.clearInterval(timer);
      dropAll();
    };
  }, [layers.aircraft]);

  // --- recentrage/zoom sur l'élément sélectionné (ex. « voir sur la carte ») ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selMarker) return;
    const st = useArgos.getState();
    const ll =
      selMarker.kind === "inc" ? st.incidents.find((i) => i.id === selMarker.id)?.ll
      : selMarker.kind === "unit" ? st.units.find((u) => u.id === selMarker.id)?.ll
      : selMarker.kind === "hosp" ? st.hospitals.find((h) => h.id === selMarker.id)?.ll
      : undefined;
    if (ll) map.flyTo({ center: ll, zoom: Math.max(map.getZoom(), 10.5), duration: 1200 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selMarker]);

  // --- bascule terrain 3D ---
  const apply3d = (on: boolean) => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    // Relief 3D uniquement en mode 3D (l'altitude sous le curseur est lue
    // séparément via un échantillonnage direct du MNT, cf. demElevation).
    // La bascule 2D/3D ne fait qu'INCLINER la vue : le centre, le zoom et le cap
    // sont conservés, on reste donc exactement là où l'opérateur regardait.
    if (on) {
      if (!map.getTerrain()) map.setTerrain({ source: "dem", exaggeration: 1.4 });
      map.easeTo({ pitch: 60, duration: 900 });
    } else {
      map.setTerrain(null);
      map.easeTo({ pitch: 0, duration: 700 });
    }
  };
  useEffect(() => {
    if (readyRef.current) apply3d(map3d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map3d]);

  // --- bascule du fond (satellite / plan) ---
  const applyBase = (sat: boolean) => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    map.setLayoutProperty("sat", "visibility", sat ? "visible" : "none");
    map.setLayoutProperty("plan", "visibility", sat ? "none" : "visible");
    map.setLayoutProperty("lbl", "visibility", sat ? "visible" : "none");
  };
  useEffect(() => {
    if (readyRef.current) applyBase(mapSat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapSat]);

  // --- couche sismique : mise à jour des données + visibilité ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const src = map.getSource("quakes") as maplibregl.GeoJSONSource | undefined;
    if (!src) return; // source posée par setupStyle (populée à ce moment-là)
    src.setData({
      type: "FeatureCollection",
      features: quakes.map((q) => ({ type: "Feature" as const, properties: { mag: q.mag, id: q.id }, geometry: { type: "Point" as const, coordinates: q.ll } })),
    });
    const vis = quakesOn ? "visible" : "none";
    if (map.getLayer("quakes-circle")) map.setLayoutProperty("quakes-circle", "visibility", vis);
    if (map.getLayer("quakes-pulse")) map.setLayoutProperty("quakes-pulse", "visibility", vis);
  }, [quakes, quakesOn]);

  // --- panache NRBC : données + style au fil des choix de l'opérateur ---
  useEffect(() => {
    if (readyRef.current) applyPlume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plumeData, plumeModels, plumeEnvelope, plumeIncidentId]);

  // --- grille NATIONALE dense chargée : séries par pas + villes + rendu ---
  useEffect(() => {
    wxGridRef.current = wxGrid;
    natTRef.current = [];
    natURef.current = [];
    natVRef.current = [];
    natPRef.current = [];
    if (wxGrid && wxGrid.times.length > 0 && wxGrid.points.length > 0) {
      // Une Float32Array par heure (mélange temporel rapide dans la boucle rAF) ;
      // u/v plutôt que des caps (pas de saut 350°→10° à l'interpolation).
      natTRef.current = wxGrid.times.map((_, s) => Float32Array.from(wxGrid.points, (pt) => pt.temp[s] ?? 0));
      natURef.current = wxGrid.times.map((_, s) => Float32Array.from(wxGrid.points, (pt) => wxToUV(pt, s, "u")));
      natVRef.current = wxGrid.times.map((_, s) => Float32Array.from(wxGrid.points, (pt) => wxToUV(pt, s, "v")));
      natPRef.current = wxGrid.times.map((_, s) => Float32Array.from(wxGrid.points, (pt) => pt.precipProb[s] ?? 0));
    }
    const wa = wxAnimRef.current;
    wa.idx = 0;
    wa.lastInt = -2;
    buildCityLabels();
    applyWxStep(0);
    setWxTimeIdx(0);
    wxuLastRasterRef.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wxGrid]);

  // --- re-tentative des grilles météo : si une couche est active alors qu'une
  // grille manque (API/Open-Meteo indisponible au moment de l'activation), on
  // recharge toutes les 30 s jusqu'à couverture complète du globe. ---
  useEffect(() => {
    const anyOn = wxLayers.temp || wxLayers.wind || wxLayers.precip;
    if (!anyOn || (wxGrid && wxWorld)) return;
    void useArgos.getState().loadWxGrid();
    const id = setInterval(() => void useArgos.getState().loadWxGrid(), 30_000);
    return () => clearInterval(id);
  }, [wxLayers, wxGrid, wxWorld]);

  // --- grille MONDIALE chargée : séries par pas + rendu ---
  useEffect(() => {
    wldTRef.current = [];
    wldURef.current = [];
    wldVRef.current = [];
    wldPRef.current = [];
    if (wxWorld && wxWorld.times.length > 0 && wxWorld.points.length > 0) {
      wldTRef.current = wxWorld.times.map((_, s) => Float32Array.from(wxWorld.points, (pt) => pt.temp[s] ?? 0));
      wldURef.current = wxWorld.times.map((_, s) => Float32Array.from(wxWorld.points, (pt) => wxToUV(pt, s, "u")));
      wldVRef.current = wxWorld.times.map((_, s) => Float32Array.from(wxWorld.points, (pt) => wxToUV(pt, s, "v")));
      wldPRef.current = wxWorld.times.map((_, s) => Float32Array.from(wxWorld.points, (pt) => pt.precipProb[s] ?? 0));
    }
    buildCityLabels();
    applyWxStep(Math.max(0, wxAnimRef.current.lastInt));
    wxuLastRasterRef.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wxWorld]);

  // --- visibilité des couches météo (raster, flèches, précip, étiquettes) ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    ([["wx-temp", wxLayers.temp], ["wx-precip", wxLayers.precip]] as const)
      .forEach(([id, on]) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
      });
    const wcv = wxsCvRef.current;
    if (wcv) {
      wcv.style.display = wxLayers.wind ? "" : "none";
      if (!wxLayers.wind) wxsCtxRef.current?.clearRect(0, 0, wcv.width, wcv.height);
    }
    syncCityVisibility();
  }, [wxLayers]);

  // --- centrage sur un séisme (« voir sur la carte ») puis purge du focus ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !quakeFocus) return;
    map.flyTo({ center: quakeFocus.ll, zoom: Math.max(map.getZoom(), 6.5), duration: 1400 });
    focusQuake(null);
  }, [quakeFocus, focusQuake]);

  // --- centrage sur un incident (Copilot / modale « Voir sur la carte »)
  // Inclut `incidentFocusAt` : ce compteur change CHAQUE demande, ce qui permet
  // au useEffect de se déclencher aussi quand MapCanvas monte (route /map
  // visitée APRÈS focusIncident appelé sur une autre page comme /dashboard).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !incidentFocus) return;
    const ll = incidentFocus.ll;
    if (!ll || ll.length !== 2) { focusIncident(null); return; }
    map.flyTo({ center: ll, zoom: Math.max(map.getZoom(), 10), duration: 1300 });
    focusIncident(null);
  }, [incidentFocus, incidentFocusAt, focusIncident]);

  // --- centrage GÉNÉRIQUE carte: Copilot zone/ville ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapCenterRequest) return;
    const { ll, zoom } = mapCenterRequest;
    if (!ll || ll.length !== 2) { setMapCenter(null); return; }
    map.flyTo({ center: ll, zoom: Math.max(map.getZoom(), zoom), duration: 1200 });
    setMapCenter(null); // consume request
  }, [mapCenterRequest, setMapCenter]);

  // --- bandeau de détail COLLÉ au séisme sélectionné (popup ancrée au point) ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    quakePopupRef.current?.remove();
    quakePopupRef.current = null;
    if (!quakeSelected) return;
    const q = quakeSelected;
    const fx = FLUX[lang];
    const mc = qMagHex(q.mag);
    const el = document.createElement("div");
    el.style.width = "300px";
    el.innerHTML = `
      <div style="display:flex;gap:10px;align-items:flex-start;padding:12px">
        <span style="display:inline-flex;min-width:44px;justify-content:center;align-items:center;border-radius:8px;padding:4px 8px;font-weight:700;font-family:monospace;background:${mc.bg};color:${mc.fg}">${q.mag.toFixed(1)}</span>
        <div style="min-width:0;flex:1;color:#fff">
          <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(q.region)}</div>
          <div style="margin-top:6px;font-family:monospace;font-size:11px;line-height:1.6;color:rgba(255,255,255,.72)">
            ${fx.seis_col_depth}: ${Math.round(Math.abs(q.depth))} ${fx.seis_km} · ${fx.seis_agency}: ${esc(q.agency)}<br/>
            ${fx.seis_local}: ${qLocalTime(q.time, lang)}<br/>
            ${q.lat.toFixed(3)}, ${q.lon.toFixed(3)}
          </div>
        </div>
        <button data-close aria-label="fermer" style="background:none;border:none;color:rgba(255,255,255,.6);cursor:pointer;padding:2px;font-size:15px;line-height:1">&#10005;</button>
      </div>`;
    el.querySelector("[data-close]")?.addEventListener("click", () => useArgos.getState().selectQuake(null));
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 20, maxWidth: "320px", className: "quake-popup" })
      .setLngLat(q.ll)
      .setDOMContent(el)
      .addTo(map);
    quakePopupRef.current = popup;
    return () => { popup.remove(); };
  }, [quakeSelected, lang]);

  // --- calcul d'itinéraire (réseau routier) à chaque changement de points ---
  useEffect(() => {
    if (pts.length < 2) { setRoute(null); return; }
    let cancelled = false;
    void routeThrough(pts).then((r) => { if (!cancelled) setRoute(r); });
    return () => { cancelled = true; };
  }, [pts]);

  // --- couche de mesure : tracé de l'itinéraire + sommets saisis ---
  useEffect(() => {
    const src = mapRef.current?.getSource("measure") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const line = route?.coords ?? pts;
    src.setData({
      type: "FeatureCollection",
      features: [
        ...(line.length > 1
          ? [{ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: line } }]
          : []),
        ...pts.map((p) => ({ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: p } })),
      ],
    });
  }, [pts, route]);

  // Curseur en croix tant que la mesure est active.
  useEffect(() => {
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = measureOn ? "crosshair" : "";
  }, [measureOn]);

  const panel = "rounded-lg px-2.5 py-1.5 text-[11px] shadow-lg";
  const movePt = (i: number, d: number) =>
    setPts((p) => {
      const j = i + d;
      if (j < 0 || j >= p.length) return p;
      const n = [...p];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const removePt = (i: number) => setPts((p) => p.filter((_, k) => k !== i));
  const stepBtn = "rounded p-0.5 text-white/60 transition-colors hover:text-or-400 disabled:opacity-25";

  return (
    <div
      className="absolute inset-0"
      onContextMenu={(e) => {
        // Maj + clic droit : menu contextuel du point visé.
        if (!e.shiftKey) return;
        e.preventDefault();
        const map = mapRef.current, host = containerRef.current;
        if (!map || !host) return;
        const rect = host.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
        const ll = map.unproject([x, y]);
        setCtxMenu({ x, y, ll: [ll.lng, ll.lat] });
      }}
    >
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      {/* Ligne de temps météo façon Windy : étirée, centrée en bas de la carte,
          jours cliquables + curseur sur le dégradé de température. Position
          centrale = aucun chevauchement avec les contrôles (droite) ni les
          panneaux de mesure/coordonnées (gauche). */}
      {(wxLayers.temp || wxLayers.precip || wxLayers.wind) && wxGrid && wxGrid.times.length > 1 && (
        <div
          className="pointer-events-auto absolute z-20 rounded-xl px-3 py-2"
          style={{ ...OVERLAY_STYLE, bottom: 10, left: "50%", transform: "translateX(-50%)", width: "min(680px, 58%)", minWidth: 340 }}
        >
          {/* Jours (cliquer saute à la mi-journée) */}
          <div className="mb-1.5 flex items-stretch gap-1">
            {wxDays(wxGrid.times, lang).map((d) => {
              const active = (wxGrid.times[wxTimeIdx] ?? "").startsWith(d.date);
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => { wxAnimRef.current.idx = d.idx; wxAnimRef.current.lastInt = -2; setWxTimeIdx(d.idx); }}
                  className={`min-w-0 flex-1 truncate rounded-md px-1 py-0.5 text-[12px] font-semibold transition-colors ${
                    active ? "bg-or-500 text-rdia-600" : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
          {/* Lecture + curseur (piste = dégradé de température) + horodatage */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => { const p = !wxPlaying; setWxPlaying(p); wxAnimRef.current.playing = p; }}
              className="shrink-0 rounded-md bg-white/10 px-2.5 py-1 text-[13px] font-bold text-white/90 transition-colors hover:bg-white/20"
              aria-label={wxPlaying ? FLUX[lang].wx_pause : FLUX[lang].wx_play}
              title={wxPlaying ? FLUX[lang].wx_pause : FLUX[lang].wx_play}
            >
              {wxPlaying ? "❚❚" : "▶"}
            </button>
            <div className="min-w-0 flex-1">
              <input
                type="range"
                min={0}
                max={wxGrid.times.length - 1}
                step={1}
                value={wxTimeIdx}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  wxAnimRef.current.idx = v;
                  wxAnimRef.current.lastInt = -2; // force la ré-application du pas
                  setWxTimeIdx(v);
                }}
                className="wx-range w-full"
                style={{ background: wxLayers.temp ? WX_GRADIENT : "rgba(255,255,255,.22)" }}
                aria-label={FLUX[lang].wx_forecast}
              />
              {/* Graduation : chaque couleur de la piste ↔ sa température */}
              {wxLayers.temp && (
                <div className="relative mt-0.5 h-3 font-mono text-[9px] leading-none text-white/65">
                  {[-10, 0, 10, 20, 30, 40, 46].map((tp) => {
                    const pc = ((tp - WX_T_MIN) / (WX_T_MAX - WX_T_MIN)) * 100;
                    return (
                      <span
                        key={tp}
                        className="absolute"
                        style={pc < 3 ? { left: 0 } : pc > 97 ? { right: 0 } : { left: `${pc}%`, transform: "translateX(-50%)" }}
                      >
                        {tp}°
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            <span className="shrink-0 whitespace-nowrap font-mono text-[12px] text-white/85">
              {wxFmtTime(wxGrid.times[wxTimeIdx] ?? "", lang)}
            </span>
          </div>
          {/* Échelles compactes des couches actives */}
          {(wxLayers.wind || wxLayers.precip) && (
            <div className="mt-1 flex items-center justify-center gap-4 font-mono text-[10px] text-white/60">
              {wxLayers.wind && <span>{FLUX[lang].wx_wind}</span>}
              {wxLayers.precip && <span>{FLUX[lang].wx_precip_prob} 0-100 %</span>}
            </div>
          )}
        </div>
      )}

      {/* Menu contextuel (Maj + clic droit) : actions sur le point visé */}
      {ctxMenu && (
        <>
          <div
            className="absolute inset-0 z-40"
            onClick={() => setCtxMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }}
          />
          <div
            className="absolute z-50 w-[250px] overflow-hidden rounded-xl py-1.5 shadow-2xl"
            style={{
              ...OVERLAY_STYLE,
              left: Math.min(ctxMenu.x, (containerRef.current?.clientWidth ?? 9999) - 264),
              top: Math.min(ctxMenu.y, (containerRef.current?.clientHeight ?? 9999) - 140),
            }}
          >
            {canReportIncident(role) && (
              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-start text-[14px] font-semibold text-white/90 transition-colors hover:bg-white/10"
                onClick={() => { openWizard(ctxMenu.ll); setCtxMenu(null); }}
              >
                <Icon path={UI_ICONS.plus} size={16} className="shrink-0 text-or-400" />
                {t.report}
              </button>
            )}
            <button
              type="button"
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-start text-[14px] font-semibold text-white/90 transition-colors hover:bg-white/10"
              onClick={() => {
                // Si le clic tombe dans la zone d'une ville (≤ 35 km), la
                // pop-up est titrée de son nom plutôt que des coordonnées.
                setWxPopup({ ll: ctxMenu.ll, place: nearestCity(ctxMenu.ll[0], ctxMenu.ll[1])?.name ?? null });
                setCtxMenu(null);
              }}
            >
              <Icon path={NAV_ICONS.weather} size={16} className="shrink-0 text-or-400" />
              {FLUX[lang].wx_here}
            </button>
            <div className="border-t border-white/10 px-3.5 pb-1 pt-1.5 font-mono text-[11px] text-white/50">
              {ctxMenu.ll[1].toFixed(4)}, {ctxMenu.ll[0].toFixed(4)}
            </div>
          </div>
        </>
      )}

      {/* Pop-up de prévisions météo du point sélectionné */}
      {wxPopup && <WeatherPopup ll={wxPopup.ll} place={wxPopup.place} onClose={() => setWxPopup(null)} />}

      {/* Points de mesure : réordonner (↑/↓) et supprimer (✕) */}
      {pts.length > 0 && (
        <div className="absolute z-10 flex w-[220px] flex-col gap-1 rounded-lg p-2 shadow-lg" style={{ ...OVERLAY_STYLE, bottom: 84, insetInlineStart: 8 }}>
          <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-white/60">{t.map_points}</div>
          {pts.map((p, i) => (
            <div key={`${p[0]},${p[1]},${i}`} className="flex items-center gap-1 text-[10px] text-white/90">
              <span className="w-3 shrink-0 font-bold text-or-400">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-mono">{p[1].toFixed(4)}, {p[0].toFixed(4)}</span>
              <button onClick={() => movePt(i, -1)} disabled={i === 0} className={stepBtn} aria-label={t.map_points}>
                <Icon path={UI_ICONS.caretDown} size={11} strokeWidth={2.5} className="rotate-180" />
              </button>
              <button onClick={() => movePt(i, 1)} disabled={i === pts.length - 1} className={stepBtn} aria-label={t.map_points}>
                <Icon path={UI_ICONS.caretDown} size={11} strokeWidth={2.5} />
              </button>
              <button onClick={() => removePt(i)} className="rounded p-0.5 text-danger-400 transition-colors hover:text-danger-300" aria-label={t.flt_clear}>
                <Icon path={UI_ICONS.close} size={11} strokeWidth={2.5} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Outil de mesure (multi-points, itinéraire routier) */}
      <div className="absolute z-10 flex items-center gap-1.5" style={{ bottom: 46, insetInlineStart: 8 }}>
        <button
          onClick={() => setMeasureOn((o) => !o)}
          className={`${panel} font-bold transition-colors ${measureOn ? "bg-or-500 text-rdia-600" : "text-white/90 hover:text-or-400"}`}
          style={measureOn ? undefined : OVERLAY_STYLE}
        >
          {t.map_measure}
        </button>
        {route && (
          <span className={`${panel} font-mono text-white/90`} style={OVERLAY_STYLE}>
            {route.km.toFixed(1)} km
            {route.min != null ? ` · ${route.min} min` : ""}
            <span className={route.road ? "text-or-400" : "text-white/50"}> · {route.road ? t.map_route : t.map_direct}</span>
          </span>
        )}
        {pts.length > 0 && (
          <button onClick={() => { setPts([]); setRoute(null); }} className={`${panel} font-semibold text-danger-400 hover:text-danger-300`} style={OVERLAY_STYLE}>
            {t.flt_clear}
          </button>
        )}
        {measureOn && pts.length === 0 && (
          <span className={`${panel} text-white/70`} style={OVERLAY_STYLE}>{t.map_measure_hint}</span>
        )}
      </div>

      {/* Position du curseur : latitude / longitude / altitude */}
      <div
        className={`pointer-events-none absolute z-10 flex items-center gap-3 font-mono text-white/90 ${panel}`}
        style={{ ...OVERLAY_STYLE, bottom: 8, insetInlineStart: 8 }}
      >
        <span className="flex gap-1"><span className="text-or-400">{t.wz_lat}</span><span ref={latRef}>—</span></span>
        <span className="flex gap-1"><span className="text-or-400">{t.wz_lng}</span><span ref={lngRef}>—</span></span>
        <span className="flex gap-1"><span className="text-or-400">{t.map_alt}</span><span ref={altRef}>—</span></span>
      </div>
    </div>
  );
}
