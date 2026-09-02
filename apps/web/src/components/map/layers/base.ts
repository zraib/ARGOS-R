// ============================================================================
// components/map/layers/base.ts — bascules du fond (satellite / plan) et du
// terrain 3D. Code déplacé verbatim depuis MapCanvas.tsx (R-7).
// ============================================================================

import maplibregl from "maplibre-gl";

/**
 * Le style n'est pas prêt (tuiles en chargement, CDN qui étrangle) : la bascule
 * est REJOUÉE au prochain repos de la carte au lieu d'être perdue. Avant cela,
 * un clic sur « 3D » ou « Plan » pendant le chargement ne faisait rien, et rien
 * ne le disait (registre R-15). La dernière demande gagne : chaque appel
 * différé rejoue sa propre valeur, dans l'ordre des clics.
 */
function whenStyleReady(map: maplibregl.Map, apply: () => void): void {
  if (map.isStyleLoaded()) apply();
  else map.once("idle", apply);
}

// --- bascule terrain 3D ---
export function apply3d(map: maplibregl.Map | null, on: boolean) {
  if (!map) return;
  whenStyleReady(map, () => apply3dNow(map, on));
}

function apply3dNow(map: maplibregl.Map, on: boolean) {
  // Relief 3D uniquement en mode 3D (l'altitude sous le curseur est lue
  // séparément via un échantillonnage direct du MNT, cf. demElevation).
  // La bascule 2D/3D ne fait qu'INCLINER la vue : le centre, le zoom et le cap
  // sont conservés, on reste donc exactement là où l'opérateur regardait.
  if (on) {
    // Sans source d'altitude (mode souverain sans MBTiles `dem`), la vue
    // s'incline mais le relief n'est pas posé — poser un terrain sur une
    // source absente casserait le style.
    if (!map.getTerrain() && map.getSource("dem")) map.setTerrain({ source: "dem", exaggeration: 1.4 });
    map.easeTo({ pitch: 60, duration: 900 });
  } else {
    map.setTerrain(null);
    map.easeTo({ pitch: 0, duration: 700 });
  }
}

// --- bascule du fond (satellite / plan) ---
export function applyBase(map: maplibregl.Map | null, sat: boolean) {
  if (!map) return;
  whenStyleReady(map, () => applyBaseNow(map, sat));
}

function applyBaseNow(map: maplibregl.Map, sat: boolean) {
  map.setLayoutProperty("sat", "visibility", sat ? "visible" : "none");
  map.setLayoutProperty("plan", "visibility", sat ? "none" : "visible");
  map.setLayoutProperty("lbl", "visibility", sat ? "visible" : "none");
}
