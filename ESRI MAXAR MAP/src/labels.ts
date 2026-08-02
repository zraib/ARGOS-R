// Libellés de l'interface. Le composant n'embarque aucune bibliothèque i18n :
// on passe un objet partiel via la prop `labels` pour traduire.

export interface MapLabels {
  measure: string;
  measureHint: string;
  clear: string;
  points: string;
  road: string;
  direct: string;
  lat: string;
  lng: string;
  alt: string;
  satellite: string;
  plan: string;
  fullscreen: string;
  exitFullscreen: string;
  moveUp: string;
  moveDown: string;
  remove: string;
}

/** Libellés français par défaut. */
export const DEFAULT_LABELS: MapLabels = {
  measure: "Mesure",
  measureHint: "Cliquez sur la carte pour ajouter des points",
  clear: "Effacer",
  points: "Points",
  road: "Itinéraire routier",
  direct: "Vol d'oiseau",
  lat: "Latitude",
  lng: "Longitude",
  alt: "Alt.",
  satellite: "Satellite",
  plan: "Plan",
  fullscreen: "Plein écran",
  exitFullscreen: "Quitter le plein écran",
  moveUp: "Monter",
  moveDown: "Descendre",
  remove: "Supprimer",
};

/** Libellés anglais, fournis pour dépanner. */
export const EN_LABELS: MapLabels = {
  measure: "Measure",
  measureHint: "Click the map to add points",
  clear: "Clear",
  points: "Points",
  road: "Road route",
  direct: "Straight line",
  lat: "Latitude",
  lng: "Longitude",
  alt: "Alt.",
  satellite: "Satellite",
  plan: "Street",
  fullscreen: "Fullscreen",
  exitFullscreen: "Exit fullscreen",
  moveUp: "Move up",
  moveDown: "Move down",
  remove: "Remove",
};
