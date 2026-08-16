import type { AircraftPosition } from "@/lib/types";

// ============================================================================
// ARGOS — extrapolation de position aérienne (navigation à l'estime)
//
// Un flux ADS-B public ne livre un point que toutes les 10 s environ. Sans
// traitement, le marqueur reste figé puis saute : la carte paraît morte alors
// que l'appareil vole à 250 km/h. On avance donc la position entre deux
// contacts à partir du dernier cap et de la dernière vitesse connus.
//
// Ce n'est PAS une position mesurée, c'est une estimation. L'interface doit le
// dire (âge du dernier contact affiché), et l'estime cesse au-delà d'un seuil :
// au bout d'un moment, extrapoler devient inventer.
// ============================================================================

/** Mètres par degré de latitude (approximation sphérique, suffisante ici). */
const M_PER_DEG_LAT = 111_320;

/**
 * Durée maximale d'extrapolation.
 *
 * Au-delà, l'appareil a pu virer, ralentir ou se poser : la position estimée
 * n'engage plus rien. On gèle alors le marqueur sur le dernier point mesuré
 * plutôt que de le faire dériver indéfiniment en ligne droite.
 */
export const MAX_ESTIME_MS = 120_000;

/** Position estimée, avec ce qu'il faut pour la qualifier à l'écran. */
export interface EstimatedPosition {
  ll: [number, number];
  /** Âge du dernier contact réel, en secondes. */
  ageSec: number;
  /** Vrai si le point affiché est extrapolé et non mesuré. */
  estimated: boolean;
}

/**
 * Avance une position le long de son cap, du temps écoulé depuis le contact.
 *
 * Retombe sur la position mesurée telle quelle si le cap ou la vitesse manquent
 * (appareil au sol, écho incomplet) : sans vecteur, il n'y a rien à extrapoler.
 */
export function extrapolate(pos: AircraftPosition, nowMs: number): EstimatedPosition {
  const contactMs = Date.parse(pos.lastContact);
  const elapsed = Number.isFinite(contactMs) ? nowMs - contactMs : 0;
  const ageSec = Math.max(0, Math.round(elapsed / 1000));

  // Sans vecteur (appareil au sol, écho incomplet) ou hors fenêtre d'estime, on
  // s'en tient au point mesuré.
  const { velocity, heading } = pos;
  if (pos.onGround || !velocity || heading === null || elapsed <= 0 || elapsed > MAX_ESTIME_MS) {
    return { ll: pos.ll, ageSec, estimated: false };
  }

  const distance = velocity * (elapsed / 1000);
  const rad = (heading * Math.PI) / 180;

  const dLat = (distance * Math.cos(rad)) / M_PER_DEG_LAT;
  // Le méridien se resserre vers les pôles : un degré de longitude vaut moins
  // de mètres à mesure qu'on monte en latitude.
  const cosLat = Math.cos((pos.lat * Math.PI) / 180);
  const dLon = cosLat > 1e-6 ? (distance * Math.sin(rad)) / (M_PER_DEG_LAT * cosLat) : 0;

  return { ll: [pos.lon + dLon, pos.lat + dLat], ageSec, estimated: true };
}
