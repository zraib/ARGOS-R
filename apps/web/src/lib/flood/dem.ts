"use client";

// ============================================================================
// ARGOS — chargement d'une grille d'altitude pour le simulateur d'inondation
//
// Les tuiles « terrarium » viennent d'où le fond de carte vient : le serveur
// de tuiles de la station en mode souverain, la source externe en
// développement — jamais d'un tiers en production (ADR 0006). Une tuile
// absente laisse ses cellules inconnues (NaN) : l'eau ne les traverse pas, et
// l'écran le dit.
// ============================================================================

import { demTileUrl } from "@/lib/map/tiles";
import { TILE, lngLatToTileFrac, type DemGrid } from "@/lib/flood/grid";

/** Décode une tuile terrarium en altitudes ; `null` si elle manque. */
async function tuile(z: number, x: number, y: number): Promise<Float32Array | null> {
  const url = demTileUrl(z, x, y);
  if (!url || typeof document === "undefined") return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bmp = await createImageBitmap(await res.blob());
    const c = document.createElement("canvas");
    c.width = TILE;
    c.height = TILE;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, TILE, TILE).data;
    const out = new Float32Array(TILE * TILE);
    for (let i = 0; i < out.length; i++) out[i] = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768;
    return out;
  } catch {
    return null;
  }
}

/**
 * La grille de `(2·radius + 1)²` tuiles centrée sur un point, au zoom voulu.
 * Rend `null` si AUCUNE tuile n'est disponible (source absente ou injoignable).
 */
export async function loadDemGrid(center: [number, number], z: number, radius: number): Promise<DemGrid | null> {
  const { x, y } = lngLatToTileFrac(center[0], center[1], z);
  const x0 = Math.floor(x) - radius;
  const y0 = Math.floor(y) - radius;
  const cote = 2 * radius + 1;
  const width = cote * TILE;
  const grid: DemGrid = { z, x0, y0, tx: cote, ty: cote, width, height: width, elev: new Float32Array(width * width).fill(NaN) };
  const taches: Promise<void>[] = [];
  let trouvees = 0;
  for (let ty = 0; ty < cote; ty++) {
    for (let tx = 0; tx < cote; tx++) {
      taches.push(
        tuile(z, x0 + tx, y0 + ty).then((data) => {
          if (!data) return;
          trouvees++;
          for (let py = 0; py < TILE; py++) {
            grid.elev.set(data.subarray(py * TILE, (py + 1) * TILE), (ty * TILE + py) * width + tx * TILE);
          }
        }),
      );
    }
  }
  await Promise.all(taches);
  return trouvees > 0 ? grid : null;
}
