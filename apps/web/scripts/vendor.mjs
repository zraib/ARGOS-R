// ============================================================================
// scripts/vendor.mjs — copie dans public/vendor/ les ressources tierces que
// le navigateur charge à l'exécution, pour qu'elles soient AUTO-HÉBERGÉES
// (CSP `script-src 'self'`, aucun CDN) :
//   • mapbox-gl-rtl-text (BSD-2-Clause) — mise en forme de l'arabe dans les
//     étiquettes vectorielles de la carte (MapLibre le charge dans son worker).
// Lancé avant `next dev` et `next build` (scripts predev / prebuild).
// ============================================================================
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dest = join(root, "public", "vendor");
mkdirSync(dest, { recursive: true });
for (const [from, to] of [
  ["node_modules/@mapbox/mapbox-gl-rtl-text/dist/mapbox-gl-rtl-text.js", "mapbox-gl-rtl-text.js"],
  ["node_modules/@mapbox/mapbox-gl-rtl-text/LICENSE.md", "mapbox-gl-rtl-text.LICENSE.md"],
]) {
  copyFileSync(join(root, from), join(dest, to));
}
