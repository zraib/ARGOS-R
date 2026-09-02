// ============================================================================
// components/map/layers/weather.ts — les couches météo de la carte
//
// Rasters température / précipitations (canvas planétaires), particules de
// vent en espace écran, étiquettes de villes, séries par pas horaire. Tout
// l'état vit dans un `WeatherRuntime` (un objet, pas vingt-cinq refs) que le
// composant tient dans un `useRef` ; les fonctions ici sont IMPÉRATIVES et
// sans React : elles reçoivent la carte et l'objet, rien d'autre.
// Code déplacé verbatim depuis MapCanvas.tsx (R-7).
// ============================================================================

import maplibregl from "maplibre-gl";
import { useArgos } from "@/lib/store";
import { WX_CITIES } from "@/lib/map/cities";
import type { WeatherGridSeries } from "@/lib/types";
import { wxMercY, WX_T_MIN, WX_LUT, natIdw, natBlend, WXP_LUT, WX_LUT_N, WX_T_MAX } from "@/lib/map/canvas/weather-raster";
import { WXG_B } from "@/lib/map/canvas/weather-grid";
import { WXU_W, WXU_H, WXS_MAX, WXS_PER_PX, WXU_RASTER_MS, wxgSample, wxToUV } from "@/lib/map/canvas/weather-render";

/** Tout ce que le rendu météo garde entre deux images. */
export class WeatherRuntime {
  wxsCv: HTMLCanvasElement | null = null;
  wxsCtx: CanvasRenderingContext2D | null = null;
  wxsParts: Float32Array | null = null;
  wxsCount: number = 0;
  wxsDpr: number = 1;
  wxuTempCv: HTMLCanvasElement | null = null;
  wxuTempCtx: CanvasRenderingContext2D | null = null;
  wxuTempImg: ImageData | null = null;
  wxuPrecipCv: HTMLCanvasElement | null = null;
  wxuPrecipCtx: CanvasRenderingContext2D | null = null;
  wxuPrecipImg: ImageData | null = null;
  wxuLastRaster: number = 0;
  grid: WeatherGridSeries | null = null;
  natT: Float32Array[] = [];
  natU: Float32Array[] = [];
  natV: Float32Array[] = [];
  natP: Float32Array[] = [];
  wldT: Float32Array[] = [];
  wldU: Float32Array[] = [];
  wldV: Float32Array[] = [];
  wldP: Float32Array[] = [];
  cur: Record<"natT" | "natU" | "natV" | "natP" | "wldT" | "wldU" | "wldV" | "wldP", Float32Array | null> = {
    natT: null, natU: null, natV: null, natP: null, wldT: null, wldU: null, wldV: null, wldP: null,
  };
  cities: { mk: maplibregl.Marker; el: HTMLDivElement; lon: number; lat: number; minZoom: number }[] = [];
  anim: { playing: boolean; idx: number; lastInt: number } = { playing: true, idx: 0, lastInt: -2 };
}

/** Mélange temporel du pas fractionnaire courant d'une série ; null si vide. */
export function blendSteps(rt: WeatherRuntime, steps: Float32Array[], buf: Float32Array | null): Float32Array | null {
  if (steps.length === 0) return null;
  const last = steps.length - 1;
  const a = Math.min(Math.floor(rt.anim.idx), last);
  const f = Math.min(rt.anim.idx - a, 1);
  const A = steps[a], B = steps[Math.min(a + 1, last)];
  const out = buf && buf.length === A.length ? buf : new Float32Array(A.length);
  for (let i = 0; i < A.length; i++) out[i] = A[i] + (B[i] - A[i]) * f;
  return out;
}

/**
 * Échantillon du champ au point [lon, lat] : bilinéaire mondial, fondu avec
 * l'IDW de la grille dense nationale à l'approche du territoire (natBlend).
 */
export function sampleField(rt: WeatherRuntime, nat: Float32Array | null, wld: Float32Array | null, lon: number, lat: number): number {
  const g = rt.grid;
  const f = nat && g && g.points.length > 0 ? natBlend(lon, lat) : 0;
  // NaN si aucune donnée ne couvre le point : le pixel reste transparent et
  // la particule est recyclée (pas de faux 0 °C / vent nul).
  const w = wld ? wxgSample(wld, lon, lat) : NaN;
  if (f <= 0) return w;
  const n = natIdw(g!.points, nat!, lon, lat);
  return wld ? n * f + w * (1 - f) : n;
}

// Rasters température + précipitations : UNE boucle de pixels planétaire
// (latitude par ligne en Mercator inverse), partagée par les deux champs.
// Redessinée au plus toutes les WXU_RASTER_MS (throttle dans la boucle rAF).
export function drawWxuRasters(rt: WeatherRuntime, tempOn: boolean, precipOn: boolean) {
  const cur = rt.cur;
  const natT = tempOn ? (cur.natT = blendSteps(rt, rt.natT, cur.natT)) : null;
  const wldT = tempOn ? (cur.wldT = blendSteps(rt, rt.wldT, cur.wldT)) : null;
  const natP = precipOn ? (cur.natP = blendSteps(rt, rt.natP, cur.natP)) : null;
  const wldP = precipOn ? (cur.wldP = blendSteps(rt, rt.wldP, cur.wldP)) : null;
  const doTemp = tempOn && (natT !== null || wldT !== null);
  const doPrecip = precipOn && (natP !== null || wldP !== null);
  if (!doTemp && !doPrecip) return;
  let tD: Uint8ClampedArray | null = null, pD: Uint8ClampedArray | null = null;
  if (doTemp) {
    const cv = rt.wxuTempCv;
    if (cv) {
      if (!rt.wxuTempCtx) rt.wxuTempCtx = cv.getContext("2d");
      if (rt.wxuTempCtx && !rt.wxuTempImg) rt.wxuTempImg = rt.wxuTempCtx.createImageData(WXU_W, WXU_H);
      tD = rt.wxuTempImg?.data ?? null;
    }
  }
  if (doPrecip) {
    const cv = rt.wxuPrecipCv;
    if (cv) {
      if (!rt.wxuPrecipCtx) rt.wxuPrecipCtx = cv.getContext("2d");
      if (rt.wxuPrecipCtx && !rt.wxuPrecipImg) rt.wxuPrecipImg = rt.wxuPrecipCtx.createImageData(WXU_W, WXU_H);
      pD = rt.wxuPrecipImg?.data ?? null;
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
        const v = sampleField(rt, natT, wldT, lon, lat);
        if (Number.isNaN(v)) { tD[q + 3] = 0; }
        else {
        let li = ((v - WX_T_MIN) * scale) | 0;
        if (li < 0) li = 0; else if (li > WX_LUT_N - 1) li = WX_LUT_N - 1;
        const l3 = li * 3;
        tD[q] = WX_LUT[l3]; tD[q + 1] = WX_LUT[l3 + 1]; tD[q + 2] = WX_LUT[l3 + 2]; tD[q + 3] = 255;
        }
      }
      if (pD) {
        const pv = sampleField(rt, natP, wldP, lon, lat);
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
  if (tD && rt.wxuTempCtx && rt.wxuTempImg) rt.wxuTempCtx.putImageData(rt.wxuTempImg, 0, 0);
  if (pD && rt.wxuPrecipCtx && rt.wxuPrecipImg) rt.wxuPrecipCtx.putImageData(rt.wxuPrecipImg, 0, 0);
}

/** (Re)dimensionne le canvas vent écran sur son conteneur + réamorce les particules. */
export function sizeWxsCanvas(rt: WeatherRuntime, host: HTMLElement | null) {
  const cv = rt.wxsCv;
  if (!cv || !host) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  rt.wxsDpr = dpr;
  const w = Math.max(1, Math.round(host.clientWidth * dpr));
  const h = Math.max(1, Math.round(host.clientHeight * dpr));
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
    rt.wxsCtx = null;
    rt.wxsParts = null; // réamorçage à la nouvelle géométrie
  }
  rt.wxsCount = Math.min(WXS_MAX, Math.round(host.clientWidth * host.clientHeight * WXS_PER_PX));
}

// Vent : particules en ESPACE ÉCRAN — traits nets (~1 px écran) et densité
// constante à TOUT zoom. Advection : dé-projection de chaque particule puis
// échantillonnage du champ u/v fondu (national dense ↔ mondial).
export function stepWxsWind(rt: WeatherRuntime, map: maplibregl.Map | null, dt: number) {
  const cv = rt.wxsCv;
  if (!map || !cv || cv.width === 0) return;
  let ctx = rt.wxsCtx;
  if (!ctx) { ctx = cv.getContext("2d"); if (!ctx) return; rt.wxsCtx = ctx; }
  const W = cv.width, H = cv.height;
  // Carte en mouvement : les positions écran perdent leur ancrage géographique
  // → on efface et on laisse le champ se reformer (comportement Windy).
  if (map.isMoving()) {
    ctx.clearRect(0, 0, W, H);
    return;
  }
  const cur = rt.cur;
  const natU = (cur.natU = blendSteps(rt, rt.natU, cur.natU));
  const natV = (cur.natV = blendSteps(rt, rt.natV, cur.natV));
  const wldU = (cur.wldU = blendSteps(rt, rt.wldU, cur.wldU));
  const wldV = (cur.wldV = blendSteps(rt, rt.wldV, cur.wldV));
  if (!natU && !wldU) return;
  const dpr = rt.wxsDpr;
  const count = rt.wxsCount;
  let P = rt.wxsParts;
  if (!P) {
    P = new Float32Array(WXS_MAX * 4); // x, y, âge, durée de vie (px appareil)
    for (let i = 0; i < WXS_MAX; i++) {
      P[i * 4] = Math.random() * W;
      P[i * 4 + 1] = Math.random() * H;
      P[i * 4 + 2] = Math.random() * 4;
      P[i * 4 + 3] = 2.5 + Math.random() * 3.5;
    }
    rt.wxsParts = P;
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
    const u = sampleField(rt, natU, wldU, ll.lng, ll.lat);
    const v = sampleField(rt, natV, wldV, ll.lng, ll.lat);
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
}

// Étiquettes de température AUX VILLES (au-dessus du point) — remplace
// l'ancienne matrice de chiffres de la grille. Villes nationales visibles au
// zoom ≥ 4 ; grandes villes mondiales toujours (elles sont clairsemées).
export function buildCityLabels(rt: WeatherRuntime, map: maplibregl.Map | null) {
    if (!map || rt.cities.length > 0) return;
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
    rt.cities.push({ mk: m, el: t, lon, lat, minZoom });
  };
  for (const city of WX_CITIES) mkCity(city.name, city.lon, city.lat, city.minZoom);
  applyWxStep(rt, Math.max(0, rt.anim.lastInt));
  syncCityVisibility(rt, map);
}

/** Visibilité des étiquettes de villes : couche température + zoom (nationales ≥ 4). */
export function syncCityVisibility(rt: WeatherRuntime, map: maplibregl.Map | null) {
  const on = useArgos.getState().wxLayers.temp;
  const z = map?.getZoom() ?? 2;
  for (const c of rt.cities) {
    c.mk.getElement().style.display = on && z >= c.minZoom ? "" : "none";
  }
}

/** Applique un pas horaire : met à jour la température affichée sur chaque ville. */
export function applyWxStep(rt: WeatherRuntime, s: number) {
  const natT = rt.natT, wldT = rt.wldT;
  const nat = natT.length ? natT[Math.min(Math.max(0, s), natT.length - 1)] : null;
  const wld = wldT.length ? wldT[Math.min(Math.max(0, s), wldT.length - 1)] : null;
  if (!nat && !wld) return;
  for (const c of rt.cities) {
    c.el.textContent = `${Math.round(sampleField(rt, nat, wld, c.lon, c.lat))}°`;
  }
}

/** Canvas vent en espace écran, inséré juste APRÈS le canvas WebGL. */
export function mountWindCanvas(rt: WeatherRuntime, map: maplibregl.Map, host: HTMLElement | null): void {
  // Canvas vent en espace écran : inséré dans le conteneur de canvas MapLibre
  // juste APRÈS le canvas WebGL (les marqueurs DOM, ajoutés ensuite, restent
  // au-dessus). Aucune interception de la souris.
  const wxsCv = document.createElement("canvas");
  wxsCv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;";
  const ccont = map.getCanvasContainer();
  ccont.insertBefore(wxsCv, ccont.children[1] ?? null);
  rt.wxsCv = wxsCv;
  rt.wxsCtx = null;
  rt.wxsParts = null;
  wxsCv.style.display = useArgos.getState().wxLayers.wind ? "" : "none";
  sizeWxsCanvas(rt, host);
}

/** Pose les couches raster météo (appelée par setupStyle ; idempotente). */
export function setupWeatherLayers(rt: WeatherRuntime, map: maplibregl.Map): void {
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
      rt.wxuTempCv = tcv;
      rt.wxuTempCtx = null;
      rt.wxuTempImg = null;
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
      rt.wxuPrecipCv = pcv;
      rt.wxuPrecipCtx = null;
      rt.wxuPrecipImg = null;
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
      if (rt.wxsCv) rt.wxsCv.style.display = wl.wind ? "" : "none";
      buildCityLabels(rt, map);
      rt.wxuLastRaster = 0; // force un premier redessin des rasters
    }
}

/** Grille NATIONALE dense chargée : séries par pas + villes + rendu. */
export function loadNationalSeries(rt: WeatherRuntime, map: maplibregl.Map | null, wxGrid: WeatherGridSeries | null, onStep: (i: number) => void): void {
  rt.grid = wxGrid;
  rt.natT = [];
  rt.natU = [];
  rt.natV = [];
  rt.natP = [];
  if (wxGrid && wxGrid.times.length > 0 && wxGrid.points.length > 0) {
    // Une Float32Array par heure (mélange temporel rapide dans la boucle rAF) ;
    // u/v plutôt que des caps (pas de saut 350°→10° à l'interpolation).
    rt.natT = wxGrid.times.map((_, s) => Float32Array.from(wxGrid.points, (pt) => pt.temp[s] ?? 0));
    rt.natU = wxGrid.times.map((_, s) => Float32Array.from(wxGrid.points, (pt) => wxToUV(pt, s, "u")));
    rt.natV = wxGrid.times.map((_, s) => Float32Array.from(wxGrid.points, (pt) => wxToUV(pt, s, "v")));
    rt.natP = wxGrid.times.map((_, s) => Float32Array.from(wxGrid.points, (pt) => pt.precipProb[s] ?? 0));
  }
  const wa = rt.anim;
  wa.idx = 0;
  wa.lastInt = -2;
  buildCityLabels(rt, map);
  applyWxStep(rt, 0);
  onStep(0);
  rt.wxuLastRaster = 0;
}

/** Grille MONDIALE chargée : séries par pas + rendu. */
export function loadWorldSeries(rt: WeatherRuntime, map: maplibregl.Map | null, wxWorld: WeatherGridSeries | null): void {
  rt.wldT = [];
  rt.wldU = [];
  rt.wldV = [];
  rt.wldP = [];
  if (wxWorld && wxWorld.times.length > 0 && wxWorld.points.length > 0) {
    rt.wldT = wxWorld.times.map((_, s) => Float32Array.from(wxWorld.points, (pt) => pt.temp[s] ?? 0));
    rt.wldU = wxWorld.times.map((_, s) => Float32Array.from(wxWorld.points, (pt) => wxToUV(pt, s, "u")));
    rt.wldV = wxWorld.times.map((_, s) => Float32Array.from(wxWorld.points, (pt) => wxToUV(pt, s, "v")));
    rt.wldP = wxWorld.times.map((_, s) => Float32Array.from(wxWorld.points, (pt) => pt.precipProb[s] ?? 0));
  }
  buildCityLabels(rt, map);
  applyWxStep(rt, Math.max(0, rt.anim.lastInt));
  rt.wxuLastRaster = 0;
}

/** Visibilité des couches météo (raster, flèches, précip, étiquettes). */
export function applyWeatherVisibility(rt: WeatherRuntime, map: maplibregl.Map, wxLayers: { temp: boolean; wind: boolean; precip: boolean }): void {
  ([["wx-temp", wxLayers.temp], ["wx-precip", wxLayers.precip]] as const)
    .forEach(([id, on]) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    });
  const wcv = rt.wxsCv;
  if (wcv) {
    wcv.style.display = wxLayers.wind ? "" : "none";
    if (!wxLayers.wind) rt.wxsCtx?.clearRect(0, 0, wcv.width, wcv.height);
  }
  syncCityVisibility(rt, map);
}

/** Un pas de la boucle d'animation : défilement des heures, rasters, vent. */
export function tickWeather(rt: WeatherRuntime, map: maplibregl.Map | null, dt: number, now: number, onStep: (i: number) => void): void {
  // Animation météo : fait défiler la semaine de prévision (1 s par heure),
  // raster interpolé en continu, particules de vent advectées en temps réel.
  const wl = useArgos.getState().wxLayers;
  const clock = rt.natT.length > 1 ? rt.natT : rt.wldT;
  if ((wl.temp || wl.wind || wl.precip) && clock.length > 1) {
    const wa = rt.anim;
    if (wa.playing) wa.idx = (wa.idx + dt / 1.0) % (clock.length - 1);
    // Rasters throttlés (le mélange horaire n'a pas besoin de 60 im/s).
    if ((wl.temp || wl.precip) && now - rt.wxuLastRaster > WXU_RASTER_MS) {
      rt.wxuLastRaster = now;
      drawWxuRasters(rt, wl.temp, wl.precip);
    }
    if (wl.wind) stepWxsWind(rt, map, Math.min(dt, 0.05)); // dt borné (retour d'onglet)
    const it = Math.min(Math.floor(wa.idx), clock.length - 1);
    if (it !== wa.lastInt) {
      wa.lastInt = it;
      applyWxStep(rt, it);
      onStep(it);
    }
  }
}
