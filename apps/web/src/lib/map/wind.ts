// ============================================================================
// Rose des vents — calculs purs, sans React (lot N-5, extraits pour être testés)
// ============================================================================

/** Seuil ATP-45 sous lequel la direction du vent ne gouverne plus la nappe. */
export const LOW_WIND_KMH = 10;

/** Rose française à 16 branches — l'ouest s'abrège O, jamais W. */
export const CARDINALS_FR = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO",
] as const;

/** Rose anglaise — W et non O. L'arabe reprend l'abréviation latine, lisible partout. */
export const CARDINALS_EN = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
] as const;

export function cardinal(deg: number, lang: string): string {
  const table = lang === "fr" ? CARDINALS_FR : CARDINALS_EN;
  return table[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
}
