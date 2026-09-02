// ============================================================================
// components/map/layers/base.ts — bascules du fond (satellite / plan) et du
// terrain 3D. Code déplacé verbatim depuis MapCanvas.tsx (R-7).
// ============================================================================

import maplibregl from "maplibre-gl";

// --- bascule terrain 3D ---
export function apply3d(map: maplibregl.Map | null, on: boolean) {
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
}

// --- bascule du fond (satellite / plan) ---
export function applyBase(map: maplibregl.Map | null, sat: boolean) {
  if (!map || !map.isStyleLoaded()) return;
  map.setLayoutProperty("sat", "visibility", sat ? "visible" : "none");
  map.setLayoutProperty("plan", "visibility", sat ? "none" : "visible");
  map.setLayoutProperty("lbl", "visibility", sat ? "visible" : "none");
}
