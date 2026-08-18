// ============================================================================
// ARGOS — tracés SVG des icônes (icônes en trait, viewBox 24×24)
// Extraits du prototype de design pour que chaque glyphe corresponde à l'export.
// ============================================================================

export const NAV_ICONS = {
  dashboard: "M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z",
  map: "M9 20l-6 2V6l6-2m0 16l6-2m-6 2V4m6 14l6 2V6l-6-2m0 16V4",
  incidents: "M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
  units: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  hospitals: "M3 21h18M5 21V7l7-4 7 4v14M12 9v6M9 12h6",
  triage: "M22 12h-4l-3 9L9 3l-3 9H2",
  res: "M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z M3.3 7L12 12l8.7-5 M12 22V12",
  dis: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2 M9 3h6v4H9z M12 11v4 M12 17.5h.01",
  damage: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 21V12l3 3 3-3v9",
  shelters: "M12 3L2 21h20L12 3z M12 13l4 8h-8z",
  cmd: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z",
  plans: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M9 13h6 M9 17h6",
  comms: "M4.9 19.1C1 15.2 1 8.8 4.9 4.9 M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5 M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5 M19.1 4.9c3.9 3.9 3.9 10.2 0 14.2 M12 10a2 2 0 100 4 2 2 0 000-4z",
  reports: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
  analytics: "M18 20V10 M12 20V4 M6 20v-6",
  dispatch: "M16 3h5v5 M4 20L21 3 M21 16v5h-5 M15 15l6 6 M4 4l5 5",
  assistant: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z M5 3v4 M3 5h4 M18 16v4 M16 18h4",
  settings: "M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z",
  seismic: "M2 14h4l2-6 3 10 3-13 2 9h6",
  weather: "M17.5 19a4.5 4.5 0 000-9 6 6 0 00-11.5 2A4 4 0 007 19h10.5z M8 13l1.5-1.5M12 3v1M4.2 6.2l.7.7",
} as const;

// Glyphes des tuiles d'indicateurs des pages de flux (sismologie / météo).
export const FLUX_ICONS = {
  activity: "M3 12h4l3-8 4 16 3-8h4",
  clock: "M12 3a9 9 0 100 18 9 9 0 000-18z M12 8v4l3 2",
  depth: "M12 3v12 M8 11l4 4 4-4 M4 20h16",
  alert: "M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
  thermometer: "M14 5a2 2 0 00-4 0v9a3.5 3.5 0 104 0V5z M12 14V8",
  droplet: "M12 3c3.5 4.5 6 7.5 6 11a6 6 0 01-12 0c0-3.5 2.5-6.5 6-11z",
  wind: "M3 8h10a2.5 2.5 0 10-2.5-2.5 M3 12h14a2.5 2.5 0 11-2.5 2.5 M3 16h8a2 2 0 11-2 2",
  rain: "M17.5 15a4.5 4.5 0 000-9 6 6 0 00-11.5 2A4 4 0 007 15h10.5z M8 19v1 M12 19v2 M16 19v1",
} as const;

export const KPI_ICONS = {
  incidents: "M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
  personnel: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75",
  beds: "M2 4v16 M2 8h18a2 2 0 012 2v10 M2 17h20 M6 8v9",
  units: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  risk: "M12 9v4m0 4h.01 M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z M12 4l-8.4 13.5A2 2 0 005.36 20h13.28a2 2 0 001.76-2.5L12 4z",
} as const;

export const TYPE_ICONS: Record<string, string> = {
  earthquake: "M2 14h4l2-6 3 10 3-13 2 9h6",
  flood: "M2 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0 M2 13c2-2 4-2 6 0s4 2 6 0 4-2 6 0 M2 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0",
  wildfire: "M12 2c1 4 5 6 5 11a5 5 0 01-10 0c0-2 .5-3.5 2-5 0 2 1 3 2 3 0-3-1-6 1-9z",
  landslide: "M3 20h18L14 6l-4 7-2-3z M7 8l2-4",
  epidemic: "M12 8a4 4 0 100 8 4 4 0 000-8z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9L7 7 M17 17l2.1 2.1 M19.1 4.9L17 7 M7 17l-2.1 2.1",
  industrial: "M2 20h20 M4 20V9l5 4V9l5 4V4h6v16",
};

// Pool d'icônes (tracés SVG 24×24, trait) proposé au choix lors de la création
// d'un type d'incident depuis les Paramètres. Le tracé sélectionné est envoyé
// à l'API et réutilisé tel quel par l'assistant de déclaration.
export const INCIDENT_ICON_CHOICES: { key: string; path: string }[] = [
  { key: "earthquake", path: "M2 14h4l2-6 3 10 3-13 2 9h6" },
  { key: "flood", path: "M2 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0 M2 13c2-2 4-2 6 0s4 2 6 0 4-2 6 0 M2 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0" },
  { key: "wildfire", path: "M12 2c1 4 5 6 5 11a5 5 0 01-10 0c0-2 .5-3.5 2-5 0 2 1 3 2 3 0-3-1-6 1-9z" },
  { key: "landslide", path: "M3 20h18L14 6l-4 7-2-3z M7 8l2-4" },
  { key: "epidemic", path: "M12 8a4 4 0 100 8 4 4 0 000-8z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9L7 7 M17 17l2.1 2.1 M19.1 4.9L17 7 M7 17l-2.1 2.1" },
  { key: "industrial", path: "M2 20h20 M4 20V9l5 4V9l5 4V4h6v16" },
  { key: "tsunami", path: "M3 12c0-5 3-8 7-8 3 0 5 2 5 4 0 2-1.5 3-3 3 1 1 3 1 5-1 M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0 M2 21c2-2 4-2 6 0s4 2 6 0 4-2 6 0" },
  { key: "storm", path: "M17.5 16a4.5 4.5 0 000-9 6 6 0 00-11.5 2A4 4 0 007 16h10.5z M13 10l-3 5h4l-3 5" },
  { key: "coldwave", path: "M12 2v20 M4 7l16 10 M20 7L4 17 M9 4l3 3 3-3 M9 20l3-3 3 3 M2 12h20" },
  { key: "drought", path: "M12 3v2 M5.6 5.6L7 7 M18.4 5.6L17 7 M8 12a4 4 0 018 0z M2 16h20 M6 16l-1 5 M12 16v5 M18 16l1 5" },
  { key: "building_collapse", path: "M3 21h18 M5 21V8l5-4 4 3v14 M14 10l5 2v9 M9 12l2 2-2 2" },
  { key: "road_accident", path: "M2 17h20 M4 17l2-5h6l2 5 M14 17l2-4h4l1 4 M7 20a1.5 1.5 0 100-3 1.5 1.5 0 000 3z M17 20a1.5 1.5 0 100-3 1.5 1.5 0 000 3z M12 3l2 2-2 2" },
  { key: "maritime", path: "M4 18c2-2 4-2 6 0s4 2 6 0 M6 15l-2-5h16l-2 5 M12 10V4 M12 4l5 3h-5" },
  { key: "nrbc", path: "M10 3h4 M12 3v6l5 8a3 3 0 01-3 4H10a3 3 0 01-3-4l5-8z M9 14h6" },
  { key: "alert", path: "M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" },
  { key: "bolt", path: "M13 2L3 14h7l-1 8 10-12h-7l1-8z" },
  { key: "radiation", path: "M12 10a2 2 0 100 4 2 2 0 000-4z M12 2a10 10 0 00-8.66 5l6.06 3.5A3 3 0 0112 8.5V2z M20.66 7A10 10 0 0012 2v6.5a3 3 0 011.6.99L20.66 7z M3.34 17A10 10 0 0012 22v-6.5a3 3 0 01-2.6-1.5L3.34 17z" },
  { key: "explosion", path: "M12 2l2 6 5-3-2 6 6 1-6 2 3 5-6-2-1 6-2-6-5 3 2-6-6-1 6-2-3-5 6 2z" },
  { key: "rain", path: "M17.5 15a4.5 4.5 0 000-9 6 6 0 00-11.5 2A4 4 0 007 15h10.5z M8 19v1 M12 19v2 M16 19v1" },
  { key: "hail", path: "M17.5 14a4.5 4.5 0 000-9 6 6 0 00-11.5 2A4 4 0 007 14h10.5z M8 18h.01 M12 18h.01 M16 18h.01 M10 21h.01 M14 21h.01" },
  { key: "fog", path: "M4 8h16 M4 12h16 M6 16h12 M8 20h8" },
  { key: "wind", path: "M3 8h10a2.5 2.5 0 10-2.5-2.5 M3 12h14a2.5 2.5 0 11-2.5 2.5 M3 16h8a2 2 0 11-2 2" },
  { key: "tornado", path: "M4 5h16 M6 9h12 M9 13h7 M11 17h4 M12 21h1" },
  { key: "heatwave", path: "M12 5v2 M6.5 7l1.4 1.4 M17.5 7l-1.4 1.4 M12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z M4 19q2-2 4 0t4 0 4 0 M4 21.5q2-2 4 0t4 0 4 0" },
  { key: "thermometer", path: "M14 5a2 2 0 00-4 0v9a3.5 3.5 0 104 0V5z M12 14V8 M18 6h3 M18 10h2" },
  { key: "volcano", path: "M3 21h18 M8 21l4-9 4 9 M12 12V7 M10 4l2-2 2 2" },
  { key: "avalanche", path: "M3 20h18 M19 20L9 6l-3 6-2-3 M7 8q-1 1-2 0" },
  { key: "sinkhole", path: "M12 6c-5 0-8 1.8-8 4s3 4 8 4 8-1.8 8-4-3-4-8-4z M4 10c0 2.2 3 4 8 4 M8 14v3 M16 14v3" },
  { key: "crack", path: "M12 3l-2 5 3 2-4 3 3 3-3 5" },
  { key: "flask", path: "M9 3h6 M10 3v6l-4.5 8.5A2 2 0 007.3 21h9.4a2 2 0 001.8-3.5L14 9V3 M8.5 15h7" },
  { key: "droplet", path: "M12 3c3.5 4.5 6 7.5 6 11a6 6 0 01-12 0c0-3.5 2.5-6.5 6-11z" },
  { key: "gas", path: "M12 3c2.5 3 4 5.5 4 8a4 4 0 01-8 0c0-1.3.5-2.5 1.5-3.5 M9 21h6" },
  { key: "biohazard", path: "M12 10.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z M12 3a5 5 0 00-2.5 9.3 M12 3a5 5 0 012.5 9.3 M6.9 20a5 5 0 01-1.4-8.6 M17.1 20a5 5 0 001.4-8.6 M8.5 20h7" },
  { key: "dam", path: "M5 4v16 M9 4v16 M5 4h4 M5 20h4 M9 11c3 1 5 1 8 0 M9 15c3 1 5 1 8 0 M9 19c3 1 5 1 8 0" },
  { key: "bridge", path: "M2 12h20 M4 12v6 M20 12v6 M4 12a8 8 0 0116 0 M9 12v4 M15 12v4" },
  { key: "pylon", path: "M12 3v18 M6 21l6-15 6 15 M8.5 12h7 M10 16h4" },
  { key: "power_off", path: "M12 3v9 M6.4 6.4a8 8 0 1011.2 0 M4 4l16 16" },
  { key: "truck", path: "M3 16V7h11v9 M14 10h3.5L21 13v3h-7 M7 19a2 2 0 100-4 2 2 0 000 4z M17.5 19a2 2 0 100-4 2 2 0 000 4z" },
  { key: "train", path: "M7 3h10a2 2 0 012 2v8a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z M9 3v12 M15 3v12 M5 17l-2 4 M19 17l2 4 M9 12h.01 M15 12h.01" },
  { key: "plane", path: "M22 12l-9-1V4a1 1 0 00-2 0v7l-9 1v2l9-1v4l-2 1.5V20l3-1 3 1v-1.5L13 17v-4l9 1z" },
  { key: "anchor", path: "M12 7a2 2 0 100-4 2 2 0 000 4z M12 7v14 M5 13a7 7 0 0014 0 M3 13h3 M18 13h3" },
  { key: "crowd", path: "M8 10a2.5 2.5 0 100-5 2.5 2.5 0 000 5z M16 10a2.5 2.5 0 100-5 2.5 2.5 0 000 5z M3 20a5 5 0 0110 0 M11 20a5 5 0 0110 0" },
  { key: "medical", path: "M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" },
  { key: "ambulance", path: "M3 16V8h11v8 M14 11h4l3 3v2h-7 M7 19a2 2 0 100-4 2 2 0 000 4z M17 19a2 2 0 100-4 2 2 0 000 4z M8 6h3 M9.5 4.5v3" },
  { key: "helicopter", path: "M4 5h16 M12 5v3 M6 12h9l4 3v2H9a5 5 0 01-5-5z M11 17v3 M8 20h6 M15 12l4-4" },
  { key: "syringe", path: "M17 2l5 5 M19 4l-2 2 M15 5l4 4-8 8H7v-4z M8 15l-5 5 M10 11l3 3" },
  { key: "mask", path: "M4 9c2.5-1 6-1.5 8-1.5s5.5.5 8 1.5c0 4.5-1.5 7.5-4.5 8.5-2 .7-2 1.5-3.5 1.5s-1.5-.8-3.5-1.5C5.5 16.5 4 13.5 4 9z M8 12h3 M13 12h3" },
  { key: "bomb", path: "M11 6a6 6 0 106 6 M14 6h4v4 M18 6l3-3 M16 3h2v2" },
  { key: "tree", path: "M12 2l5 8h-3l3.5 6H6.5L10 10H7z M12 16v6" },
];

export const UI_ICONS = {
  chevronRight: "M9 18l6-6-6-6",
  arrowLeft: "M19 12H5M12 19l-7-7 7-7",
  close: "M18 6L6 18M6 6l12 12",
  sidebar: "M3 5h18v14H3z M9 5v14",
  /** Menu mobile : trois barres, convention universelle du tiroir de navigation. */
  menu: "M4 7h16 M4 12h16 M4 17h16",
  logout: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4 M16 17l5-5-5-5 M21 12H9",
  sun: "M12 3v2m0 14v2M5.2 5.2l1.4 1.4m10.8 10.8l1.4 1.4M3 12h2m14 0h2M5.2 18.8l1.4-1.4M17.4 6.6l1.4-1.4M12 8a4 4 0 100 8 4 4 0 000-8z",
  moon: "M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M12 8v4 M12 15h.01",
  plus: "M12 5v14M5 12h14",
  plusSmall: "M12 5v14M5 12h14",
  send: "M22 2L11 13 M22 2l-7 20-4-9-9-4z",
  upload: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M17 8l-5-5-5 5 M12 3v12",
  hash: "M4 9h16 M4 15h16 M10 3L8 21 M16 3l-2 18",
  voice: "M11 5L6 9H2v6h4l5 4z M15.5 8.5a5 5 0 010 7 M19 5a9 9 0 010 14",
  stub: "M14.7 6.3a5 5 0 00-6.6 6.6L3 18v3h3l5.1-5.1a5 5 0 006.6-6.6L14 12l-2-2z",
  users: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75",
  trash: "M3 6h18 M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2 M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6 M10 11v6 M14 11v6",
  check: "M20 6L9 17l-5-5",
  eye: "M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z M12 15a3 3 0 100-6 3 3 0 000 6z",
  eyeOff: "M17.94 17.94A10 10 0 0112 20C5 20 1 13 1 13a18 18 0 015.06-5.94 M9.9 4.24A9 9 0 0112 4c7 0 11 7 11 7a18 18 0 01-2.16 3.19 M14.12 14.12a3 3 0 11-4.24-4.24 M1 1l22 22",
  key: "M21 2l-2 2m-3.5 3.5a5.5 5.5 0 11-7.78 7.78 5.5 5.5 0 017.78-7.78z M15.5 7.5l3 3L22 7l-3-3 M12.5 10.5L7 16",
  power: "M18.36 6.64a9 9 0 11-12.73 0 M12 2v10",
  edit: "M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7 M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4z",
  globe: "M12 2a10 10 0 100 20 10 10 0 000-20z M2 12h20 M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z",
  camera: "M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z M12 17a4 4 0 100-8 4 4 0 000 8z",
  expand: "M8 3H5a2 2 0 00-2 2v3 M21 8V5a2 2 0 00-2-2h-3 M3 16v3a2 2 0 002 2h3 M16 21h3a2 2 0 002-2v-3",
  /**
   * Copilot : tête de robot coiffée d'un casque-micro — arceau par-dessus le
   * crâne, un écouteur charnu sur chaque tempe, perche qui descend de
   * l'écouteur droit jusque sous le menton, terminée par la capsule micro.
   * Tout en trait (aucun remplissage), même graisse que la famille.
   */
  copilot: "M7 7h10a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z M4 12v-1.5a8 8 0 0 1 16 0V12 M5 11.5H3.8a1.3 1.3 0 0 0-1.3 1.3v2.4a1.3 1.3 0 0 0 1.3 1.3H5z M19 11.5h1.2a1.3 1.3 0 0 1 1.3 1.3v2.4a1.3 1.3 0 0 1-1.3 1.3H19z M20 16.5v1.2a3 3 0 0 1-3 3h-3.5 M13.2 19.6v2.2 M10 11.5v2 M14 11.5v2 M10.5 15h3",
  map: "M9 20l-6 2V6l6-2m0 16l6-2m-6 2V4m6 14l6 2V6l-6-2m0 16V4",
  archive: "M2 4h20v4H2z M4 8v11a2 2 0 002 2h12a2 2 0 002-2V8 M10 12h4",
  caretDown: "M6 9l6 6 6-6",
  copy: "M20 9h-9a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-9a2 2 0 00-2-2z M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1",
  sliders: "M4 6h16 M4 12h16 M4 18h16 M9 4v4 M15 10v4 M7 16v4",
  refresh: "M21 12a9 9 0 11-3.2-6.9 M21 3v6h-6",
  refreshCw: "M21 12a9 9 0 11-3.2-6.9 M21 3v6h-6",
  sparkles: "M12 3v4 M12 17v4 M3 12h4 M17 12h4 M5.6 5.6l2.8 2.8 M15.6 15.6l2.8 2.8 M5.6 18.4l2.8-2.8 M15.6 8.4l2.8-2.8",
  scale: "M12 3l7 4v10l-7 4-7-4V7z M12 8v8 M8 10l4 2 4-2 M8 14l4 2 4-2",
  alert: "M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
  heart: "M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l8.1 8.1a1 1 0 001.4 0l8.1-8.1a5.5 5.5 0 000-7.8z",
  truck: "M3 16V7h11v9 M14 10h3.5L21 13v3h-7 M7 19a2 2 0 100-4 2 2 0 000 4z M17.5 19a2 2 0 100-4 2 2 0 000 4z",
  ambulance: "M3 16V8h11v8 M14 11h4l3 3v2h-7 M7 19a2 2 0 100-4 2 2 0 000 4z M17 19a2 2 0 100-4 2 2 0 000 4z M8 6h3 M9.5 4.5v3",
  helicopter: "M4 5h16 M12 5v3 M6 12h9l4 3v2H9a5 5 0 01-5-5z M11 17v3 M8 20h6 M15 12l4-4",
  beds: "M2 4v16 M2 8h18a2 2 0 012 2v10 M2 17h20 M6 8v9",
  medical: "M9 3h6v6h6v6h-6v6H9v-6H3V9h6z",
  // -------- ICÔNES PRÉDICTIONS EXCLUSIVES CS (Anticipations IA) --------
  // ⏱️ TTG — horloge
  clock: "M12 6v6l4 2 M12 22a10 10 0 110-20 10 10 0 010 20z",
  // ⚠️ Prochaine saturation — triangle alerte
  "alert-triangle": "M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z M12 9v4 M12 17h.01",
  // 🏕️ Besoin HMC (tente hôpital campagne)
  tent: "M4 20l8-12 8 12 M10 20l4-7 4 7 M7 20h10 M14 20v-5h-4v5",
  // 🔀 Redirection patients
  shuffle: "M16 3h5v5 M4 20l17-17 M21 16v5h-5 M4 4l7 7 M4 16l5 5 M14 10l7 7",
  // 📈 Activité (flux patients)
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
  // 📦 Stock critique médical
  package: "M16.5 9.4L21 7v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7l4.5 2.4 M12 3l9 6-9 6-9-6 9-6z M7 16l5-3 5 3 M12 12v10",
  // Ramification (sous-incidents rattachés à un incident principal).
  branch: "M6 3a3 3 0 100 6 3 3 0 000-6z M6 9v6 M6 15a3 3 0 100 6 3 3 0 000-6z M18 4a3 3 0 100 6 3 3 0 000-6z M18 10c0 5-4 6-9 6.6",
} as const;
