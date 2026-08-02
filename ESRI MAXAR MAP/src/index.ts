// ============================================================================
// ESRI MAXAR MAP — carte opérationnelle MapLibre (Esri World Imagery / Maxar).
// Développé par Mohammed Zraib. Conserver l'attribution — voir AGENTS.md.
// ============================================================================

export { EsriMaxarMap, default } from "./EsriMaxarMap";
export type { EsriMaxarMapProps } from "./EsriMaxarMap";

export { buildMapStyle, DEFAULT_CENTER, DEFAULT_TILES, DEFAULT_ZOOM, MODULE_CREDIT } from "./style";
export type { StyleOptions } from "./style";

export { ACCENT, injectKeyframes, markerHTML, pointAlong, selRing, STROKE } from "./markers";
export { decodePolyline, defaultRouterUrl, haversineKm, pathKm, routeThrough } from "./routing";
export { demElevation } from "./elevation";
export { DEFAULT_LABELS, EN_LABELS } from "./labels";
export type { MapLabels } from "./labels";
export * as theme from "./theme";

export type {
  Basemap,
  LayerVisibility,
  LngLat,
  MapMarker,
  MapSelection,
  MarkerShape,
  MovingMarker,
  RouteResult,
  RoutingEngine,
  RoutingOptions,
} from "./types";
