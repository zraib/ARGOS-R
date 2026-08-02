// ============================================================================
// Altitude sous le curseur — échantillonnage direct du MNT « terrarium ».
//
// Volontairement indépendant du terrain 3D de MapLibre : `queryTerrainElevation`
// n'est fiable que si le mesh de terrain est monté (et renvoie 0 quand
// l'exagération est nulle). Ici la tuile PNG est lue directement.
//
// Encodage terrarium : altitude = R*256 + G + B/256 - 32768 (mètres).
// ============================================================================

import { DEFAULT_TILES } from "./style";

const DEM_Z = 11;
const demCache = new Map<string, ImageData | null>();

function lngLatToTile(lng: number, lat: number, z: number) {
  const n = 2 ** z;
  const fx = ((lng + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return {
    xt: Math.floor(fx),
    yt: Math.floor(fy),
    px: Math.min(255, Math.floor((fx % 1) * 256)),
    py: Math.min(255, Math.floor((fy % 1) * 256)),
  };
}

/**
 * Altitude en mètres au point donné, ou `null` si la tuile est injoignable.
 * Les tuiles lues sont mises en cache pour la durée de la page.
 */
export async function demElevation(lng: number, lat: number, tileTemplate: string = DEFAULT_TILES.dem): Promise<number | null> {
  if (typeof document === "undefined") return null;
  const { xt, yt, px, py } = lngLatToTile(lng, lat, DEM_Z);
  const key = `${tileTemplate}|${DEM_Z}/${xt}/${yt}`;
  if (!demCache.has(key)) {
    try {
      const url = tileTemplate
        .replace("{z}", String(DEM_Z))
        .replace("{x}", String(xt))
        .replace("{y}", String(yt));
      // Passer par fetch + blob : un <img crossOrigin> sur certains buckets ne
      // résout jamais, alors que fetch aboutit ; le blob étant same-origin, le
      // canvas n'est pas « tainted » et getImageData reste autorisé.
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
      demCache.set(key, null); // échec mémorisé : pas de nouvelle tentative
    }
  }
  const data = demCache.get(key);
  if (!data) return null;
  const i = (py * 256 + px) * 4;
  return data.data[i] * 256 + data.data[i + 1] + data.data[i + 2] / 256 - 32768;
}
