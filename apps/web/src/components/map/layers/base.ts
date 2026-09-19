// ============================================================================
// components/map/layers/base.ts — bascules du fond (satellite / plan) et du
// terrain 3D. Code déplacé verbatim depuis MapCanvas.tsx (R-7).
// ============================================================================

import maplibregl from "maplibre-gl";
import { planGroupOf } from "@/lib/map/plan";

/**
 * Une bascule ne dépend que du STYLE (ses couches), pas des tuiles : elle
 * s'applique dès que le style est analysé, même sous un CDN qui étrangle.
 * Avant, la garde `isStyleLoaded()` — fausse tant qu'une tuile charge —
 * faisait perdre un clic sur « 3D » ou « Plan » sans rien dire (registre R-15).
 * Si le style n'est pas encore analysé (tout premier instant), la bascule est
 * rejouée à `styledata` ; la dernière demande gagne, dans l'ordre des clics.
 */
function whenStyleReady(map: maplibregl.Map, apply: () => void): void {
  if (map.getStyle()) {
    try {
      apply();
      return;
    } catch {
      /* couche pas encore posée : on rejoue au prochain styledata */
    }
  }
  map.once("styledata", apply);
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
  //
  // IDEMPOTENTE : rien n'est refait si l'état demandé est déjà là. Un
  // `setTerrain(null)` sur une carte sans relief déclenche une mise à jour
  // complète du style (et un `styledata`) ; un `easeTo` relancé remet la caméra
  // en mouvement et coupe le déplacement à la souris. Rappelée en boucle, cette
  // fonction gelait la carte (2 images/s) — plus jamais.
  if (on) {
    // Sans source d'altitude (mode souverain sans MBTiles `dem`), la vue
    // s'incline mais le relief n'est pas posé — poser un terrain sur une
    // source absente casserait le style.
    if (!map.getTerrain() && map.getSource("dem")) map.setTerrain({ source: "dem", exaggeration: 1.4 });
    if (map.getPitch() < 59) map.easeTo({ pitch: 60, duration: 900 });
  } else {
    if (map.getTerrain()) map.setTerrain(null);
    if (map.getPitch() > 0.5) map.easeTo({ pitch: 0, duration: 700 });
  }
}

// --- bascule du fond (satellite / plan) ---
export function applyBase(map: maplibregl.Map | null, sat: boolean) {
  if (!map) return;
  whenStyleReady(map, () => applyBaseNow(map, sat));
}

function applyBaseNow(map: maplibregl.Map, sat: boolean) {
  const set = (id: string, on: boolean) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  };
  set("sat", sat);
  const layers = map.getStyle()?.layers ?? [];
  // Le fond vectoriel (`lib/map/plan.ts`, externe comme souverain) — tout le
  // plan en mode Plan ; frontières et toponymes dans les deux modes.
  const vectoriel = layers.some((l) => planGroupOf(l) !== null);
  for (const layer of layers) {
    const group = planGroupOf(layer);
    if (group === "plan") set(layer.id, !sat);
    else if (group === "labels") set(layer.id, true);
  }
  // Mode souverain sans style vectoriel (station sans polices ni style) : le
  // plan et les repères RENDUS en raster par la station prennent le relais.
  set("plan", !sat && !vectoriel);
  set("lbl", sat && !vectoriel);
}
