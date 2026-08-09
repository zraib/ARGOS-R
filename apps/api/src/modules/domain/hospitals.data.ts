// ============================================================================
// ARGOS — référentiel hospitalier national
// Deux réseaux distincts, tous deux visibles sur la carte opérationnelle avec
// des symboles différenciés (voir lib/map/markers.ts côté web) :
//   • réseau MILITAIRE  — Service de Santé des FAR (7 établissements) ;
//   • réseau CIVIL      — hôpitaux publics du ministère de la Santé, classés
//     par échelon : CHU (universitaire), CHR/CHIR (régional), CHP / hôpital
//     local / hôpital psychiatrique (provincial).
//
// Les coordonnées x/y positionnent le marqueur sur la silhouette du tableau de
// bord : elles dérivent de `ll` par la transformation llToSvg (provinces.data).
//
// ATTENTION — les capacités du réseau CIVIL (lits, réanimation, effectifs,
// véhicules) sont des ESTIMATIONS DE DÉMONSTRATION calibrées par échelon ;
// seuls le nom, la ville, la province, la région et l'échelon proviennent du
// référentiel officiel. À remplacer par les chiffres réels du ministère de la
// Santé lors du raccordement au SI hospitalier.
// ============================================================================

/**
 * Nature d'un établissement de santé — pilote le symbole cartographique.
 * `mil_field` / `civ_field` sont portés par les hôpitaux de campagne
 * (structures déployées, voir FieldHospital).
 */
export type HospitalKind = "mil" | "mil_field" | "civ" | "civ_reg" | "civ_univ" | "civ_field";

export interface HospitalDef {
  id: string;
  nom: string;
  ville: string;
  region: string;
  /** Province ou préfecture de rattachement. */
  province: string;
  kind: HospitalKind;
  /** Libellé de l'échelon (CHU, CHR, CHP, hôpital militaire…). */
  type: string;
  lits: number;
  occ: number;
  rea: number;
  reaOcc: number;
  staff: number;
  amb: number;
  heli: number;
  x: number;
  y: number;
  ll: [number, number];
}

/** Réseau hospitalier militaire (source : état-major du Service de Santé). */
export const MILITARY_HOSPITALS: HospitalDef[] = [
  { id: "H1", nom: "Hôpital Militaire d'Instruction Mohammed V", ville: "Rabat", region: "Rabat-Salé-Kénitra", province: "Rabat", kind: "mil", type: "Hôpital militaire d'instruction (CHU)", lits: 650, occ: 512, rea: 48, reaOcc: 39, staff: 820, amb: 24, heli: 3, x: 199, y: 152, ll: [-6.85, 34.01] },
  { id: "H2", nom: "Hôpital Militaire Moulay Youssef", ville: "Casablanca", region: "Casablanca-Settat", province: "Casablanca", kind: "mil", type: "Hôpital militaire général", lits: 380, occ: 291, rea: 30, reaOcc: 21, staff: 490, amb: 16, heli: 1, x: 178, y: 172, ll: [-7.62, 33.59] },
  { id: "H3", nom: "Hôpital Militaire Moulay Ismaïl", ville: "Meknès", region: "Fès-Meknès", province: "Meknès", kind: "mil", type: "Hôpital militaire général", lits: 300, occ: 201, rea: 24, reaOcc: 12, staff: 410, amb: 12, heli: 1, x: 252, y: 146, ll: [-5.55, 33.89] },
  { id: "H4", nom: "Hôpital Militaire Avicenne", ville: "Marrakech", region: "Marrakech-Safi", province: "Marrakech", kind: "mil", type: "Hôpital militaire général", lits: 420, occ: 388, rea: 36, reaOcc: 34, staff: 560, amb: 18, heli: 2, x: 184, y: 266, ll: [-8.02, 31.64] },
  { id: "H5", nom: "Hôpital Militaire Ben Sergao (Dcheira)", ville: "Agadir", region: "Souss-Massa", province: "Agadir Ida-Ou-Tanane", kind: "mil", type: "Hôpital militaire général", lits: 280, occ: 246, rea: 20, reaOcc: 17, staff: 365, amb: 14, heli: 1, x: 118, y: 338, ll: [-9.56, 30.37] },
  { id: "H6", nom: "Hôpital Militaire Hassan II", ville: "Laâyoune", region: "Laâyoune-Sakia El Hamra", province: "Laâyoune", kind: "mil", type: "Hôpital militaire régional", lits: 180, occ: 92, rea: 12, reaOcc: 5, staff: 210, amb: 8, heli: 1, x: 58, y: 458, ll: [-13.2, 27.15] },
  { id: "H7", nom: "Hôpital Militaire de Dakhla", ville: "Dakhla", region: "Dakhla-Oued Ed-Dahab", province: "Oued Ed-Dahab", kind: "mil", type: "Hôpital militaire", lits: 120, occ: 61, rea: 8, reaOcc: 3, staff: 145, amb: 6, heli: 1, x: 42, y: 620, ll: [-15.93, 23.72] },
];

/**
 * Réseau hospitalier public civil (ministère de la Santé) — 106 établissements
 * répartis sur les 12 régions. Capacités : estimations de démonstration.
 */
export const CIVIL_HOSPITALS: HospitalDef[] = [
  // — Tanger-Tétouan-Al Hoceïma —
  { id: "HC001", nom: "CHU Mohammed VI de Tanger", ville: "Tanger", region: "Tanger-Tétouan-Al Hoceïma", province: "Tanger-Assilah", kind: "civ_univ", type: "Centre hospitalier universitaire (CHU)", lits: 659, occ: 606, rea: 51, reaOcc: 31, staff: 1374, amb: 23, heli: 2, x: 301, y: 50, ll: [-5.8, 35.77] },
  { id: "HC002", nom: "Hôpital Mohammed V", ville: "Tétouan", region: "Tanger-Tétouan-Al Hoceïma", province: "Tétouan", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 214, occ: 137, rea: 16, reaOcc: 12, staff: 278, amb: 7, heli: 0, x: 313, y: 59, ll: [-5.37, 35.57] },
  { id: "HC003", nom: "Hôpital Saniat Rmel", ville: "Tétouan", region: "Tanger-Tétouan-Al Hoceïma", province: "Tétouan", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 192, occ: 148, rea: 9, reaOcc: 5, staff: 199, amb: 5, heli: 0, x: 312, y: 58, ll: [-5.3863, 35.5822] },
  { id: "HC004", nom: "Hôpital Mohammed V", ville: "Al Hoceïma", region: "Tanger-Tétouan-Al Hoceïma", province: "Al Hoceïma", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 237, occ: 187, rea: 12, reaOcc: 11, staff: 324, amb: 12, heli: 0, x: 351, y: 72, ll: [-3.93, 35.25] },
  { id: "HC005", nom: "Hôpital Moulay Ali Cherif", ville: "Chefchaouen", region: "Tanger-Tétouan-Al Hoceïma", province: "Chefchaouen", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 115, occ: 91, rea: 15, reaOcc: 7, staff: 320, amb: 8, heli: 0, x: 315, y: 76, ll: [-5.27, 35.17] },
  { id: "HC006", nom: "Hôpital Jawdat Mokhtar", ville: "Larache", region: "Tanger-Tétouan-Al Hoceïma", province: "Larache", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 216, occ: 136, rea: 19, reaOcc: 17, staff: 223, amb: 11, heli: 0, x: 292, y: 75, ll: [-6.15, 35.19] },
  { id: "HC007", nom: "Hôpital Mohammed V", ville: "Ouazzane", region: "Tanger-Tétouan-Al Hoceïma", province: "Ouazzane", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 254, occ: 229, rea: 8, reaOcc: 5, staff: 305, amb: 12, heli: 0, x: 307, y: 92, ll: [-5.58, 34.8] },
  { id: "HC008", nom: "Hôpital de Fahs-Anjra", ville: "Fahs", region: "Tanger-Tétouan-Al Hoceïma", province: "Fahs-Anjra", kind: "civ", type: "Hôpital local", lits: 77, occ: 57, rea: 3, reaOcc: 2, staff: 127, amb: 5, heli: 0, x: 308, y: 52, ll: [-5.53, 35.72] },
  { id: "HC009", nom: "Hôpital de Fnideq", ville: "Fnideq", region: "Tanger-Tétouan-Al Hoceïma", province: "M'diq-Fnideq", kind: "civ", type: "Hôpital local", lits: 94, occ: 79, rea: 4, reaOcc: 3, staff: 108, amb: 6, heli: 0, x: 313, y: 46, ll: [-5.36, 35.85] },
  { id: "HC010", nom: "Hôpital de Martil", ville: "Martil", region: "Tanger-Tétouan-Al Hoceïma", province: "Tétouan", kind: "civ", type: "Hôpital local", lits: 52, occ: 42, rea: 3, reaOcc: 3, staff: 83, amb: 4, heli: 0, x: 315, y: 56, ll: [-5.27, 35.62] },
  { id: "HC011", nom: "Hôpital Psychiatrique El Idrissi", ville: "Tétouan", region: "Tanger-Tétouan-Al Hoceïma", province: "Tétouan", kind: "civ", type: "Hôpital psychiatrique", lits: 159, occ: 135, rea: 1, reaOcc: 1, staff: 131, amb: 3, heli: 0, x: 313, y: 60, ll: [-5.3678, 35.5496] },
  // — L'Oriental —
  { id: "HC012", nom: "CHU Mohammed VI d'Oujda", ville: "Oujda", region: "L'Oriental", province: "Oujda-Angad", kind: "civ_univ", type: "Centre hospitalier universitaire (CHU)", lits: 897, occ: 664, rea: 52, reaOcc: 26, staff: 1174, amb: 18, heli: 2, x: 406, y: 97, ll: [-1.91, 34.68] },
  { id: "HC013", nom: "CHR Mohammed V", ville: "Nador", region: "L'Oriental", province: "Nador", kind: "civ_reg", type: "Centre hospitalier régional (CHR)", lits: 292, occ: 210, rea: 30, reaOcc: 16, staff: 513, amb: 15, heli: 1, x: 378, y: 76, ll: [-2.93, 35.17] },
  { id: "HC014", nom: "Hôpital Moulay Rachid", ville: "Berkane", region: "L'Oriental", province: "Berkane", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 219, occ: 188, rea: 15, reaOcc: 13, staff: 235, amb: 11, heli: 0, x: 395, y: 87, ll: [-2.32, 34.92] },
  { id: "HC015", nom: "Hôpital Mohammed V", ville: "Taourirt", region: "L'Oriental", province: "Taourirt", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 133, occ: 109, rea: 8, reaOcc: 6, staff: 286, amb: 8, heli: 0, x: 379, y: 109, ll: [-2.89, 34.41] },
  { id: "HC016", nom: "Hôpital Mohammed V", ville: "Jerada", region: "L'Oriental", province: "Jerada", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 157, occ: 96, rea: 19, reaOcc: 14, staff: 281, amb: 5, heli: 0, x: 399, y: 113, ll: [-2.16, 34.31] },
  { id: "HC017", nom: "Hôpital Mohammed V", ville: "Guercif", region: "L'Oriental", province: "Guercif", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 232, occ: 135, rea: 9, reaOcc: 6, staff: 253, amb: 5, heli: 0, x: 367, y: 117, ll: [-3.35, 34.23] },
  { id: "HC018", nom: "Hôpital Mohammed V", ville: "Driouch", region: "L'Oriental", province: "Driouch", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 154, occ: 119, rea: 17, reaOcc: 10, staff: 312, amb: 5, heli: 0, x: 366, y: 84, ll: [-3.39, 34.98] },
  { id: "HC019", nom: "Hôpital Mohammed V", ville: "Figuig", region: "L'Oriental", province: "Figuig", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 253, occ: 154, rea: 13, reaOcc: 12, staff: 200, amb: 6, heli: 0, x: 424, y: 209, ll: [-1.23, 32.11] },
  { id: "HC020", nom: "Hôpital Al Farabi", ville: "Oujda", region: "L'Oriental", province: "Oujda-Angad", kind: "civ", type: "Hôpital psychiatrique", lits: 121, occ: 86, rea: 4, reaOcc: 2, staff: 208, amb: 4, heli: 0, x: 405, y: 97, ll: [-1.9261, 34.6922] },
  // — Fès-Meknès —
  { id: "HC021", nom: "CHU Hassan II — Hôpital Al Ghassani", ville: "Fès", region: "Fès-Meknès", province: "Fès", kind: "civ_univ", type: "Centre hospitalier universitaire (CHU)", lits: 648, occ: 473, rea: 68, reaOcc: 39, staff: 1144, amb: 20, heli: 1, x: 323, y: 125, ll: [-4.98, 34.03] },
  { id: "HC022", nom: "CHU Hassan II — Hôpital Ibn al Khatib", ville: "Fès", region: "Fès-Meknès", province: "Fès", kind: "civ_univ", type: "Centre hospitalier universitaire (CHU)", lits: 645, occ: 361, rea: 59, reaOcc: 56, staff: 1338, amb: 20, heli: 1, x: 323, y: 125, ll: [-4.996, 34.0422] },
  { id: "HC023", nom: "CHU Hassan II — Hôpital Al Omari", ville: "Fès", region: "Fès-Meknès", province: "Fès", kind: "civ_univ", type: "Centre hospitalier universitaire (CHU)", lits: 870, occ: 618, rea: 64, reaOcc: 30, staff: 978, amb: 21, heli: 2, x: 323, y: 126, ll: [-4.9778, 34.0096] },
  { id: "HC024", nom: "CHU Hassan II — Hôpital Mère-Enfant", ville: "Fès", region: "Fès-Meknès", province: "Fès", kind: "civ_univ", type: "Centre hospitalier universitaire (CHU)", lits: 869, occ: 704, rea: 60, reaOcc: 47, staff: 1342, amb: 25, heli: 2, x: 323, y: 125, ll: [-4.9636, 34.0478] },
  { id: "HC025", nom: "CHP Mohammed V", ville: "Meknès", region: "Fès-Meknès", province: "Meknès", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 257, occ: 234, rea: 17, reaOcc: 15, staff: 217, amb: 12, heli: 0, x: 308, y: 131, ll: [-5.55, 33.9] },
  { id: "HC026", nom: "CHP Moulay Ismail", ville: "Meknès", region: "Fès-Meknès", province: "Meknès", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 130, occ: 105, rea: 17, reaOcc: 8, staff: 260, amb: 9, heli: 0, x: 307, y: 130, ll: [-5.566, 33.9122] },
  { id: "HC027", nom: "Hôpital Mohammed V", ville: "Ifrane", region: "Fès-Meknès", province: "Ifrane", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 254, occ: 208, rea: 17, reaOcc: 15, staff: 192, amb: 10, heli: 0, x: 320, y: 147, ll: [-5.11, 33.53] },
  { id: "HC028", nom: "Hôpital Mohammed V", ville: "El Hajeb", region: "Fès-Meknès", province: "El Hajeb", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 152, occ: 91, rea: 15, reaOcc: 14, staff: 311, amb: 9, heli: 0, x: 313, y: 140, ll: [-5.37, 33.69] },
  { id: "HC029", nom: "Hôpital Mohammed V", ville: "Sefrou", region: "Fès-Meknès", province: "Sefrou", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 243, occ: 177, rea: 8, reaOcc: 6, staff: 290, amb: 5, heli: 0, x: 327, y: 134, ll: [-4.83, 33.83] },
  { id: "HC030", nom: "Hôpital Mohammed V", ville: "Moulay Yaacoub", region: "Fès-Meknès", province: "Moulay Yaacoub", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 150, occ: 126, rea: 12, reaOcc: 8, staff: 261, amb: 11, heli: 0, x: 318, y: 123, ll: [-5.18, 34.09] },
  { id: "HC031", nom: "Hôpital Mohammed V", ville: "Taounate", region: "Fès-Meknès", province: "Taounate", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 268, occ: 212, rea: 8, reaOcc: 5, staff: 166, amb: 6, heli: 0, x: 332, y: 103, ll: [-4.64, 34.54] },
  { id: "HC032", nom: "Hôpital Mohammed V", ville: "Taza", region: "Fès-Meknès", province: "Taza", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 197, occ: 122, rea: 8, reaOcc: 6, staff: 296, amb: 12, heli: 0, x: 349, y: 118, ll: [-4.01, 34.21] },
  { id: "HC033", nom: "Hôpital Mohammed V", ville: "Boulmane", region: "Fès-Meknès", province: "Boulmane", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 143, occ: 132, rea: 12, reaOcc: 7, staff: 270, amb: 8, heli: 0, x: 330, y: 154, ll: [-4.73, 33.36] },
  { id: "HC034", nom: "Hôpital local d'Azrou", ville: "Azrou", region: "Fès-Meknès", province: "Ifrane", kind: "civ", type: "Hôpital local", lits: 73, occ: 48, rea: 7, reaOcc: 4, staff: 127, amb: 4, heli: 0, x: 317, y: 151, ll: [-5.22, 33.44] },
  { id: "HC035", nom: "Hôpital Psychiatrique El Ouazzani", ville: "Meknès", region: "Fès-Meknès", province: "Meknès", kind: "civ", type: "Hôpital psychiatrique", lits: 134, occ: 80, rea: 4, reaOcc: 2, staff: 174, amb: 2, heli: 0, x: 308, y: 132, ll: [-5.5478, 33.8796] },
  // — Rabat-Salé-Kénitra —
  { id: "HC036", nom: "CHU Ibn Sina — Hôpital Avicenne", ville: "Rabat", region: "Rabat-Salé-Kénitra", province: "Rabat", kind: "civ_univ", type: "Centre hospitalier universitaire (CHU)", lits: 705, occ: 634, rea: 72, reaOcc: 43, staff: 1081, amb: 19, heli: 2, x: 273, y: 126, ll: [-6.84, 34.02] },
  { id: "HC037", nom: "CHU Ibn Sina — Hôpital d'Enfants de Rabat", ville: "Rabat", region: "Rabat-Salé-Kénitra", province: "Rabat", kind: "civ_univ", type: "Centre hospitalier universitaire (CHU)", lits: 857, occ: 797, rea: 48, reaOcc: 43, staff: 1124, amb: 28, heli: 1, x: 273, y: 125, ll: [-6.856, 34.0322] },
  { id: "HC038", nom: "CHU Ibn Sina — Hôpital des Spécialités", ville: "Rabat", region: "Rabat-Salé-Kénitra", province: "Rabat", kind: "civ_univ", type: "Centre hospitalier universitaire (CHU)", lits: 800, occ: 624, rea: 45, reaOcc: 32, staff: 1152, amb: 23, heli: 1, x: 273, y: 127, ll: [-6.8378, 33.9996] },
  { id: "HC039", nom: "CHU Ibn Sina — Maternité Souissi", ville: "Rabat", region: "Rabat-Salé-Kénitra", province: "Rabat", kind: "civ_univ", type: "Centre hospitalier universitaire (CHU)", lits: 797, occ: 558, rea: 64, reaOcc: 51, staff: 1101, amb: 22, heli: 1, x: 273, y: 125, ll: [-6.8236, 34.0378] },
  { id: "HC040", nom: "Institut National d'Oncologie", ville: "Rabat", region: "Rabat-Salé-Kénitra", province: "Rabat", kind: "civ_reg", type: "Centre hospitalier inter-régional (CHIR)", lits: 323, occ: 210, rea: 18, reaOcc: 14, staff: 345, amb: 12, heli: 0, x: 272, y: 126, ll: [-6.8685, 34.0158] },
  { id: "HC041", nom: "Hôpital Moulay Abdellah", ville: "Salé", region: "Rabat-Salé-Kénitra", province: "Salé", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 204, occ: 120, rea: 14, reaOcc: 10, staff: 356, amb: 9, heli: 0, x: 274, y: 125, ll: [-6.8, 34.05] },
  { id: "HC042", nom: "CHR Mohammed V", ville: "Kénitra", region: "Rabat-Salé-Kénitra", province: "Kénitra", kind: "civ_reg", type: "Centre hospitalier régional (CHR)", lits: 351, occ: 281, rea: 22, reaOcc: 20, staff: 585, amb: 14, heli: 0, x: 280, y: 115, ll: [-6.58, 34.26] },
  { id: "HC043", nom: "Hôpital Mohammed V", ville: "Khémisset", region: "Rabat-Salé-Kénitra", province: "Khémisset", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 244, occ: 224, rea: 18, reaOcc: 9, staff: 166, amb: 6, heli: 0, x: 294, y: 134, ll: [-6.07, 33.82] },
  { id: "HC044", nom: "Hôpital Mohammed V", ville: "Sidi Kacem", region: "Rabat-Salé-Kénitra", province: "Sidi Kacem", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 145, occ: 128, rea: 8, reaOcc: 5, staff: 360, amb: 10, heli: 0, x: 303, y: 117, ll: [-5.71, 34.22] },
  { id: "HC045", nom: "Hôpital Mohammed V", ville: "Sidi Slimane", region: "Rabat-Salé-Kénitra", province: "Sidi Slimane", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 257, occ: 226, rea: 11, reaOcc: 5, staff: 234, amb: 8, heli: 0, x: 298, y: 115, ll: [-5.92, 34.26] },
  { id: "HC046", nom: "Hôpital Mohammed V", ville: "Témara", region: "Rabat-Salé-Kénitra", province: "Skhirat-Témara", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 177, occ: 122, rea: 10, reaOcc: 8, staff: 250, amb: 9, heli: 0, x: 271, y: 130, ll: [-6.91, 33.92] },
  { id: "HC047", nom: "Hôpital Psychiatrique Arrazi", ville: "Salé", region: "Rabat-Salé-Kénitra", province: "Salé", kind: "civ", type: "Hôpital psychiatrique", lits: 107, occ: 85, rea: 4, reaOcc: 3, staff: 201, amb: 3, heli: 0, x: 274, y: 124, ll: [-6.816, 34.0622] },
  // — Béni Mellal-Khénifra —
  { id: "HC048", nom: "CHR Béni Mellal", ville: "Béni Mellal", region: "Béni Mellal-Khénifra", province: "Béni Mellal", kind: "civ_reg", type: "Centre hospitalier régional (CHR)", lits: 329, occ: 293, rea: 24, reaOcc: 12, staff: 527, amb: 13, heli: 0, x: 286, y: 199, ll: [-6.35, 32.34] },
  { id: "HC049", nom: "Hôpital Mohammed V", ville: "Azilal", region: "Béni Mellal-Khénifra", province: "Azilal", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 215, occ: 150, rea: 19, reaOcc: 15, staff: 354, amb: 11, heli: 0, x: 280, y: 215, ll: [-6.57, 31.96] },
  { id: "HC050", nom: "Hôpital Mohammed V", ville: "Fquih Ben Salah", region: "Béni Mellal-Khénifra", province: "Fquih Ben Salah", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 133, occ: 116, rea: 18, reaOcc: 11, staff: 288, amb: 9, heli: 0, x: 277, y: 192, ll: [-6.69, 32.5] },
  { id: "HC051", nom: "Hôpital Mohammed V", ville: "Khouribga", region: "Béni Mellal-Khénifra", province: "Khouribga", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 141, occ: 87, rea: 16, reaOcc: 12, staff: 289, amb: 6, heli: 0, x: 271, y: 175, ll: [-6.91, 32.88] },
  { id: "HC052", nom: "Hôpital Mohammed V", ville: "Khénifra", region: "Béni Mellal-Khénifra", province: "Khénifra", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 260, occ: 237, rea: 18, reaOcc: 10, staff: 259, amb: 8, heli: 0, x: 304, y: 173, ll: [-5.67, 32.94] },
  { id: "HC053", nom: "Hôpital local d'Oued Zem", ville: "Oued Zem", region: "Béni Mellal-Khénifra", province: "Khouribga", kind: "civ", type: "Hôpital local", lits: 64, occ: 50, rea: 4, reaOcc: 4, staff: 67, amb: 4, heli: 0, x: 280, y: 176, ll: [-6.57, 32.86] },
  { id: "HC054", nom: "Hôpital local de Kasba Tadla", ville: "Kasba Tadla", region: "Béni Mellal-Khénifra", province: "Béni Mellal", kind: "civ", type: "Hôpital local", lits: 62, occ: 52, rea: 3, reaOcc: 2, staff: 96, amb: 5, heli: 0, x: 288, y: 187, ll: [-6.27, 32.6] },
  // — Casablanca-Settat —
  { id: "HC055", nom: "CHU Ibn Rochd — Hôpital 20 Août", ville: "Casablanca", region: "Casablanca-Settat", province: "Casablanca", kind: "civ_univ", type: "Centre hospitalier universitaire (CHU)", lits: 716, occ: 637, rea: 63, reaOcc: 35, staff: 1158, amb: 24, heli: 2, x: 253, y: 145, ll: [-7.59, 33.57] },
  { id: "HC056", nom: "CHU Ibn Rochd — Hôpital Mère-Enfant", ville: "Casablanca", region: "Casablanca-Settat", province: "Casablanca", kind: "civ_univ", type: "Centre hospitalier universitaire (CHU)", lits: 852, occ: 613, rea: 43, reaOcc: 41, staff: 1239, amb: 21, heli: 1, x: 252, y: 145, ll: [-7.6059, 33.5822] },
  { id: "HC057", nom: "Hôpital Moulay Youssef", ville: "Casablanca", region: "Casablanca-Settat", province: "Casablanca", kind: "civ_reg", type: "Centre hospitalier inter-régional (CHIR)", lits: 219, occ: 155, rea: 25, reaOcc: 14, staff: 320, amb: 14, heli: 0, x: 253, y: 146, ll: [-7.5879, 33.5496] },
  { id: "HC058", nom: "Hôpital Sidi Othman", ville: "Casablanca", region: "Casablanca-Settat", province: "Casablanca", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 148, occ: 92, rea: 16, reaOcc: 10, staff: 248, amb: 11, heli: 0, x: 253, y: 145, ll: [-7.5736, 33.5878] },
  { id: "HC059", nom: "Hôpital Hay Hassani", ville: "Casablanca", region: "Casablanca-Settat", province: "Casablanca", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 249, occ: 194, rea: 18, reaOcc: 12, staff: 359, amb: 10, heli: 0, x: 252, y: 145, ll: [-7.6184, 33.5658] },
  { id: "HC060", nom: "Hôpital Moulay Rachid", ville: "Casablanca", region: "Casablanca-Settat", province: "Casablanca", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 204, occ: 153, rea: 13, reaOcc: 9, staff: 321, amb: 10, heli: 0, x: 254, y: 146, ll: [-7.5643, 33.5564] },
  { id: "HC061", nom: "Hôpital Ain Chock", ville: "Casablanca", region: "Casablanca-Settat", province: "Casablanca", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 174, occ: 130, rea: 15, reaOcc: 9, staff: 280, amb: 8, heli: 0, x: 253, y: 144, ll: [-7.5983, 33.5958] },
  { id: "HC062", nom: "Hôpital Ben M'Sik", ville: "Casablanca", region: "Casablanca-Settat", province: "Casablanca", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 223, occ: 129, rea: 10, reaOcc: 6, staff: 214, amb: 10, heli: 0, x: 252, y: 146, ll: [-7.6054, 33.5453] },
  { id: "HC063", nom: "Hôpital Ain Sebaa — Hay Mohammadi", ville: "Casablanca", region: "Casablanca-Settat", province: "Casablanca", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 242, occ: 174, rea: 13, reaOcc: 6, staff: 312, amb: 11, heli: 0, x: 254, y: 145, ll: [-7.5573, 33.5799] },
  { id: "HC064", nom: "CHR El Jadida — Hôpital Mohammed V", ville: "El Jadida", region: "Casablanca-Settat", province: "El Jadida", kind: "civ_reg", type: "Centre hospitalier régional (CHR)", lits: 363, occ: 261, rea: 29, reaOcc: 18, staff: 632, amb: 14, heli: 1, x: 228, y: 159, ll: [-8.51, 33.25] },
  { id: "HC065", nom: "Hôpital Mohammed V", ville: "Mohammedia", region: "Casablanca-Settat", province: "Mohammedia", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 122, occ: 106, rea: 9, reaOcc: 4, staff: 243, amb: 5, heli: 0, x: 259, y: 140, ll: [-7.38, 33.69] },
  { id: "HC066", nom: "Hôpital Mohammed V", ville: "Settat", region: "Casablanca-Settat", province: "Settat", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 142, occ: 89, rea: 11, reaOcc: 8, staff: 355, amb: 10, heli: 0, x: 252, y: 170, ll: [-7.62, 33.0] },
  { id: "HC067", nom: "Hôpital Mohammed V", ville: "Berrechid", region: "Casablanca-Settat", province: "Berrechid", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 185, occ: 141, rea: 15, reaOcc: 14, staff: 250, amb: 6, heli: 0, x: 253, y: 158, ll: [-7.59, 33.27] },
  { id: "HC068", nom: "Hôpital Mohammed V", ville: "Benslimane", region: "Casablanca-Settat", province: "Benslimane", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 221, occ: 144, rea: 9, reaOcc: 5, staff: 188, amb: 8, heli: 0, x: 266, y: 144, ll: [-7.12, 33.61] },
  { id: "HC069", nom: "Hôpital Mohammed V", ville: "Sidi Bennour", region: "Casablanca-Settat", province: "Sidi Bennour", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 164, occ: 95, rea: 11, reaOcc: 8, staff: 315, amb: 7, heli: 0, x: 230, y: 185, ll: [-8.43, 32.65] },
  { id: "HC070", nom: "Hôpital Psychiatrique de Berrechid", ville: "Berrechid", region: "Casablanca-Settat", province: "Berrechid", kind: "civ", type: "Hôpital psychiatrique", lits: 180, occ: 158, rea: 2, reaOcc: 1, staff: 212, amb: 4, heli: 0, x: 252, y: 158, ll: [-7.6059, 33.2822] },
  { id: "HC071", nom: "Hôpital Psychiatrique Benmsik", ville: "Casablanca", region: "Casablanca-Settat", province: "Casablanca", kind: "civ", type: "Hôpital psychiatrique", lits: 126, occ: 101, rea: 2, reaOcc: 1, staff: 201, amb: 2, heli: 0, x: 252, y: 145, ll: [-7.6233, 33.5814] },
  // — Marrakech-Safi —
  { id: "HC072", nom: "CHU Mohammed VI — Hôpital Arrazi", ville: "Marrakech", region: "Marrakech-Safi", province: "Marrakech", kind: "civ_univ", type: "Centre hospitalier universitaire (CHU)", lits: 695, occ: 542, rea: 64, reaOcc: 45, staff: 1129, amb: 24, heli: 2, x: 242, y: 229, ll: [-8.01, 31.63] },
  { id: "HC073", nom: "CHU Mohammed VI — Hôpital Ibn Tofail", ville: "Marrakech", region: "Marrakech-Safi", province: "Marrakech", kind: "civ_univ", type: "Centre hospitalier universitaire (CHU)", lits: 713, occ: 585, rea: 67, reaOcc: 40, staff: 1098, amb: 27, heli: 1, x: 241, y: 229, ll: [-8.0256, 31.6422] },
  { id: "HC074", nom: "CHU Mohammed VI — Hôpital Mère-Enfant", ville: "Marrakech", region: "Marrakech-Safi", province: "Marrakech", kind: "civ_univ", type: "Centre hospitalier universitaire (CHU)", lits: 770, occ: 678, rea: 57, reaOcc: 32, staff: 1049, amb: 20, heli: 1, x: 242, y: 230, ll: [-8.0079, 31.6096] },
  { id: "HC075", nom: "CHR Safi — Hôpital Mohammed V", ville: "Safi", region: "Marrakech-Safi", province: "Safi", kind: "civ_reg", type: "Centre hospitalier régional (CHR)", lits: 289, occ: 251, rea: 22, reaOcc: 16, staff: 596, amb: 11, heli: 0, x: 209, y: 200, ll: [-9.24, 32.3] },
  { id: "HC076", nom: "Hôpital Mohammed V", ville: "Tahannaout", region: "Marrakech-Safi", province: "Al Haouz", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 161, occ: 129, rea: 13, reaOcc: 11, staff: 324, amb: 7, heli: 0, x: 243, y: 241, ll: [-7.95, 31.36] },
  { id: "HC077", nom: "Hôpital Mohammed V", ville: "Chichaoua", region: "Marrakech-Safi", province: "Chichaoua", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 115, occ: 91, rea: 11, reaOcc: 6, staff: 319, amb: 5, heli: 0, x: 221, y: 233, ll: [-8.76, 31.54] },
  { id: "HC078", nom: "Hôpital Mohammed V", ville: "El Kelaâ des Sraghna", region: "Marrakech-Safi", province: "El Kelaâ des Sraghna", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 186, occ: 156, rea: 11, reaOcc: 7, staff: 291, amb: 5, heli: 0, x: 258, y: 211, ll: [-7.41, 32.05] },
  { id: "HC079", nom: "Hôpital Mohammed V", ville: "Essaouira", region: "Marrakech-Safi", province: "Essaouira", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 155, occ: 101, rea: 18, reaOcc: 17, staff: 236, amb: 8, heli: 0, x: 194, y: 235, ll: [-9.77, 31.51] },
  { id: "HC080", nom: "Hôpital Mohammed V", ville: "Benguerir", region: "Marrakech-Safi", province: "Rehamna", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 251, occ: 163, rea: 11, reaOcc: 5, staff: 206, amb: 11, heli: 0, x: 243, y: 203, ll: [-7.95, 32.24] },
  { id: "HC081", nom: "Hôpital Mohammed V", ville: "Youssoufia", region: "Marrakech-Safi", province: "Youssoufia", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 172, occ: 110, rea: 17, reaOcc: 10, staff: 312, amb: 11, heli: 0, x: 228, y: 202, ll: [-8.53, 32.25] },
  { id: "HC082", nom: "Hôpital local de Demnate", ville: "Demnate", region: "Marrakech-Safi", province: "Al Haouz", kind: "civ", type: "Hôpital local", lits: 52, occ: 33, rea: 6, reaOcc: 3, staff: 60, amb: 6, heli: 0, x: 268, y: 225, ll: [-7.03, 31.73] },
  // — Drâa-Tafilalet —
  { id: "HC083", nom: "CHR Errachidia — Hôpital Moulay Ali Cherif", ville: "Errachidia", region: "Drâa-Tafilalet", province: "Errachidia", kind: "civ_reg", type: "Centre hospitalier régional (CHR)", lits: 414, occ: 356, rea: 21, reaOcc: 11, staff: 541, amb: 16, heli: 0, x: 338, y: 216, ll: [-4.42, 31.93] },
  { id: "HC084", nom: "Hôpital Mohammed V", ville: "Ouarzazate", region: "Drâa-Tafilalet", province: "Ouarzazate", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 221, occ: 201, rea: 18, reaOcc: 8, staff: 352, amb: 11, heli: 0, x: 272, y: 260, ll: [-6.89, 30.92] },
  { id: "HC085", nom: "Hôpital Mohammed V", ville: "Tinghir", region: "Drâa-Tafilalet", province: "Tinghir", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 144, occ: 95, rea: 13, reaOcc: 12, staff: 357, amb: 9, heli: 0, x: 308, y: 235, ll: [-5.53, 31.51] },
  { id: "HC086", nom: "Hôpital Mohammed V", ville: "Zagora", region: "Drâa-Tafilalet", province: "Zagora", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 186, occ: 147, rea: 11, reaOcc: 6, staff: 188, amb: 5, heli: 0, x: 300, y: 286, ll: [-5.84, 30.33] },
  { id: "HC087", nom: "Hôpital Mohammed V", ville: "Midelt", region: "Drâa-Tafilalet", province: "Midelt", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 169, occ: 125, rea: 12, reaOcc: 9, staff: 193, amb: 7, heli: 0, x: 329, y: 184, ll: [-4.74, 32.68] },
  { id: "HC088", nom: "Hôpital local de Goulmima", ville: "Goulmima", region: "Drâa-Tafilalet", province: "Errachidia", kind: "civ", type: "Hôpital local", lits: 42, occ: 28, rea: 2, reaOcc: 1, staff: 102, amb: 4, heli: 0, x: 324, y: 227, ll: [-4.96, 31.69] },
  { id: "HC089", nom: "Hôpital local de Boumalne Dadès", ville: "Boumalne Dadès", region: "Drâa-Tafilalet", province: "Tinghir", kind: "civ", type: "Hôpital local", lits: 61, occ: 45, rea: 3, reaOcc: 3, staff: 130, amb: 6, heli: 0, x: 296, y: 241, ll: [-5.99, 31.37] },
  // — Souss-Massa —
  { id: "HC090", nom: "CHR Agadir — Hôpital Hassan II", ville: "Agadir", region: "Souss-Massa", province: "Agadir Ida-Ou-Tanane", kind: "civ_reg", type: "Centre hospitalier régional (CHR)", lits: 274, occ: 186, rea: 25, reaOcc: 13, staff: 390, amb: 12, heli: 1, x: 199, y: 282, ll: [-9.6, 30.42] },
  { id: "HC091", nom: "Hôpital Mohammed V", ville: "Taroudant", region: "Souss-Massa", province: "Taroudant", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 205, occ: 180, rea: 11, reaOcc: 7, staff: 183, amb: 10, heli: 0, x: 218, y: 280, ll: [-8.88, 30.47] },
  { id: "HC092", nom: "Hôpital Mohammed V", ville: "Tiznit", region: "Souss-Massa", province: "Tiznit", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 236, occ: 189, rea: 12, reaOcc: 9, staff: 169, amb: 5, heli: 0, x: 195, y: 313, ll: [-9.73, 29.7] },
  { id: "HC093", nom: "Hôpital Mohammed V", ville: "Tata", region: "Souss-Massa", province: "Tata", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 268, occ: 236, rea: 12, reaOcc: 10, staff: 257, amb: 7, heli: 0, x: 243, y: 311, ll: [-7.97, 29.75] },
  { id: "HC094", nom: "Hôpital Mohammed V", ville: "Biougra", region: "Souss-Massa", province: "Chtouka-Aït Baha", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 153, occ: 107, rea: 16, reaOcc: 8, staff: 289, amb: 8, heli: 0, x: 205, y: 291, ll: [-9.37, 30.21] },
  { id: "HC095", nom: "Hôpital local d'Inezgane", ville: "Inezgane", region: "Souss-Massa", province: "Inezgane-Aït Melloul", kind: "civ", type: "Hôpital local", lits: 46, occ: 37, rea: 4, reaOcc: 3, staff: 89, amb: 3, heli: 0, x: 201, y: 284, ll: [-9.53, 30.36] },
  { id: "HC096", nom: "Hôpital local d'Aït Melloul", ville: "Aït Melloul", region: "Souss-Massa", province: "Inezgane-Aït Melloul", kind: "civ", type: "Hôpital local", lits: 46, occ: 30, rea: 3, reaOcc: 2, staff: 87, amb: 3, heli: 0, x: 202, y: 285, ll: [-9.5, 30.34] },
  // — Guelmim-Oued Noun —
  { id: "HC097", nom: "CHP Guelmim — Hôpital Mohammed V", ville: "Guelmim", region: "Guelmim-Oued Noun", province: "Guelmim", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 117, occ: 91, rea: 19, reaOcc: 14, staff: 295, amb: 12, heli: 0, x: 187, y: 344, ll: [-10.06, 28.99] },
  { id: "HC098", nom: "Hôpital Mohammed V", ville: "Sidi Ifni", region: "Guelmim-Oued Noun", province: "Sidi Ifni", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 124, occ: 108, rea: 19, reaOcc: 17, staff: 187, amb: 6, heli: 0, x: 184, y: 327, ll: [-10.17, 29.38] },
  { id: "HC099", nom: "Hôpital Mohammed V", ville: "Tan-Tan", region: "Guelmim-Oued Noun", province: "Tan-Tan", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 142, occ: 85, rea: 11, reaOcc: 7, staff: 254, amb: 5, heli: 0, x: 159, y: 368, ll: [-11.1, 28.44] },
  { id: "HC100", nom: "Hôpital local d'Assa", ville: "Assa", region: "Guelmim-Oued Noun", province: "Assa-Zag", kind: "civ", type: "Hôpital local", lits: 78, occ: 54, rea: 7, reaOcc: 5, staff: 100, amb: 6, heli: 0, x: 203, y: 360, ll: [-9.43, 28.61] },
  // — Laâyoune-Sakia El Hamra —
  { id: "HC101", nom: "CHR Laâyoune — Hôpital Hassan II", ville: "Laâyoune", region: "Laâyoune-Sakia El Hamra", province: "Laâyoune", kind: "civ_reg", type: "Centre hospitalier régional (CHR)", lits: 354, occ: 198, rea: 19, reaOcc: 18, staff: 509, amb: 11, heli: 1, x: 102, y: 424, ll: [-13.2, 27.15] },
  { id: "HC102", nom: "Hôpital Mohammed V", ville: "Boujdour", region: "Laâyoune-Sakia El Hamra", province: "Boujdour", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 148, occ: 135, rea: 19, reaOcc: 15, staff: 244, amb: 6, heli: 0, x: 68, y: 468, ll: [-14.48, 26.13] },
  { id: "HC103", nom: "Hôpital Mohammed V", ville: "Es-Semara", region: "Laâyoune-Sakia El Hamra", province: "Es-Semara", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 193, occ: 151, rea: 9, reaOcc: 6, staff: 253, amb: 10, heli: 0, x: 143, y: 441, ll: [-11.67, 26.74] },
  { id: "HC104", nom: "Hôpital local de Tarfaya", ville: "Tarfaya", region: "Laâyoune-Sakia El Hamra", province: "Tarfaya", kind: "civ", type: "Hôpital local", lits: 78, occ: 55, rea: 3, reaOcc: 3, staff: 74, amb: 5, heli: 0, x: 109, y: 389, ll: [-12.93, 27.94] },
  // — Dakhla-Oued Ed-Dahab —
  { id: "HC105", nom: "Hôpital Mohammed VI de Dakhla", ville: "Dakhla", region: "Dakhla-Oued Ed-Dahab", province: "Oued Ed-Dahab", kind: "civ", type: "Centre hospitalier provincial (CHP)", lits: 156, occ: 119, rea: 10, reaOcc: 8, staff: 290, amb: 6, heli: 0, x: 28, y: 574, ll: [-15.94, 23.68] },
  { id: "HC106", nom: "Hôpital local d'Aousserd", ville: "Aousserd", region: "Dakhla-Oued Ed-Dahab", province: "Aousserd", kind: "civ", type: "Hôpital local", lits: 82, occ: 62, rea: 3, reaOcc: 1, staff: 93, amb: 4, heli: 0, x: 72, y: 623, ll: [-14.33, 22.55] },
];

/** Référentiel complet : militaire d'abord (priorité de commandement), puis civil. */
export const HOSPITALS_MA: HospitalDef[] = [...MILITARY_HOSPITALS, ...CIVIL_HOSPITALS];
