// ============================================================================
// ARGOS — référentiel des villes/communes (localisation fine des incidents)
// Villes principales et localités pertinentes en gestion de catastrophe, avec
// leur région de rattachement et coordonnées géographiques approximatives.
// Complète le référentiel des provinces (chef-lieux) pour la déclaration.
// ============================================================================

export interface CityDef {
  v: string;
  region: string;
  ll: [number, number];
}

export const CITIES_MA: CityDef[] = [
  // — Casablanca-Settat —
  { v: "Casablanca", region: "Casablanca-Settat", ll: [-7.59, 33.57] },
  { v: "Mohammedia", region: "Casablanca-Settat", ll: [-7.38, 33.69] },
  { v: "El Jadida", region: "Casablanca-Settat", ll: [-8.51, 33.25] },
  { v: "Settat", region: "Casablanca-Settat", ll: [-7.62, 33.0] },
  { v: "Berrechid", region: "Casablanca-Settat", ll: [-7.59, 33.27] },
  { v: "Azemmour", region: "Casablanca-Settat", ll: [-8.34, 33.29] },
  { v: "Benslimane", region: "Casablanca-Settat", ll: [-7.12, 33.61] },
  // — Rabat-Salé-Kénitra —
  { v: "Rabat", region: "Rabat-Salé-Kénitra", ll: [-6.84, 34.02] },
  { v: "Salé", region: "Rabat-Salé-Kénitra", ll: [-6.8, 34.05] },
  { v: "Témara", region: "Rabat-Salé-Kénitra", ll: [-6.91, 33.92] },
  { v: "Kénitra", region: "Rabat-Salé-Kénitra", ll: [-6.58, 34.26] },
  { v: "Khémisset", region: "Rabat-Salé-Kénitra", ll: [-6.07, 33.82] },
  { v: "Sidi Kacem", region: "Rabat-Salé-Kénitra", ll: [-5.71, 34.22] },
  { v: "Sidi Slimane", region: "Rabat-Salé-Kénitra", ll: [-5.92, 34.26] },
  // — Marrakech-Safi —
  { v: "Marrakech", region: "Marrakech-Safi", ll: [-8.01, 31.63] },
  { v: "Safi", region: "Marrakech-Safi", ll: [-9.24, 32.3] },
  { v: "Essaouira", region: "Marrakech-Safi", ll: [-9.77, 31.51] },
  { v: "Chichaoua", region: "Marrakech-Safi", ll: [-8.76, 31.54] },
  { v: "Youssoufia", region: "Marrakech-Safi", ll: [-8.53, 32.25] },
  { v: "El Kelâa des Sraghna", region: "Marrakech-Safi", ll: [-7.41, 32.05] },
  { v: "Tahannaout", region: "Marrakech-Safi", ll: [-7.95, 31.36] },
  { v: "Amizmiz", region: "Marrakech-Safi", ll: [-8.24, 31.22] },
  { v: "Asni", region: "Marrakech-Safi", ll: [-7.98, 31.25] },
  { v: "Ouirgane", region: "Marrakech-Safi", ll: [-8.08, 31.18] },
  { v: "Talat N'Yaaqoub", region: "Marrakech-Safi", ll: [-8.36, 30.98] },
  // — Fès-Meknès —
  { v: "Fès", region: "Fès-Meknès", ll: [-4.98, 34.03] },
  { v: "Meknès", region: "Fès-Meknès", ll: [-5.55, 33.9] },
  { v: "Azrou", region: "Fès-Meknès", ll: [-5.22, 33.44] },
  { v: "Ifrane", region: "Fès-Meknès", ll: [-5.11, 33.53] },
  { v: "Séfrou", region: "Fès-Meknès", ll: [-4.83, 33.83] },
  { v: "Taza", region: "Fès-Meknès", ll: [-4.01, 34.21] },
  { v: "Taounate", region: "Fès-Meknès", ll: [-4.64, 34.54] },
  { v: "El Hajeb", region: "Fès-Meknès", ll: [-5.37, 33.69] },
  // — Tanger-Tétouan-Al Hoceïma —
  { v: "Tanger", region: "Tanger-Tétouan-Al Hoceïma", ll: [-5.8, 35.77] },
  { v: "Tétouan", region: "Tanger-Tétouan-Al Hoceïma", ll: [-5.37, 35.57] },
  { v: "Larache", region: "Tanger-Tétouan-Al Hoceïma", ll: [-6.15, 35.19] },
  { v: "Ksar El Kébir", region: "Tanger-Tétouan-Al Hoceïma", ll: [-5.9, 35.0] },
  { v: "Al Hoceïma", region: "Tanger-Tétouan-Al Hoceïma", ll: [-3.93, 35.25] },
  { v: "Chefchaouen", region: "Tanger-Tétouan-Al Hoceïma", ll: [-5.27, 35.17] },
  { v: "Ouezzane", region: "Tanger-Tétouan-Al Hoceïma", ll: [-5.58, 34.8] },
  { v: "Fnideq", region: "Tanger-Tétouan-Al Hoceïma", ll: [-5.36, 35.85] },
  { v: "M'diq", region: "Tanger-Tétouan-Al Hoceïma", ll: [-5.32, 35.68] },
  // — Souss-Massa —
  { v: "Agadir", region: "Souss-Massa", ll: [-9.6, 30.42] },
  { v: "Inezgane", region: "Souss-Massa", ll: [-9.53, 30.36] },
  { v: "Aït Melloul", region: "Souss-Massa", ll: [-9.5, 30.34] },
  { v: "Taroudant", region: "Souss-Massa", ll: [-8.88, 30.47] },
  { v: "Oulad Teima", region: "Souss-Massa", ll: [-9.21, 30.39] },
  { v: "Tiznit", region: "Souss-Massa", ll: [-9.73, 29.7] },
  { v: "Biougra", region: "Souss-Massa", ll: [-9.37, 30.21] },
  { v: "Tafraout", region: "Souss-Massa", ll: [-8.97, 29.72] },
  // — L'Oriental —
  { v: "Oujda", region: "L'Oriental", ll: [-1.91, 34.68] },
  { v: "Nador", region: "L'Oriental", ll: [-2.93, 35.17] },
  { v: "Berkane", region: "L'Oriental", ll: [-2.32, 34.92] },
  { v: "Taourirt", region: "L'Oriental", ll: [-2.89, 34.41] },
  { v: "Jerada", region: "L'Oriental", ll: [-2.16, 34.31] },
  { v: "Guercif", region: "L'Oriental", ll: [-3.35, 34.23] },
  { v: "Bouarfa", region: "L'Oriental", ll: [-1.95, 32.53] },
  // — Béni Mellal-Khénifra —
  { v: "Béni Mellal", region: "Béni Mellal-Khénifra", ll: [-6.35, 32.34] },
  { v: "Khouribga", region: "Béni Mellal-Khénifra", ll: [-6.91, 32.88] },
  { v: "Khénifra", region: "Béni Mellal-Khénifra", ll: [-5.67, 32.94] },
  { v: "Fquih Ben Salah", region: "Béni Mellal-Khénifra", ll: [-6.69, 32.5] },
  { v: "Azilal", region: "Béni Mellal-Khénifra", ll: [-6.57, 31.96] },
  { v: "Kasba Tadla", region: "Béni Mellal-Khénifra", ll: [-6.27, 32.6] },
  // — Drâa-Tafilalet —
  { v: "Errachidia", region: "Drâa-Tafilalet", ll: [-4.42, 31.93] },
  { v: "Ouarzazate", region: "Drâa-Tafilalet", ll: [-6.89, 30.92] },
  { v: "Midelt", region: "Drâa-Tafilalet", ll: [-4.74, 32.68] },
  { v: "Tinghir", region: "Drâa-Tafilalet", ll: [-5.53, 31.51] },
  { v: "Zagora", region: "Drâa-Tafilalet", ll: [-5.84, 30.33] },
  { v: "Erfoud", region: "Drâa-Tafilalet", ll: [-4.23, 31.43] },
  { v: "Rissani", region: "Drâa-Tafilalet", ll: [-4.26, 31.28] },
  // — Guelmim-Oued Noun —
  { v: "Guelmim", region: "Guelmim-Oued Noun", ll: [-10.06, 28.99] },
  { v: "Tan-Tan", region: "Guelmim-Oued Noun", ll: [-11.1, 28.44] },
  { v: "Sidi Ifni", region: "Guelmim-Oued Noun", ll: [-10.17, 29.38] },
  { v: "Assa", region: "Guelmim-Oued Noun", ll: [-9.43, 28.61] },
  // — Laâyoune-Sakia El Hamra —
  { v: "Laâyoune", region: "Laâyoune-Sakia El Hamra", ll: [-13.2, 27.15] },
  { v: "Boujdour", region: "Laâyoune-Sakia El Hamra", ll: [-14.48, 26.13] },
  { v: "Es-Semara", region: "Laâyoune-Sakia El Hamra", ll: [-11.67, 26.74] },
  { v: "Tarfaya", region: "Laâyoune-Sakia El Hamra", ll: [-12.93, 27.94] },
  // — Dakhla-Oued Ed-Dahab —
  { v: "Dakhla", region: "Dakhla-Oued Ed-Dahab", ll: [-15.94, 23.68] },
  { v: "Aousserd", region: "Dakhla-Oued Ed-Dahab", ll: [-14.33, 22.55] },
];
