// ============================================================================
// ARGOS — assistant IA · Libellés, tables de correspondance et coordonnées de villes partagés par les intentions.
//
// Extrait de l'ancien `assistant.ts` (2 782 lignes) lors de la refactorisation :
// même code, découpé par responsabilité pour être lisible, testable et
// modifiable sans relire le tout. Voir `index.ts` pour la surface publique.
// ============================================================================


// --- Utilitaires ----------------------------------------------------------

export const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");


export const UNIT_CODE: Record<string, string> = {
  "1er GI": "U1", "3e BG": "U2", "7e RA": "U3", "2e GL": "U4", "5e BS": "U5", "4e NRBC": "U6",
};


export const INCIDENT_PLACE: Record<string, string> = {
  "INC-2607": "Al Haouz", "INC-2606": "Ourika", "INC-2604": "Chefchaouen",
  "INC-2601": "Al Hoceïma", "INC-2598": "Mohammedia", "INC-2595": "Zagora",
};



export const SEV_LABEL: Record<string, string> = { high: "élevée", medium: "moyenne", low: "faible" };

export const ST_LABEL: Record<string, string> = { open: "ouverte", prog: "en cours", closed: "fermée" };

export const DISPO_LABEL: Record<string, string> = { ready: "opérationnelle", deployed: "déployée", standby: "en attente" };
export const COND_LABEL: Record<string, string> = { ok: "OK", repair: "en réparation", oos: "HS" };

/**
 * Coordonnées standard villes (déclarées en scope module pour être partagées :
 * incidentsNearCity + mobilizablePotential + regex mob).
 * Normalisation NFD + accents supprimés dans CITY_COORDS_LOOKUP (comparaison).
 */
export const CITY_COORDS: Record<string, [number, number]> = {
  casa: [-7.5898, 33.5731], casablanca: [-7.5898, 33.5731],
  rabat: [-6.8498, 34.0209], temara: [-6.9159, 33.9259], skhirate: [-6.7844, 33.8462], sale: [-6.8189, 34.0349], "salé": [-6.8189, 34.0349],
  marrakech: [-8.0029, 31.6295], safi: [-9.2387, 32.2994],
  fes: [-4.9808, 34.0181], "fès": [-4.9808, 34.0181], meknes: [-5.5547, 33.8935], "meknès": [-5.5547, 33.8935],
  tanger: [-5.8038, 35.7595], tangier: [-5.8038, 35.7595], tetouan: [-5.3696, 35.5814], "tétouan": [-5.3696, 35.5814], hoceima: [-3.9326, 35.2470], "al hoceima": [-3.9326, 35.2470],
  agadir: [-9.6013, 30.4278], taroudant: [-8.8676, 30.4779], tiznit: [-9.7307, 29.7124],
  oujda: [-1.9124, 34.6803], nador: [-2.9282, 35.1721], berkane: [-2.3194, 34.9189], guercif: [-3.3608, 34.2316],
  kenitra: [-6.5800, 34.2517], mohammedia: [-7.3855, 33.6933], bouskoura: [-7.4416, 33.4536],
  taza: [-4.0119, 34.2140], settat: [-7.6216, 32.9927],
  "beni mellal": [-6.3626, 32.3398], errachidia: [-4.4265, 31.9291], ouarzazate: [-6.9000, 30.9177],
};

// --- TEMPORAL (nouveaux §6.22) ------------------------------------------------

export const sevRank: Record<string, number> = { critique: 3, high: 3, elevé: 2, moyen: 1, medium: 1, faible: 0, low: 0 };
export const sevLabel = (s: string): "critique" | "élevé" | "moyen" | "faible" => {
  const n = norm(s);
  if (n === "critique" || n === "high") return "critique";
  if (n === "eleve" || n === "med" || n === "sever") return "élevé";
  if (n === "moyen" || n === "medium") return "moyen";
  return "faible";
};
