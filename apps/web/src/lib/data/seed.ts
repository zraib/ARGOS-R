// ============================================================================
// ARGOS — données de référence / génération (résiduel local)
// Les entités du domaine (incidents, unités, hôpitaux, fil, dispatching, comms,
// provinces, routes carte) viennent désormais de l'API (voir lib/api + store).
// Ce fichier ne garde que :
//   - FEED_POOL : pool d'événements pour la simulation « live » de l'en-tête ;
//   - POOLS / MED_GRADES / MED_SPECS : vocabulaire de génération déterministe des
//     rosters de détail par unité/hôpital (lib/derive.ts).
// Ce ne sont pas des entités métier stockées.
// ============================================================================

import type { FeedItem } from "@/lib/types";

/** Pool d'événements pour la simulation temps réel (fil d'en-tête). */
export const FEED_POOL: FeedItem[] = [
  { time: "", c: "bg-or-500", txt: "Convoi logistique LOG-1 : passage du col du Tichka" },
  { time: "", c: "bg-blue-500", txt: "Hélicoptère EVASAN-1 en rotation vers HMC Amizmiz" },
  { time: "", c: "bg-green-500", txt: "Rétablissement de la piste RP2010 — accès dégagé" },
  { time: "", c: "bg-danger-500", txt: "Montée des eaux signalée — oued Rheraya" },
  { time: "", c: "bg-or-500", txt: "2e Groupe Logistique : 40 t de fret humanitaire chargées" },
];

// --- Vocabulaire de génération des rosters de détail (lib/derive.ts) --------

export const POOLS = {
  names: ["El Amrani", "Bouazza", "Rahmouni", "Sebti", "Ouazzani", "Idrissi", "Kabbaj", "Lamrani", "Zeroual", "Bennis", "Haddadi", "Mounir"],
  grades: ["Cne.", "Lt.", "Adj.", "Sgt.", "Cpl.", "1re Cl."],
  fonctions: ["Chef de section", "Opérateur radio", "Sapeur sauveteur", "Infirmier", "Conducteur", "Logisticien"],
  equip: [
    ["Groupe électrogène 20 kVA", "Énergie"],
    ["Station de pompage mobile", "Hydraulique"],
    ["Tente modulaire 12 places", "Campement"],
    ["Kit de déblaiement hydraulique", "Sauvetage"],
    ["Radio tactique PR4G", "Transmissions"],
    ["Station de potabilisation", "Eau"],
  ] as [string, string][],
  vehs: ["VLRA tout-terrain", "Camion GBC 180", "Ambulance tactique", "Engin de levage", "Bulldozer D7", "VAB sanitaire"],
};

/** Grades du personnel de santé militaire. */
export const MED_GRADES = ["Méd. Col.", "Méd. Lt-Col.", "Méd. Cdt.", "Inf. Maj.", "Inf. Cne.", "Inf. 1re Cl."];
/** Qualifications du personnel de santé civil (ministère de la Santé). */
export const MED_GRADES_CIV = ["Pr. Ag.", "Méd. spécialiste", "Méd. généraliste", "Inf. chef", "Inf. d'État", "Aide-soignant"];
export const MED_SPECS = ["Chirurgie", "Réanimation", "Traumatologie", "Urgences", "Pédiatrie", "Radiologie"];
