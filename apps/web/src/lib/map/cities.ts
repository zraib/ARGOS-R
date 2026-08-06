// ============================================================================
// ARGOS — catalogue de villes pour la carte météo
// Chaque ville porte un `minZoom` : plus on zoome, plus de villes reçoivent
// leur étiquette de température (niveau de détail progressif). Sert aussi au
// pop-up de prévisions (nom de la ville la plus proche du clic).
// Données de présentation embarquées (souveraineté : aucun géocodeur externe).
// ============================================================================

export interface WxCity {
  name: string;
  lon: number;
  lat: number;
  /** Zoom carte à partir duquel l'étiquette apparaît. */
  minZoom: number;
}

const c = (name: string, lon: number, lat: number, minZoom: number): WxCity => ({ name, lon, lat, minZoom });

export const WX_CITIES: WxCity[] = [
  // --- Maroc : grandes villes (zoom national) -------------------------------
  c("Casablanca", -7.59, 33.57, 4), c("Rabat", -6.84, 34.03, 4),
  c("Marrakech", -8.01, 31.63, 4), c("Fès", -5.0, 34.03, 4),
  c("Tanger", -5.8, 35.77, 4), c("Agadir", -9.6, 30.42, 4),
  c("Oujda", -1.91, 34.68, 4), c("Meknès", -5.55, 33.89, 4.8),
  c("Kénitra", -6.58, 34.26, 4.8), c("Tétouan", -5.37, 35.57, 4.8),
  c("Laâyoune", -13.2, 27.15, 4), c("Dakhla", -15.93, 23.72, 4),
  c("Errachidia", -4.42, 31.93, 4.8), c("Al Hoceïma", -3.93, 35.25, 4.8),
  c("Ouarzazate", -6.9, 30.92, 4.8),
  // --- Maroc : villes moyennes (zoom régional) ------------------------------
  c("Nador", -2.93, 35.17, 5.5), c("Taza", -4.01, 34.21, 5.5),
  c("Chefchaouen", -5.27, 35.17, 5.5), c("Larache", -6.15, 35.19, 5.5),
  c("Khémisset", -6.07, 33.82, 6), c("Mohammedia", -7.38, 33.69, 6),
  c("El Jadida", -8.5, 33.25, 5.5), c("Safi", -9.24, 32.3, 5.5),
  c("Essaouira", -9.77, 31.51, 5.5), c("Béni Mellal", -6.35, 32.34, 5.5),
  c("Khouribga", -6.91, 32.88, 6), c("Settat", -7.62, 33.0, 6),
  c("Khénifra", -5.67, 32.94, 6), c("Ifrane", -5.11, 33.53, 6),
  c("Midelt", -4.73, 32.68, 6), c("Taroudant", -8.88, 30.47, 5.5),
  c("Tiznit", -9.73, 29.7, 5.5), c("Guelmim", -10.06, 28.99, 5.5),
  c("Tan-Tan", -11.1, 28.44, 5.5), c("Tarfaya", -12.93, 27.94, 6),
  c("Smara", -11.67, 26.74, 5.5), c("Boujdour", -14.5, 26.13, 5.5),
  c("Aousserd", -14.33, 22.55, 6), c("Zagora", -5.84, 30.33, 6),
  c("Tinghir", -5.53, 31.51, 6), c("Figuig", -1.23, 32.11, 6),
  c("Bouarfa", -1.96, 32.53, 6), c("Azilal", -6.57, 31.96, 6.5),
  c("Taourirt", -2.9, 34.41, 6.5), c("Sidi Ifni", -10.18, 29.37, 6.5),
  // --- Monde : capitales et métropoles (toujours visibles) ------------------
  c("Madrid", -3.7, 40.42, 0), c("Paris", 2.35, 48.86, 0),
  c("Londres", -0.13, 51.51, 0), c("Berlin", 13.4, 52.52, 0),
  c("Rome", 12.5, 41.9, 0), c("Athènes", 23.73, 37.98, 2.5),
  c("Istanbul", 28.98, 41.01, 0), c("Moscou", 37.62, 55.76, 0),
  c("Le Caire", 31.24, 30.05, 0), c("Alger", 3.06, 36.75, 0),
  c("Tunis", 10.17, 36.8, 2.5), c("Tripoli", 13.19, 32.89, 2.5),
  c("Nouakchott", -15.98, 18.09, 0), c("Dakar", -17.45, 14.72, 0),
  c("Lagos", 3.38, 6.52, 0), c("Nairobi", 36.82, -1.29, 0),
  c("Johannesburg", 28.05, -26.2, 0), c("Dubaï", 55.27, 25.2, 0),
  c("Riyad", 46.72, 24.63, 2.5), c("Bombay", 72.88, 19.08, 0),
  c("Pékin", 116.4, 39.9, 0), c("Tokyo", 139.69, 35.69, 0),
  c("Singapour", 103.85, 1.29, 0), c("Sydney", 151.21, -33.87, 0),
  c("New York", -74.01, 40.71, 0), c("Los Angeles", -118.24, 34.05, 0),
  c("Mexico", -99.13, 19.43, 0), c("Bogota", -74.07, 4.71, 2.5),
  c("São Paulo", -46.63, -23.55, 0), c("Buenos Aires", -58.38, -34.6, 0),
  // --- Monde : villes secondaires (zoom continental) ------------------------
  c("Lisbonne", -9.14, 38.72, 2.5), c("Porto", -8.61, 41.15, 3.5),
  c("Séville", -5.98, 37.39, 3.5), c("Valence", -0.38, 39.47, 3.5),
  c("Barcelone", 2.17, 41.39, 2.5), c("Marseille", 5.37, 43.3, 3.5),
  c("Lyon", 4.84, 45.76, 3.5), c("Munich", 11.58, 48.14, 3.5),
  c("Vienne", 16.37, 48.21, 3), c("Varsovie", 21.01, 52.23, 3),
  c("Kiev", 30.52, 50.45, 3), c("Bucarest", 26.1, 44.43, 3.5),
  c("Amsterdam", 4.9, 52.37, 3), c("Bruxelles", 4.35, 50.85, 3.5),
  c("Stockholm", 18.07, 59.33, 3), c("Oslo", 10.75, 59.91, 3.5),
  c("Dublin", -6.26, 53.35, 3), c("Oran", -0.64, 35.7, 3.5),
  c("Constantine", 6.61, 36.37, 4), c("Tamanrasset", 5.52, 22.79, 3.5),
  c("Benghazi", 20.07, 32.12, 3.5), c("Alexandrie", 29.92, 31.2, 3.5),
  c("Bamako", -8.0, 12.65, 2.5), c("Tombouctou", -3.01, 16.77, 3.5),
  c("Niamey", 2.11, 13.51, 3), c("N'Djamena", 15.04, 12.13, 3),
  c("Conakry", -13.68, 9.64, 3.5), c("Abidjan", -4.03, 5.35, 3),
  c("Accra", -0.19, 5.6, 3.5), c("Addis-Abeba", 38.75, 9.02, 2.5),
  c("Le Cap", 18.42, -33.93, 2.5), c("Khartoum", 32.55, 15.59, 3),
  c("Téhéran", 51.39, 35.69, 2.5), c("Bagdad", 44.36, 33.31, 3),
  c("Ankara", 32.85, 39.93, 3.5), c("Djeddah", 39.19, 21.49, 3.5),
  c("Karachi", 67.01, 24.86, 3), c("Delhi", 77.21, 28.61, 2.5),
  c("Bangkok", 100.5, 13.76, 2.5), c("Jakarta", 106.85, -6.21, 2.5),
  c("Séoul", 126.98, 37.57, 2.5), c("Shanghai", 121.47, 31.23, 2.5),
  c("Hong Kong", 114.17, 22.32, 3), c("Chicago", -87.63, 41.88, 2.5),
  c("Houston", -95.37, 29.76, 3), c("Miami", -80.19, 25.76, 2.5),
  c("Toronto", -79.38, 43.65, 2.5), c("Vancouver", -123.12, 49.28, 3),
  c("Lima", -77.04, -12.05, 2.5), c("Santiago", -70.65, -33.45, 2.5),
  c("Caracas", -66.9, 10.49, 3), c("Rio de Janeiro", -43.17, -22.91, 2.5),
];

/**
 * Ville la plus proche d'un point [lon, lat] dans un rayon donné (km),
 * approximation équirectangulaire — largement suffisante à cette échelle.
 */
export function nearestCity(lon: number, lat: number, maxKm = 35): WxCity | null {
  let best: WxCity | null = null;
  let bestD = maxKm * maxKm;
  const cosl = Math.cos((lat * Math.PI) / 180);
  for (const city of WX_CITIES) {
    const dx = (city.lon - lon) * 111.32 * cosl;
    const dy = (city.lat - lat) * 110.57;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = city; }
  }
  return best;
}
