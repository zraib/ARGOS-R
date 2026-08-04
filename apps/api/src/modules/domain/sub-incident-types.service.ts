import { Injectable } from "@nestjs/common";

// ============================================================================
// ARGOS — catalogue des types de SOUS-INCIDENT (aléas secondaires / en cascade)
// Un sous-incident est un événement dérivé qui découle d'un incident principal
// (ex. un séisme entraîne effondrements, fuites de gaz, victimes ensevelies…).
// Chaque type d'incident principal propose un jeu CURÉ de sous-types pertinents
// (`BY_PARENT`), utilisé pour guider la saisie côté frontend. La validation
// serveur reste souple : tout sous-type du catalogue (ou « other ») est accepté,
// afin de rester robuste aux types principaux ajoutés dynamiquement.
// ============================================================================

export interface SubIncidentTypeDef {
  id: string;
  labels: { fr: string; ar: string; en: string };
}

/** Catalogue canonique des sous-types (réutilisés entre plusieurs parents). */
const SUB_TYPES: SubIncidentTypeDef[] = [
  { id: "building_collapse", labels: { fr: "Effondrement de bâtiment", ar: "انهيار مبنى", en: "Building collapse" } },
  { id: "gas_leak", labels: { fr: "Fuite de gaz", ar: "تسرب غاز", en: "Gas leak" } },
  { id: "secondary_fire", labels: { fr: "Incendie secondaire", ar: "حريق ثانوي", en: "Secondary fire" } },
  { id: "trapped_victims", labels: { fr: "Victimes ensevelies", ar: "ضحايا محاصرون", en: "Trapped victims" } },
  { id: "road_cut", labels: { fr: "Route coupée", ar: "طريق مقطوع", en: "Road cut off" } },
  { id: "aftershock", labels: { fr: "Réplique sismique", ar: "هزة ارتدادية", en: "Aftershock" } },
  { id: "power_outage", labels: { fr: "Coupure d'électricité", ar: "انقطاع الكهرباء", en: "Power outage" } },
  { id: "water_main_break", labels: { fr: "Rupture de conduite d'eau", ar: "انفجار أنبوب ماء", en: "Water main break" } },
  { id: "landslide", labels: { fr: "Glissement de terrain", ar: "انزلاق تربة", en: "Landslide" } },
  { id: "water_contamination", labels: { fr: "Contamination de l'eau", ar: "تلوث المياه", en: "Water contamination" } },
  { id: "drowning", labels: { fr: "Noyade", ar: "غرق", en: "Drowning" } },
  { id: "dam_risk", labels: { fr: "Risque de rupture de barrage", ar: "خطر انهيار سد", en: "Dam failure risk" } },
  { id: "isolated_population", labels: { fr: "Population isolée", ar: "سكان معزولون", en: "Isolated population" } },
  { id: "smoke_intoxication", labels: { fr: "Intoxication par fumée", ar: "اختناق بالدخان", en: "Smoke intoxication" } },
  { id: "structure_fire", labels: { fr: "Incendie de structure", ar: "حريق مبنى", en: "Structure fire" } },
  { id: "evacuation", labels: { fr: "Évacuation d'urgence", ar: "إجلاء طارئ", en: "Emergency evacuation" } },
  { id: "livestock_loss", labels: { fr: "Pertes de bétail", ar: "نفوق الماشية", en: "Livestock loss" } },
  { id: "hospital_saturation", labels: { fr: "Saturation hospitalière", ar: "تشبع المستشفيات", en: "Hospital saturation" } },
  { id: "supply_shortage", labels: { fr: "Pénurie de fournitures", ar: "نقص الإمدادات", en: "Supply shortage" } },
  { id: "quarantine_zone", labels: { fr: "Zone de quarantaine", ar: "منطقة حجر صحي", en: "Quarantine zone" } },
  { id: "mass_casualty", labels: { fr: "Afflux massif de victimes", ar: "إصابات جماعية", en: "Mass casualty influx" } },
  { id: "toxic_release", labels: { fr: "Rejet toxique", ar: "انبعاث سام", en: "Toxic release" } },
  { id: "explosion", labels: { fr: "Explosion", ar: "انفجار", en: "Explosion" } },
  { id: "port_damage", labels: { fr: "Dommages portuaires", ar: "أضرار بالميناء", en: "Port damage" } },
  { id: "missing_persons", labels: { fr: "Personnes disparues", ar: "أشخاص مفقودون", en: "Missing persons" } },
  { id: "fallen_trees", labels: { fr: "Chutes d'arbres", ar: "سقوط أشجار", en: "Fallen trees" } },
  { id: "maritime_distress", labels: { fr: "Détresse maritime", ar: "استغاثة بحرية", en: "Maritime distress" } },
  { id: "roof_collapse", labels: { fr: "Effondrement de toiture", ar: "انهيار سقف", en: "Roof collapse" } },
  { id: "hypothermia", labels: { fr: "Cas d'hypothermie", ar: "حالات انخفاض الحرارة", en: "Hypothermia cases" } },
  { id: "crop_loss", labels: { fr: "Pertes agricoles", ar: "خسائر زراعية", en: "Crop loss" } },
  { id: "wildfire_risk", labels: { fr: "Risque d'incendie", ar: "خطر اندلاع حريق", en: "Wildfire risk" } },
  { id: "population_displacement", labels: { fr: "Déplacement de population", ar: "نزوح سكاني", en: "Population displacement" } },
  { id: "fuel_spill", labels: { fr: "Déversement de carburant", ar: "تسرب وقود", en: "Fuel spill" } },
  { id: "traffic_blockage", labels: { fr: "Blocage de la circulation", ar: "انسداد حركة السير", en: "Traffic blockage" } },
  { id: "hazmat_release", labels: { fr: "Fuite de matières dangereuses", ar: "تسرب مواد خطرة", en: "Hazmat release" } },
  { id: "oil_spill", labels: { fr: "Marée noire", ar: "تسرب نفطي", en: "Oil spill" } },
  { id: "vessel_sinking", labels: { fr: "Naufrage", ar: "غرق سفينة", en: "Vessel sinking" } },
  { id: "shoreline_pollution", labels: { fr: "Pollution du littoral", ar: "تلوث الساحل", en: "Shoreline pollution" } },
  { id: "contamination_spread", labels: { fr: "Propagation de contamination", ar: "انتشار التلوث", en: "Contamination spread" } },
  { id: "decontamination", labels: { fr: "Décontamination requise", ar: "تطهير مطلوب", en: "Decontamination needed" } },
  { id: "other", labels: { fr: "Autre", ar: "أخرى", en: "Other" } },
];

/**
 * Sous-types pertinents par type d'incident principal (curé). L'ordre reflète la
 * probabilité / priorité opérationnelle. « other » est toujours proposé en fin
 * de liste côté frontend (ajouté par le service, pas répété ici).
 */
const BY_PARENT: Record<string, string[]> = {
  earthquake: ["building_collapse", "trapped_victims", "gas_leak", "secondary_fire", "aftershock", "road_cut", "power_outage", "water_main_break"],
  flood: ["drowning", "road_cut", "landslide", "water_contamination", "dam_risk", "power_outage", "isolated_population"],
  wildfire: ["smoke_intoxication", "structure_fire", "evacuation", "road_cut", "power_outage", "livestock_loss"],
  landslide: ["road_cut", "building_collapse", "trapped_victims", "isolated_population", "water_main_break"],
  epidemic: ["hospital_saturation", "mass_casualty", "water_contamination", "supply_shortage", "quarantine_zone"],
  industrial: ["toxic_release", "explosion", "secondary_fire", "evacuation", "water_contamination"],
  tsunami: ["drowning", "building_collapse", "port_damage", "missing_persons", "contamination_spread", "isolated_population"],
  storm: ["power_outage", "fallen_trees", "road_cut", "roof_collapse", "maritime_distress", "isolated_population"],
  coldwave: ["power_outage", "road_cut", "hypothermia", "isolated_population", "roof_collapse"],
  drought: ["crop_loss", "wildfire_risk", "livestock_loss", "supply_shortage", "population_displacement"],
  building_collapse: ["trapped_victims", "gas_leak", "secondary_fire", "evacuation", "power_outage"],
  road_accident: ["secondary_fire", "fuel_spill", "trapped_victims", "traffic_blockage", "hazmat_release"],
  maritime: ["drowning", "oil_spill", "missing_persons", "vessel_sinking", "shoreline_pollution"],
  nrbc: ["contamination_spread", "evacuation", "decontamination", "mass_casualty", "water_contamination"],
};

/** Repli pour un type principal hors mapping (ex. type ajouté dynamiquement). */
const GENERIC_FALLBACK = ["secondary_fire", "evacuation", "road_cut", "power_outage", "mass_casualty", "supply_shortage"];

@Injectable()
export class SubIncidentTypesService {
  /** Catalogue complet + mapping parent→sous-types (le frontend ajoute « other »). */
  list(): { types: SubIncidentTypeDef[]; byParent: Record<string, string[]> } {
    return { types: SUB_TYPES, byParent: BY_PARENT };
  }

  /** Sous-types suggérés pour un type principal (repli générique si absent). */
  suggestedFor(parentType: string): string[] {
    return BY_PARENT[parentType] ?? GENERIC_FALLBACK;
  }

  /** Validation souple : tout sous-type du catalogue est accepté. */
  isValid(id: string): boolean {
    return SUB_TYPES.some((t) => t.id === id);
  }
}
