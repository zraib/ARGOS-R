// ============================================================================
// ARGOS — référentiel géographique : les 75 provinces et préfectures du Royaume
// (12 régions). Coordonnées géographiques approximatives du chef-lieu ; les
// coordonnées SVG (mini-carte silhouette) sont dérivées par la transformation
// linéaire partagée avec le frontend (helpers svgToLL) :
//   x = (lng + 17) · 430 / 16      y = 40 + (36 − lat) · 650 / 15
// ============================================================================

export interface ProvinceDef {
  v: string;
  region: string;
  ll: [number, number];
}

/** Transformation géo → SVG (inverse de svgToLL côté web). */
export function llToSvg([lng, lat]: [number, number]): { x: number; y: number } {
  return { x: Math.round(((lng + 17) * 430) / 16), y: Math.round(40 + ((36 - lat) * 650) / 15) };
}

export const PROVINCES_MA: ProvinceDef[] = [
  // — Tanger-Tétouan-Al Hoceïma —
  { v: "Tanger-Assilah", region: "Tanger-Tétouan-Al Hoceïma", ll: [-5.8, 35.77] },
  { v: "M'diq-Fnideq", region: "Tanger-Tétouan-Al Hoceïma", ll: [-5.36, 35.68] },
  { v: "Tétouan", region: "Tanger-Tétouan-Al Hoceïma", ll: [-5.37, 35.57] },
  { v: "Fahs-Anjra", region: "Tanger-Tétouan-Al Hoceïma", ll: [-5.53, 35.72] },
  { v: "Larache", region: "Tanger-Tétouan-Al Hoceïma", ll: [-6.15, 35.19] },
  { v: "Al Hoceïma", region: "Tanger-Tétouan-Al Hoceïma", ll: [-3.93, 35.25] },
  { v: "Chefchaouen", region: "Tanger-Tétouan-Al Hoceïma", ll: [-5.27, 35.17] },
  { v: "Ouezzane", region: "Tanger-Tétouan-Al Hoceïma", ll: [-5.58, 34.8] },
  // — L'Oriental —
  { v: "Oujda-Angad", region: "L'Oriental", ll: [-1.91, 34.68] },
  { v: "Nador", region: "L'Oriental", ll: [-2.93, 35.17] },
  { v: "Driouch", region: "L'Oriental", ll: [-3.39, 34.98] },
  { v: "Jerada", region: "L'Oriental", ll: [-2.16, 34.31] },
  { v: "Berkane", region: "L'Oriental", ll: [-2.32, 34.92] },
  { v: "Taourirt", region: "L'Oriental", ll: [-2.89, 34.41] },
  { v: "Guercif", region: "L'Oriental", ll: [-3.35, 34.23] },
  { v: "Figuig", region: "L'Oriental", ll: [-1.23, 32.11] },
  // — Fès-Meknès —
  { v: "Fès", region: "Fès-Meknès", ll: [-4.98, 34.03] },
  { v: "Meknès", region: "Fès-Meknès", ll: [-5.55, 33.9] },
  { v: "El Hajeb", region: "Fès-Meknès", ll: [-5.37, 33.69] },
  { v: "Ifrane", region: "Fès-Meknès", ll: [-5.11, 33.53] },
  { v: "Moulay Yacoub", region: "Fès-Meknès", ll: [-5.18, 34.09] },
  { v: "Séfrou", region: "Fès-Meknès", ll: [-4.83, 33.83] },
  { v: "Boulemane", region: "Fès-Meknès", ll: [-4.73, 33.36] },
  { v: "Taounate", region: "Fès-Meknès", ll: [-4.64, 34.54] },
  { v: "Taza", region: "Fès-Meknès", ll: [-4.01, 34.21] },
  // — Rabat-Salé-Kénitra —
  { v: "Rabat", region: "Rabat-Salé-Kénitra", ll: [-6.85, 34.02] },
  { v: "Salé", region: "Rabat-Salé-Kénitra", ll: [-6.8, 34.05] },
  { v: "Skhirate-Témara", region: "Rabat-Salé-Kénitra", ll: [-6.91, 33.92] },
  { v: "Kénitra", region: "Rabat-Salé-Kénitra", ll: [-6.58, 34.26] },
  { v: "Khémisset", region: "Rabat-Salé-Kénitra", ll: [-6.07, 33.82] },
  { v: "Sidi Kacem", region: "Rabat-Salé-Kénitra", ll: [-5.71, 34.22] },
  { v: "Sidi Slimane", region: "Rabat-Salé-Kénitra", ll: [-5.92, 34.26] },
  // — Béni Mellal-Khénifra —
  { v: "Béni Mellal", region: "Béni Mellal-Khénifra", ll: [-6.35, 32.34] },
  { v: "Azilal", region: "Béni Mellal-Khénifra", ll: [-6.57, 31.96] },
  { v: "Fquih Ben Salah", region: "Béni Mellal-Khénifra", ll: [-6.69, 32.5] },
  { v: "Khénifra", region: "Béni Mellal-Khénifra", ll: [-5.67, 32.94] },
  { v: "Khouribga", region: "Béni Mellal-Khénifra", ll: [-6.91, 32.88] },
  // — Casablanca-Settat —
  { v: "Casablanca", region: "Casablanca-Settat", ll: [-7.59, 33.57] },
  { v: "Mohammedia", region: "Casablanca-Settat", ll: [-7.38, 33.69] },
  { v: "El Jadida", region: "Casablanca-Settat", ll: [-8.51, 33.25] },
  { v: "Nouaceur", region: "Casablanca-Settat", ll: [-7.61, 33.37] },
  { v: "Médiouna", region: "Casablanca-Settat", ll: [-7.51, 33.45] },
  { v: "Benslimane", region: "Casablanca-Settat", ll: [-7.12, 33.61] },
  { v: "Berrechid", region: "Casablanca-Settat", ll: [-7.59, 33.27] },
  { v: "Settat", region: "Casablanca-Settat", ll: [-7.62, 33.0] },
  { v: "Sidi Bennour", region: "Casablanca-Settat", ll: [-8.43, 32.65] },
  // — Marrakech-Safi —
  { v: "Marrakech", region: "Marrakech-Safi", ll: [-8.01, 31.63] },
  { v: "Chichaoua", region: "Marrakech-Safi", ll: [-8.76, 31.54] },
  { v: "Al Haouz", region: "Marrakech-Safi", ll: [-7.95, 31.36] },
  { v: "El Kelâa des Sraghna", region: "Marrakech-Safi", ll: [-7.41, 32.05] },
  { v: "Essaouira", region: "Marrakech-Safi", ll: [-9.77, 31.51] },
  { v: "Rehamna", region: "Marrakech-Safi", ll: [-7.95, 32.24] },
  { v: "Safi", region: "Marrakech-Safi", ll: [-9.24, 32.3] },
  { v: "Youssoufia", region: "Marrakech-Safi", ll: [-8.53, 32.25] },
  // — Drâa-Tafilalet —
  { v: "Errachidia", region: "Drâa-Tafilalet", ll: [-4.42, 31.93] },
  { v: "Ouarzazate", region: "Drâa-Tafilalet", ll: [-6.89, 30.92] },
  { v: "Midelt", region: "Drâa-Tafilalet", ll: [-4.74, 32.68] },
  { v: "Tinghir", region: "Drâa-Tafilalet", ll: [-5.53, 31.51] },
  { v: "Zagora", region: "Drâa-Tafilalet", ll: [-5.84, 30.33] },
  // — Souss-Massa —
  { v: "Agadir Ida-Outanane", region: "Souss-Massa", ll: [-9.6, 30.42] },
  { v: "Inezgane-Aït Melloul", region: "Souss-Massa", ll: [-9.53, 30.36] },
  { v: "Chtouka-Aït Baha", region: "Souss-Massa", ll: [-9.15, 30.06] },
  { v: "Taroudant", region: "Souss-Massa", ll: [-8.88, 30.47] },
  { v: "Tiznit", region: "Souss-Massa", ll: [-9.73, 29.7] },
  { v: "Tata", region: "Souss-Massa", ll: [-7.97, 29.75] },
  // — Guelmim-Oued Noun —
  { v: "Guelmim", region: "Guelmim-Oued Noun", ll: [-10.06, 28.99] },
  { v: "Assa-Zag", region: "Guelmim-Oued Noun", ll: [-9.43, 28.61] },
  { v: "Sidi Ifni", region: "Guelmim-Oued Noun", ll: [-10.17, 29.38] },
  { v: "Tan-Tan", region: "Guelmim-Oued Noun", ll: [-11.1, 28.44] },
  // — Laâyoune-Sakia El Hamra —
  { v: "Laâyoune", region: "Laâyoune-Sakia El Hamra", ll: [-13.2, 27.15] },
  { v: "Boujdour", region: "Laâyoune-Sakia El Hamra", ll: [-14.48, 26.13] },
  { v: "Tarfaya", region: "Laâyoune-Sakia El Hamra", ll: [-12.93, 27.94] },
  { v: "Es-Semara", region: "Laâyoune-Sakia El Hamra", ll: [-11.67, 26.74] },
  // — Dakhla-Oued Ed-Dahab —
  { v: "Oued Ed-Dahab (Dakhla)", region: "Dakhla-Oued Ed-Dahab", ll: [-15.94, 23.68] },
  { v: "Aousserd", region: "Dakhla-Oued Ed-Dahab", ll: [-14.33, 22.55] },
];

/**
 * Les 12 régions administratives du Maroc, dérivées du référentiel ci-dessus.
 *
 * La liste n'existait qu'implicitement : chaque province porte sa région, mais
 * rien n'énumérait l'ensemble. Sans énumération, `Incident.region` restait une
 * chaîne libre — et le seed contenait déjà « Oriental » là où le référentiel
 * dit « L'Oriental », ce qui produisait deux entrées distinctes dans les
 * filtres. La constante ferme cette porte.
 */
export const REGIONS_MA: string[] = [...new Set(PROVINCES_MA.map((p) => p.region))].sort();
