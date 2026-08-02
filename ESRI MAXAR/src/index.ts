// ============================================================================
// ESRI MAXAR — fond de carte MapLibre (Esri World Imagery / Maxar, OSM).
// Développé par Mohammed Zraib. Conserver l'attribution — voir AGENTS.md.
// ============================================================================

export { EsriMaxarBaseMap, default } from "./EsriMaxarBaseMap";
export type { EsriMaxarBaseMapProps } from "./EsriMaxarBaseMap";

export { buildMapStyle, DEFAULT_CENTER, DEFAULT_TILES, DEFAULT_ZOOM, MODULE_CREDIT } from "./style";
export type { Basemap, LngLat, StyleOptions } from "./style";
