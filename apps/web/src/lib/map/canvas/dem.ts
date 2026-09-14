// ============================================================================
// lib/map/canvas/dem.ts — altitude par échantillonnage direct du MNT « terrarium »
// Fonctions PURES extraites de MapCanvas.tsx : aucun état React, aucune
// référence à la carte vivante. Testables seules (vitest).
// ============================================================================

import { demTileUrl } from "@/lib/map/tiles";

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

export async function demElevation(lng: number, lat: number): Promise<number | null> {
  const { xt, yt, px, py } = lngLatToTile(lng, lat, DEM_Z);
  const key = `${DEM_Z}/${xt}/${yt}`;
  if (!demCache.has(key)) {
    // Tuiles d'altitude : d'où vient le fond de carte (`demTileUrl`) — la
    // station en mode souverain, la source externe en développement. Sans
    // source, l'altitude affichée devient « — » plutôt que de révéler à un
    // tiers les points que l'opérateur interroge (ADR 0006).
    const url = demTileUrl(DEM_Z, xt, yt);
    if (!url) {
      demCache.set(key, null);
      return null;
    }
    try {
      // Passer par fetch + blob : un <img crossOrigin> sur ce bucket ne résout
      // pas, alors que fetch aboutit ; le blob est same-origin donc le canvas
      // n'est pas « tainted » et getImageData reste autorisé.
      const res = await fetch(url);
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
