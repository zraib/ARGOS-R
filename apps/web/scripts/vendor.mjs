// ============================================================================
// scripts/vendor.mjs — copie dans public/vendor/ les ressources tierces que
// le navigateur charge à l'exécution, pour qu'elles soient AUTO-HÉBERGÉES
// (CSP `script-src 'self'`, aucun CDN) :
//   • mapbox-gl-rtl-text (BSD-2-Clause) — mise en forme de l'arabe dans les
//     étiquettes vectorielles de la carte (MapLibre le charge dans son worker).
//     Version FIGÉE à 0.2.3 (asm.js) : MapLibre 4 vérifie l'enregistrement du
//     greffon juste après `importScripts`, de façon synchrone ; les versions
//     0.3+/0.4 s'enregistrent après l'instanciation asynchrone de leur Wasm, et
//     MapLibre conclut « RTL Text Plugin failed to import scripts » — l'arabe
//     des étiquettes disparaît. Le build asm.js embarque tout (aucun .wasm,
//     aucune requête), donc aucun mot-clé Wasm dans la CSP.
// Lancé avant `next dev` et `next build` (scripts predev / prebuild).
// ============================================================================
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dest = join(root, "public", "vendor");
mkdirSync(dest, { recursive: true });
for (const [from, to] of [
  ["node_modules/@mapbox/mapbox-gl-rtl-text/mapbox-gl-rtl-text.min.js", "mapbox-gl-rtl-text.js"],
  ["node_modules/@mapbox/mapbox-gl-rtl-text/LICENSE.md", "mapbox-gl-rtl-text.LICENSE.md"],
]) {
  copyFileSync(join(root, from), join(dest, to));
}
