// ============================================================================
// lib/map/satFallback.ts — imagerie souveraine : une tuile absente se fabrique
// depuis son parent (branche RIF, station sans Internet)
//
// L'imagerie hors ligne ne peut pas couvrir tout le Royaume à tous les zooms
// (Maroc à z19 : 800 millions de tuiles, 18 To — infra/geo/README.md) : le
// pays est stocké jusqu'à z13, les agglomérations et les communes plus finement,
// par zones. Un fournisseur en ligne, lui, répond à tous les zooms partout ; pour
// que l'expérience soit la même, la carte ne doit pas se vider quand l'opérateur
// zoome sur une zone où la tuile fine n'a pas été provisionnée.
//
// D'où ce protocole MapLibre (`iris-sat://{z}/{x}/{y}`) : la tuile est demandée
// à la station ; absente (404), on remonte à son parent, puis au parent du
// parent, jusqu'à en trouver une, dont on découpe et agrandit le quart utile.
// Sur-zoom flou plutôt que trou — c'est ce que fait MapLibre lui-même pour une
// source dont le `maxzoom` est uniforme, mais la couverture, ici, ne l'est pas.
// ============================================================================

import maplibregl from "maplibre-gl";

/** Le schéma d'URL branché sur MapLibre. */
export const SAT_PROTOCOL = "iris-sat";
/** Taille d'une tuile raster de la station (pixels). */
const TILE_PX = 256;
/** Au-delà de ce nombre de niveaux remontés, on renonce : l'image ne dirait plus rien. */
const MAX_CLIMB = 7;

let registered = false;
/** Tuiles parentes déjà décodées, pour les frères d'une même tuile absente (petit cache mémoire). */
const parents = new Map<string, Promise<ImageBitmap | null>>();
const PARENTS_MAX = 96;

/** Lit `iris-sat://z/x/y` ; `null` si l'URL n'a pas cette forme. */
export function parseSatUrl(url: string): { z: number; x: number; y: number } | null {
  const m = /^iris-sat:\/\/(\d+)\/(\d+)\/(\d+)(?:\.\w+)?$/.exec(url);
  if (!m) return null;
  return { z: Number(m[1]), x: Number(m[2]), y: Number(m[3]) };
}

/**
 * Le quart de la tuile parente `dz` niveaux au-dessus qui couvre la tuile
 * (z, x, y) : origine et taille en pixels du parent. Pure — testée.
 */
export function quadrantOf(x: number, y: number, dz: number): { sx: number; sy: number; size: number } {
  const n = 2 ** dz;
  const size = TILE_PX / n;
  return { sx: (x % n) * size, sy: (y % n) * size, size };
}

async function fetchTile(base: string, z: number, x: number, y: number, signal: AbortSignal): Promise<ArrayBuffer | null> {
  const res = await fetch(`${base}/sat/${z}/${x}/${y}`, { signal });
  if (res.status === 404 || res.status === 204) return null;
  if (!res.ok) throw new Error(`imagerie ${z}/${x}/${y} : HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  return buf.byteLength > 0 ? buf : null;
}

function parentBitmap(base: string, z: number, x: number, y: number, signal: AbortSignal): Promise<ImageBitmap | null> {
  const key = `${z}/${x}/${y}`;
  const cached = parents.get(key);
  if (cached) return cached;
  const p = fetchTile(base, z, x, y, signal).then((buf) => (buf ? createImageBitmap(new Blob([buf])) : null));
  parents.set(key, p);
  if (parents.size > PARENTS_MAX) parents.delete(parents.keys().next().value as string);
  // Un échec ne doit pas rester en cache : la prochaine demande retentera.
  p.catch(() => parents.delete(key));
  return p;
}

/** Découpe et agrandit le quart utile d'un parent en une tuile JPEG. */
async function upscale(parent: ImageBitmap, x: number, y: number, dz: number): Promise<ArrayBuffer> {
  const { sx, sy, size } = quadrantOf(x, y, dz);
  const canvas = new OffscreenCanvas(TILE_PX, TILE_PX);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("imagerie : canevas indisponible");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(parent, sx, sy, size, size, 0, 0, TILE_PX, TILE_PX);
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
  return blob.arrayBuffer();
}

/**
 * Branche le protocole sur MapLibre (idempotent). `base` : le serveur de tuiles
 * de la station, absolu (`sovereignBase()`). Rien ne part jamais ailleurs.
 */
export function registerSatFallback(base: string): void {
  if (registered) return;
  registered = true;
  maplibregl.addProtocol(SAT_PROTOCOL, async (params, abortController) => {
    const t = parseSatUrl(params.url);
    if (!t) throw new Error(`imagerie : URL inattendue ${params.url}`);
    const signal = abortController.signal;
    const direct = await fetchTile(base, t.z, t.x, t.y, signal);
    if (direct) return { data: direct };
    for (let dz = 1; dz <= MAX_CLIMB && t.z - dz >= 0; dz += 1) {
      const pz = t.z - dz;
      const parent = await parentBitmap(base, pz, t.x >> dz, t.y >> dz, signal);
      if (parent) return { data: await upscale(parent, t.x, t.y, dz) };
    }
    throw new Error(`imagerie : aucune tuile pour ${t.z}/${t.x}/${t.y}, ni au-dessus`);
  });
}

/** Pour les tests : oublie l'enregistrement et le cache. */
export function resetSatFallbackForTests(): void {
  registered = false;
  parents.clear();
}
