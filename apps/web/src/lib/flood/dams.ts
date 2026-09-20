// ============================================================================
// ARGOS — référentiel des grands barrages et des grands oueds du Royaume, pour
// cadrer une simulation d'inondation sur des chiffres réels.
//
// Capacités : la retenue NORMALE (hm³ = millions de m³), telle que la publient
// le ministère de l'Équipement et de l'Eau (Direction générale de l'hydraulique,
// bulletins de situation des barrages) et les agences de bassin — la retenue
// maximale (crue de projet) est plus haute de 5 à 10 %. Hauteurs : hauteur
// maximale sur fondations. Positions : approchées (± quelques kilomètres) —
// l'opérateur pose le point de rupture sur le barrage à l'écran. Le Royaume
// compte ~150 grands barrages pour ~20 milliards de m³ (2024) ; les plus
// grands sont ici. Valeurs INDICATIVES, à confirmer auprès de l'ABH / DGH
// avant tout usage autre qu'un cadrage.
// ============================================================================

export interface DamRef {
  id: string;
  nom: string;
  oued: string;
  province: string;
  /** Retenue normale (hm³). */
  capacityHm3: number;
  /** Hauteur du barrage (m). */
  heightM: number;
  ll: [number, number];
  /** En construction ou en surélévation : capacité prévue. */
  note?: string;
}

export const DAMS_MA: readonly DamRef[] = [
  { id: "al-wahda", nom: "Al Wahda", oued: "Ouergha", province: "Taounate / Sidi Kacem", capacityHm3: 3522, heightM: 88, ll: [-5.36, 34.6], note: "Le plus grand du Royaume ; retenue maximale ≈ 3 800 hm³." },
  { id: "al-massira", nom: "Al Massira", oued: "Oum Er-Rbia", province: "Settat", capacityHm3: 2760, heightM: 80, ll: [-7.62, 32.47] },
  { id: "bin-el-ouidane", nom: "Bin El Ouidane", oued: "El Abid", province: "Azilal", capacityHm3: 1384, heightM: 133, ll: [-6.45, 32.1] },
  { id: "idriss-1er", nom: "Idriss Ier", oued: "Inaouène", province: "Taounate / Fès", capacityHm3: 1186, heightM: 72, ll: [-4.77, 34.1] },
  { id: "smba", nom: "Sidi Mohamed Ben Abdellah", oued: "Bouregreg", province: "Rabat / Skhirate-Témara", capacityHm3: 1024, heightM: 100, ll: [-6.76, 33.94], note: "Après surélévation (2006)." },
  { id: "oued-el-makhazine", nom: "Oued El Makhazine", oued: "Loukkos", province: "Larache", capacityHm3: 773, heightM: 67, ll: [-5.82, 34.94] },
  { id: "ahmed-el-hansali", nom: "Ahmed El Hansali", oued: "Oum Er-Rbia", province: "Béni Mellal / Khénifra", capacityHm3: 740, heightM: 101, ll: [-6.1, 32.77] },
  { id: "mohammed-v", nom: "Mohammed V", oued: "Moulouya", province: "Taourirt / Nador", capacityHm3: 730, heightM: 64, ll: [-2.75, 34.65], note: "Capacité initiale ; fortement envasé." },
  { id: "mdez", nom: "M'dez", oued: "Sebou (haut)", province: "Séfrou", capacityHm3: 700, heightM: 109, ll: [-4.62, 33.53] },
  { id: "tiddas", nom: "Tiddas", oued: "Bouregreg", province: "Khémisset", capacityHm3: 640, heightM: 120, ll: [-6.31, 33.66], note: "En construction (mise en eau prévue)." },
  { id: "mansour-eddahbi", nom: "Mansour Eddahbi", oued: "Drâa", province: "Ouarzazate", capacityHm3: 560, heightM: 70, ll: [-6.79, 30.92], note: "Capacité initiale ; envasé (≈ 440 hm³)." },
  { id: "dar-khrofa", nom: "Dar Khrofa", oued: "Makhazine (Loukkos)", province: "Larache", capacityHm3: 480, heightM: 62, ll: [-5.82, 35.03] },
  { id: "hassan-ii", nom: "Hassan II", oued: "Moulouya", province: "Midelt", capacityHm3: 400, heightM: 122, ll: [-4.77, 32.94] },
  { id: "hassan-addakhil", nom: "Hassan Addakhil", oued: "Ziz", province: "Errachidia", capacityHm3: 380, heightM: 82, ll: [-4.42, 32.07], note: "Capacité initiale ; envasé." },
  { id: "asfalou", nom: "Asfalou", oued: "Asfalou (Ouergha)", province: "Taounate", capacityHm3: 317, heightM: 121, ll: [-4.63, 34.6] },
  { id: "9-avril-1947", nom: "9 Avril 1947", oued: "Hachef", province: "Tanger-Assilah", capacityHm3: 300, heightM: 33, ll: [-5.72, 35.61] },
  { id: "youssef-ben-tachfine", nom: "Youssef Ben Tachfine", oued: "Massa", province: "Tiznit", capacityHm3: 298, heightM: 85, ll: [-9.53, 29.85] },
  { id: "el-kansera", nom: "El Kansera", oued: "Beht", province: "Khémisset", capacityHm3: 267, heightM: 68, ll: [-5.93, 34.03] },
  { id: "kaddoussa", nom: "Kaddoussa", oued: "Guir", province: "Errachidia", capacityHm3: 220, heightM: 65, ll: [-3.61, 32.06] },
  { id: "abdelmoumen", nom: "Abdelmoumen", oued: "Issen", province: "Taroudant", capacityHm3: 216, heightM: 94, ll: [-9.13, 30.64] },
  { id: "moulay-youssef", nom: "Moulay Youssef", oued: "Tessaout", province: "Azilal / El Kelâa des Sraghna", capacityHm3: 197, heightM: 100, ll: [-7.05, 31.72] },
  { id: "sidi-chahed", nom: "Sidi Chahed", oued: "Mikkès", province: "Meknès / Fès", capacityHm3: 170, heightM: 61, ll: [-5.29, 34.02] },
  { id: "martil", nom: "Martil", oued: "Martil", province: "Tétouan", capacityHm3: 120, heightM: 61, ll: [-5.4, 35.51] },
  { id: "sakia-el-hamra", nom: "Sakia El Hamra", oued: "Sakia El Hamra", province: "Laâyoune", capacityHm3: 110, heightM: 40, ll: [-13.05, 27.15] },
  { id: "aoulouz", nom: "Aoulouz", oued: "Souss", province: "Taroudant", capacityHm3: 108, heightM: 75, ll: [-8.17, 30.68] },
  { id: "allal-el-fassi", nom: "Allal El Fassi", oued: "Sebou", province: "Séfrou / Fès", capacityHm3: 82, heightM: 65, ll: [-4.63, 33.92] },
  { id: "fask", nom: "Fask", oued: "Sayad", province: "Guelmim", capacityHm3: 78, heightM: 60, ll: [-9.95, 28.96] },
  { id: "zerrar", nom: "Zerrar", oued: "Ksob", province: "Essaouira", capacityHm3: 70, heightM: 65, ll: [-9.68, 31.41] },
  { id: "lalla-takerkoust", nom: "Lalla Takerkoust", oued: "N'Fis", province: "Al Haouz", capacityHm3: 68, heightM: 71, ll: [-8.13, 31.36] },
  { id: "smir", nom: "Smir", oued: "Smir", province: "M'diq-Fnideq", capacityHm3: 43, heightM: 43, ll: [-5.38, 35.74] },
  { id: "ibn-battouta", nom: "Ibn Battouta", oued: "Mharhar", province: "Tanger-Assilah", capacityHm3: 43, heightM: 33, ll: [-5.83, 35.63] },
  { id: "abdelkrim-el-khattabi", nom: "Abdelkrim El Khattabi", oued: "Nekor", province: "Al Hoceïma", capacityHm3: 35, heightM: 46, ll: [-3.87, 35.16] },
  { id: "bab-louta", nom: "Bab Louta", oued: "Bouzemlane", province: "Taza", capacityHm3: 35, heightM: 54, ll: [-4.32, 34.05] },
];

/** Un grand oued et un ordre de grandeur de ses crues marquantes (m³/s) — pour préremplir une crue de rivière. */
export interface RiverRef {
  id: string;
  nom: string;
  region: string;
  /** Débit de pointe d'une crue marquante (m³/s) et son événement. */
  peakQ: number;
  event: string;
  /** Durée typique de la crue (h) : longue sur les grands bassins, brève sur les oueds de montagne. */
  durationH: number;
}

export const RIVERS_MA: readonly RiverRef[] = [
  { id: "sebou", nom: "Sebou (Gharb)", region: "Rabat-Salé-Kénitra / Fès-Meknès", peakQ: 7000, event: "crue de janvier 1963 (Azib Soltane)", durationH: 72 },
  { id: "moulouya", nom: "Moulouya", region: "L'Oriental", peakQ: 7000, event: "crue de 1963", durationH: 48 },
  { id: "oum-er-rbia", nom: "Oum Er-Rbia", region: "Béni Mellal-Khénifra / Casablanca-Settat", peakQ: 4000, event: "grandes crues historiques", durationH: 48 },
  { id: "loukkos", nom: "Loukkos", region: "Tanger-Tétouan-Al Hoceïma", peakQ: 3000, event: "crues du Gharb nord", durationH: 36 },
  { id: "ziz", nom: "Ziz", region: "Drâa-Tafilalet", peakQ: 3000, event: "crue de 1965 (avant Hassan Addakhil)", durationH: 24 },
  { id: "guir", nom: "Guir", region: "Drâa-Tafilalet", peakQ: 2500, event: "crue d'octobre 2008", durationH: 24 },
  { id: "souss", nom: "Souss", region: "Souss-Massa", peakQ: 2500, event: "crue de novembre 2014", durationH: 24 },
  { id: "tensift", nom: "Tensift", region: "Marrakech-Safi", peakQ: 2000, event: "crues hivernales", durationH: 24 },
  { id: "draa", nom: "Drâa", region: "Drâa-Tafilalet", peakQ: 1800, event: "crue de novembre 2014", durationH: 24 },
  { id: "bouregreg", nom: "Bouregreg", region: "Rabat-Salé-Kénitra", peakQ: 1500, event: "crues de 2010", durationH: 36 },
  { id: "el-maleh", nom: "El Maleh (Mohammedia)", region: "Casablanca-Settat", peakQ: 1200, event: "crue de novembre 2002", durationH: 12 },
  { id: "ourika", nom: "Ourika", region: "Marrakech-Safi", peakQ: 1030, event: "crue éclair du 17 août 1995", durationH: 6 },
  { id: "martil", nom: "Martil", region: "Tanger-Tétouan-Al Hoceïma", peakQ: 700, event: "crues de l'an 2000", durationH: 12 },
  { id: "issen", nom: "Issen / Aït Baha (oueds de montagne du Souss)", region: "Souss-Massa", peakQ: 600, event: "crues éclair", durationH: 6 },
];

export function damById(id: string): DamRef | undefined {
  return DAMS_MA.find((d) => d.id === id);
}
