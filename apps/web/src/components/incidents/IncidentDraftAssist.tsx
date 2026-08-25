/**
 * IncidentDraftAssist.tsx — PROPOSITIONS INDÉPENDANTES TITRE / DESCRIPTION.
 *
 * MOTEUR SÉMANTIQUE :
 *   - PLUS de recopie 1 phrase par keyword
 *   - GROUPES de mots reliés : « Bâtiments »+« Endommagés » → « bâtiments endommagés »
 *     « Risque »+« D'effondrement » → « risque d'effondrement »
 *     « Magnitude »+« Épicentre » → caractéristiques sismiques
 *   - DÉDUCTION TYPE INCIDENT si explicite keywords (ex: magnitude+epicentre → SÉISME)
 *   - TITRE = [type incident détecté] — [groupe critique MAX priority]
 *   - DESCRIPTION = 2-3 phrases COHÉRENTES du contexte global, PAS 1/keyword
 *   - JAMAIS d'invention valeur precise : pas magnitude 6.2, pas ville « Casablanca », pas 3 victimes
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import type { IncidentTypeDef } from "@/lib/types";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* =========================== TYPES =========================== */

export interface DescriptionProposalInput {
  type: string | null;
  titre: string;
  adresse: string;
  province: string;
  ville: string;
  pt: [number, number] | null;
  lang: "fr" | "ar" | "en";
  incidentTypes: IncidentTypeDef[];
  keywords?: string;
}
interface DescPair { l1: string; l2: string; }
export type Proposal = { title: string; desc: string };

/* =========================== HELPERS BASIQUES =========================== */

function labelOf(
  input: Pick<DescriptionProposalInput, "type" | "lang" | "incidentTypes">,
): string {
  if (!input.type) return "Incident";
  const def = input.incidentTypes.find((d) => d.id === input.type);
  if (!def) return input.type;
  const labels = def.labels as Partial<Record<"fr" | "ar" | "en", string>>;
  return labels[input.lang] ?? labels.fr ?? labels.ar ?? labels.en ?? input.type;
}

function lieuOf(
  input: Pick<DescriptionProposalInput, "ville" | "province" | "adresse">,
): string {
  return [input.ville, input.province, input.adresse]
    .map((s) => s.trim())
    .filter(Boolean)[0] ?? "";
}

function inject(s: string, label: string, lieu: string): string {
  const lieuDet = lieu ? ` au niveau de ${lieu}` : "";
  const labelCamel = label.charAt(0).toUpperCase() + label.slice(1);
  return s
    .replaceAll("{lieu}", lieu ? ` — ${lieu}` : "")
    .replaceAll("{lieuDet}", lieuDet)
    .replaceAll("{labelCamel}", labelCamel)
    .replaceAll("{label}", label);
}

function buildDesc(p: DescPair, label: string, lieu: string): string {
  return `${inject(p.l1, label, lieu)}\n${inject(p.l2, label, lieu)}`;
}

function rngSeed(seed: number, N: number): number {
  if (N <= 0) return 0;
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return Math.floor((x - Math.floor(x)) * N);
}

/* =========================== KEYWORDS HELPERS =========================== */

function keywordTokens(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\s,;，、]+/)
    .map((t) => t.trim().replace(/^["'«»`]+|["'«»`]+$/g, ""))
    .filter(Boolean);
}

function normKW(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\u0600-\u06FF]/g, "");
}

/* ======================================================================= */
/*                     NOUVEAU MOTEUR SÉMANTIQUE (demande utilisateur 2026-08-23)     */
/* ======================================================================= */

/* -------- Lexiques sémantiques -------- */
const SEISMIC_WORDS = [
  "magnitude", "epicentre", "epicentres", "seisme", "seismes", "sismique", "sismiques",
  "tremblement", "secousse", "secousses", "tellurique", "telluriques", "replique",
  "repliques", "intensite", "intensites", "magnitudes", "tremblementterre",
  "tremblementsterre", "vibration", "vibrations", "seismes",
];
const FIRE_WORDS = [
  "incendie", "incendies", "feu", "feux", "flamme", "flammes", "bruler", "brule",
  "embrasement", "embrasements", "fumee", "fumees", "fume", "fumes", "fumee", "fumer",
  "foyer", "foyers", "brousse", "brousses", "vegetation", "vegetaux", "foret",
  "forets", "propagation", "combustible", "inflammation", "braise", "braises", "flammes",
  "depart", "departdefeu", "deforest", "defriche", "fumee",
];
const SMOKE_WORDS = ["fumee", "fumees", "fume", "fumes", "fumee", "fumer", "dense", "opaque", "nuee", "nuees", "fumigene"];
const FLOOD_WORDS = [
  "inondation", "inondations", "innondation", "innondations", "eaux", "eau", "crue", "crues",
  "pluie", "pluies", "submersion", "submersions", "debo", "debords", "inonde",
  "montee", "montée", "debordement", "debordements", "torrent", "torrents",
  "precipitation", "precipitations", "coursdeau", "riviere", "ruissellement",
];
const STORM_WORDS = [
  "tempete", "orages", "orage", "vents", "vent", "rafales", "cyclone", "ouragan",
  "depression", "tonnerre", "eclairs", "grain", "meteo", "perturbation",
];
const COLLAPSE_WORDS = [
  "effondrement", "effondrements", "effondre", "ecroulement", "ecroulements",
  "effondrer", "deffondrement", "s'effondrer",
];
const DAMAGE_WORDS = [
  "endommagés", "endommage", "endommages", "endommagees", "endommagees", "damage", "degrad",
  "degrades", "degats", "degats", "casse", "casser", "detruit", "detruits",
  "sinistre", "sinistres", "materiel", "abîme", "abimes", "abîmes", "perte", "pertes",
];
const BUILDING_WORDS = [
  "batiment", "bâtiment", "batiments", "bâtiments", "immeuble", "immeubles",
  "logement", "logements", "maison", "maisons", "structure", "structures",
  "facade", "facades", "toiture", "toitures", "pont", "ponts", "infrastructure",
  "infrastructures", "habitation", "habitations", "etablissement", "etablissements",
  "pavillon",
];
const HUMAN_WORDS = [
  "blesse", "blesses", "bles", "blessee", "blessees", "victime", "victimes", "deces",
  "decess", "mort", "morts", "decede", "cedes", "disparu", "disparus", "disparue",
  "disparues", "prisonnier", "prisonniers", "enseveli", "ensevelis", "bloque",
  "bloques", "evacue", "evacues", "sinistres", "fatal", "fatalites", "bilan",
  "humain", "kasualte", "casualties", "fatalite",
];
const HAZARD_WORDS = [
  "risque", "risques", "danger", "dangers", "alerte", "alertes", "urgence",
  "urgences", "menace", "menaces", "crise", "crises", "hazard", "critical",
  "critique", "grave", "redoutable", "sensible", "sever", "haut", "eleve",
];
const INDUSTRIAL_WORDS = [
  "industriel", "industriels", "industrie", "industries", "seveso", "usine", "usines",
  "site", "sites", "installation", "installations", "stockage", "atelier",
];
const CBRN_WORDS = [
  "gaz", "chimique", "chimiques", "toxique", "toxiques",
  "propane", "butane", "cbrn", "nrbc", "radiologique", "radiologiques",
  "contamination", "contaminations", "ammoniac", "ammoniac", "chlore", "fluor", "carbonyle",
  "epandage", "epandages", "deversement", "deversements", "pollution",
  "pollutions", "rejet", "rejets", "odeur", "odeurs", "biologique", "biologiques",
  "nucleaire", "nucleaire", "pesticide", "pesticides", "methane", "mercaptan",
  "sulfure", "cyanure", "arsenic", "plomb", "mercure",
];
const CBRN_ACTION_WORDS = ["fuite", "fuites"];
const EXPLOSION_WORDS = [
  "explosion", "explosions", "deflagration", "deflagrations", "souffle", "souffles",
  "blast", "bombe", "bombes", "explose", "explosee",
];
const EVACUATION_WORDS = [
  "evacuation", "evacuations", "evacuer", "evacue", "evacues", "secur",
  "securise", "securite", "exode", "exodes", "rassemblement", "abri", "abris",
  "deplacement", "deplacements",
];
const MEDICAL_WORDS = [
  "hopital", "hospitals", "hopitaux", "hôpital", "hôpitaux", "lits", "lit",
  "rea", "reanim", "saturation", "saturations", "medical", "medicaux", "medecin",
  "medecins", "ambulance", "ambulances", "smur", "samu", "antenne", "priseencharge",
  "soins", "triage", "vaccin", "vaccins", "epidemie", "epidemies", "cluster",
  "clusters", "infectieux", "contamine", "cas", "groupes", "sanitaire",
  "sanitaires", "sante", "prevention",
];
const ROAD_WORDS = [
  "accident", "accidents", "collision", "collisions", "choc", "chocs", "sortie",
  "sorties", "renversement", "renversements", "vehicule", "vehicules", "voiture",
  "voitures", "camion", "camions", "autoroute", "autoroutes", "route", "routes",
  "routier", "circulation", "circulations", "pieton", "pietons", "heurte",
  "heurte",
];
const WATER_ASSET_WORDS = [
  "bateau", "bateaux", "navire", "navires", "embarcation", "embarcations",
  "maritime", "fluvial", "port", "ports", "sousmarin", "submersible", "naufrage",
  "naufrages", "baleinier",
];
const AIR_ASSET_WORDS = [
  "helico", "helicos", "helicoptere", "helicopteres", "avion", "avions", "aerien",
  "aerien", "appuiaerien", "colonnemobile", "air",
];
const FORCES_WORDS = [
  "pompier", "pompiers", "secours", "secouristes", "intervenant", "intervenants",
  "equipe", "equipes", "unite", "unites", "renfort", "renforts", "moyen",
  "moyens", "gendarmerie", "police", "securitecivile", "intervention", "arme",
  "armee", "militaires", "militaire",
];
const DROUGHT_WORDS = [
  "secheresse", "secheresses", "seche", "seches", "penurie", "penuries",
  "hydrique", "stress", "manque", "manques", "sol", "sols", "sec",
  "nappes", "nappe", "eau", "alimentation", "restriction",
  "restrictions", "potable", "agricole", "agricoles",
  "aridite", "assechement", "secheresseprolongee",
];
const HEAT_WORDS = [
  "chaleur", "chaleurs", "canicule", "canicules", "vagedechaleur",
  "picdechaleur", "temperature", "temperatures", "chaud",
  "extreme", "exceptionnel", "exceptionnelle", "episodecaniculaire",
];

/* -------- Détection TYPE INCIDENT à partir des keywords (pas étape 1) -------- */
function detectIncidentType(tokens: string[], fallbackType: string | null): string {
  const norm = tokens.map(normKW).filter(Boolean);
  const hit = (dict: string[]) => norm.some((x) => dict.includes(x));
  // 1. Surcharge explicite selon keywords forts
  if (hit(SEISMIC_WORDS)) return "earthquake";
  if (hit(CBRN_WORDS) && !hit(EXPLOSION_WORDS) && !hit(FIRE_WORDS)) return "cbrn";
  if (hit(HEAT_WORDS) && !hit(DROUGHT_WORDS)) return "heatwave";
  if (hit(DROUGHT_WORDS)) return "drought";
  if (hit(FLOOD_WORDS)) return "flood";
  if (hit(EXPLOSION_WORDS)) return "explosion";
  if (hit(FIRE_WORDS)) return "wildfire";
  if (hit(STORM_WORDS)) return "storm";
  const EPIDEMIC_SUB = ["epidemie", "epidemies", "cluster", "clusters", "foyer", "infectieux", "contamine", "sanitaire"];
  if (hit(MEDICAL_WORDS.filter((w) => EPIDEMIC_SUB.includes(w)))) return "epidemic";
  if (hit(ROAD_WORDS)) return "road";
  if (hit(INDUSTRIAL_WORDS)) return "industrial";
  if (fallbackType) return fallbackType;
  return "generic";
}

/* -------- GROUPES SÉMANTIQUES : joints mots reliés -------- */
interface SemGroup {
  id: string;
  text: string;
  priority: number;
  severity: "info" | "warn" | "crit";
}

function buildSemGroups(tokens: string[]): SemGroup[] {
  const norm = tokens.map(normKW).filter(Boolean);
  const rawMap = new Map<string, string>();
  tokens.forEach((t) => {
    const n = normKW(t);
    if (n && !rawMap.has(n)) rawMap.set(n, t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
  });
  const has = (dict: string[]) => norm.some((x) => dict.includes(x));
  const forms = (dict: string[]): string[] =>
    dict
      .filter((d) => norm.includes(d))
      .map((d) => rawMap.get(d) ?? d.charAt(0).toUpperCase() + d.slice(1))
      .filter((x) => x.length >= 3);
  const groups: SemGroup[] = [];

  /* Groupe 1. Bâtiments + Endommagés → bâtiments endommagés */
  if (has(BUILDING_WORDS) && has(DAMAGE_WORDS)) {
    const subj = forms(BUILDING_WORDS)[0] ?? "bâtiments";
    groups.push({ id: "bldg-dmg", text: `${subj.toLowerCase()} endommagés`, priority: 90, severity: "warn" });
  } else if (has(BUILDING_WORDS)) {
    const subj = forms(BUILDING_WORDS)[0] ?? "bâtiments";
    groups.push({ id: "bldg", text: `${subj.toLowerCase()} — vérifications requises`, priority: 40, severity: "info" });
  } else if (has(DAMAGE_WORDS)) {
    groups.push({ id: "dmg", text: "dommages constatés", priority: 55, severity: "warn" });
  }

  /* Groupe 2. Risque + Effondrement → risque d'effondrement */
  if (has(HAZARD_WORDS) && has(COLLAPSE_WORDS)) {
    groups.push({ id: "haz-collapse", text: "risque d'effondrement", priority: 100, severity: "crit" });
  } else if (has(COLLAPSE_WORDS)) {
    groups.push({ id: "collapse", text: "effondrement signalé", priority: 95, severity: "crit" });
  }

  /* Groupe 3. Magnitude / Épicentre → caractéristiques sismiques évaluées */
  if (has(SEISMIC_WORDS)) {
    const carac = forms(["magnitude", "epicentre", "intensite", "seismes", "secousse"]);
    const subj = carac.length ? carac.map((c) => c.toLowerCase()).join(" et ") : "phénomène sismique";
    groups.push({ id: "sismic-carac", text: `${subj} en cours d'évaluation`, priority: 70, severity: "warn" });
  }

  /* Groupe 4. Gaz / Fuite / Chimique → fuite produit dangereux */
  if (has(CBRN_WORDS) || has(CBRN_ACTION_WORDS)) {
    const sub = forms(CBRN_WORDS)[0] ?? "produit dangereux";
    if (has(CBRN_ACTION_WORDS)) {
      groups.push({ id: "cbrn-leak", text: `fuite de ${sub.toLowerCase()}`, priority: 85, severity: "crit" });
    } else if (has(EXPLOSION_WORDS)) {
      groups.push({ id: "explosion", text: `explosion et ${sub.toLowerCase()}`, priority: 98, severity: "crit" });
    } else {
      groups.push({ id: "cbrn", text: `présence de ${sub.toLowerCase()}`, priority: 80, severity: "warn" });
    }
  } else if (has(EXPLOSION_WORDS)) {
    groups.push({ id: "explosion", text: "explosion rapportée", priority: 96, severity: "crit" });
  }

  /* Groupe 5. Feu / Incendie */
  if (has(FIRE_WORDS)) {
    const subj = forms(FIRE_WORDS)[0] ?? "incendie";
    groups.push({ id: "fire", text: `${subj.toLowerCase()} en cours`, priority: 92, severity: "crit" });
  }

  /* Groupe 6. Inondation / Crues / Pluies */
  if (has(FLOOD_WORDS)) {
    const subj = forms(FLOOD_WORDS)[0] ?? "inondation";
    groups.push({ id: "flood", text: `${subj.toLowerCase()} constaté${/eaux|pluies|crues$/i.test(subj) ? "s" : ""}`, priority: 88, severity: "warn" });
  }

  /* Groupe 7. Tempête / Orages / Vents */
  if (has(STORM_WORDS)) {
    const subj = forms(STORM_WORDS)[0] ?? "tempête";
    groups.push({ id: "storm", text: `${subj.toLowerCase()} signalé${/s$/.test(subj) ? "s" : ""}`, priority: 75, severity: "warn" });
  }

  /* Groupe 8. Blessés / Victimes / Décès */
  if (has(HUMAN_WORDS)) {
    const subj = forms(HUMAN_WORDS).slice(0, 3).join(", ").toLowerCase() || "bilan humain";
    groups.push({ id: "human", text: `${subj} signalés`, priority: 82, severity: "crit" });
  }

  /* Groupe 9. Évacuation / Sécurisation */
  if (has(EVACUATION_WORDS)) {
    const subj = forms(EVACUATION_WORDS)[0] ?? "évacuation";
    groups.push({ id: "evac", text: `${subj.toLowerCase()} des zones concernées`, priority: 65, severity: "warn" });
  }

  /* Groupe 10. Accidents routiers */
  if (has(ROAD_WORDS)) {
    const subj = forms(ROAD_WORDS)[0] ?? "accident";
    groups.push({ id: "road", text: `${subj.toLowerCase()} sur voie`, priority: 86, severity: "warn" });
  }

  /* Groupe 11. Santé / Épidémie */
  if (has(MEDICAL_WORDS)) {
    const epi = ["epidemie", "epidemies", "cluster", "clusters", "foyer", "cas", "infectieux", "contamine", "groupes"];
    if (has(epi)) {
      const subj = forms(MEDICAL_WORDS).slice(0, 2).join(", ").toLowerCase() || "situation sanitaire";
      groups.push({ id: "med-epidemic", text: `situation ${subj}`, priority: 83, severity: "crit" });
    } else {
      groups.push({ id: "med", text: "éléments médicaux mentionnés", priority: 45, severity: "info" });
    }
  }

  /* Groupe 12. Moyens / Hélicoptère / Bateau / Pompiers / Renforts */
  if (has(FORCES_WORDS) || has(AIR_ASSET_WORDS) || has(WATER_ASSET_WORDS)) {
    const arr = [...forms(FORCES_WORDS), ...forms(AIR_ASSET_WORDS), ...forms(WATER_ASSET_WORDS)];
    if (arr.length) {
      const subj = arr.slice(0, 3).join(", ").toLowerCase();
      groups.push({ id: "forces", text: `moyens déployés : ${subj}`, priority: 20, severity: "info" });
    }
  }

  /* Groupe 13. FEU × VENT → propagation facilitée par le vent (critique pour incendies) */
  if (has(FIRE_WORDS) && has(STORM_WORDS)) {
    const sForm = forms(STORM_WORDS).slice(0, 2).join(", ").toLowerCase() || "vents dominants";
    groups.push({ id: "fire-wind", text: `propagation du feu facilitée par ${sForm}`, priority: 93, severity: "crit" });
  }

  /* Groupe 14. Fumées / Fumée dense → visibilité réduite, riverains à informer */
  if (has(SMOKE_WORDS)) {
    const subj = forms(SMOKE_WORDS).filter(w => w.toLowerCase() !== "dense").slice(0, 2).join(" ").toLowerCase() || "fumées";
    const dense = norm.includes("dense") || norm.includes("opaque") ? " denses et toxiques" : "";
    groups.push({ id: "smoke", text: `émissions de ${subj}${dense} — visibilité réduite`, priority: 68, severity: "warn" });
  }

  /* Groupe 15. FUMÉES × VENT → orientation panache fumées */
  if (has(SMOKE_WORDS) && has(STORM_WORDS)) {
    groups.push({ id: "smoke-wind", text: "panache de fumées orienté par le vent — information riverains indispensable", priority: 69, severity: "warn" });
  }

  /* Groupe 16. SÉCHERESSE : stress hydrique / sols secs / pénurie eau */
  if (has(DROUGHT_WORDS)) {
    /* Sous-groupes : acceptent singulier ET pluriel (ex: manques, sols) */
    const stressHydrique = (norm.includes("stress") || norm.includes("stress")) && (norm.includes("hydrique") || norm.includes("hydriques"));
    const solsSecs =
      (norm.includes("sol") || norm.includes("sols")) &&
      (norm.includes("sec") || norm.includes("secs") || norm.includes("seche") || norm.includes("seches") || norm.includes("secheresse") || norm.includes("secheresses"));
    const manqueEau =
      (norm.includes("manque") || norm.includes("manques")) &&
      (norm.includes("eau") || norm.includes("eaux"));
    const penurie =
      (norm.includes("penurie") || norm.includes("penuries")) &&
      (norm.includes("eau") || norm.includes("eaux") || norm.includes("hydrique") || norm.includes("hydriques"));
    const secheresseGlobale =
      norm.includes("secheresse") || norm.includes("secheresses") || norm.includes("seche") || norm.includes("seches") || norm.includes("aridite") || norm.includes("assechement");
    const alimentation = norm.includes("alimentation") && (norm.includes("eau") || norm.includes("eaux"));
    const restriction =
      (norm.includes("restriction") || norm.includes("restrictions")) &&
      (norm.includes("eau") || norm.includes("eaux") || norm.includes("potable"));
    const nappe = norm.includes("nappe") || norm.includes("nappes");
    const agricole = norm.includes("agricole") || norm.includes("agricoles");
    const potable = norm.includes("potable");

    if (stressHydrique) groups.push({ id: "drought-stress", text: "stress hydrique constaté", priority: 87, severity: "warn" });
    if (solsSecs) groups.push({ id: "drought-soil", text: "sols secs observés", priority: 72, severity: "warn" });
    if (manqueEau) groups.push({ id: "drought-water", text: "manque d'eau signalé", priority: 89, severity: "warn" });
    if (penurie) groups.push({ id: "drought-penurie", text: "pénurie hydrique", priority: 90, severity: "warn" });
    if (alimentation) groups.push({ id: "drought-supply", text: "alimentation en eau impactée", priority: 86, severity: "warn" });
    if (restriction) groups.push({ id: "drought-restrict", text: "restriction d'eau potable mentionnée", priority: 85, severity: "warn" });
    if (nappe) groups.push({ id: "drought-nappe", text: "nappes phréatiques concernées", priority: 70, severity: "info" });
    if (agricole) groups.push({ id: "drought-agri", text: "contexte agricole concerné", priority: 60, severity: "info" });
    if (potable) groups.push({ id: "drought-dw", text: "eau potable concernée", priority: 78, severity: "warn" });
    if (secheresseGlobale && groups.filter(g => g.id.startsWith("drought-")).length === 0) {
      groups.push({ id: "drought-general", text: "contexte de sécheresse", priority: 80, severity: "warn" });
    }
  }

  /* Groupe 17. CANICULE (hors sécheresse) : chaleur / températures */
  if (has(HEAT_WORDS) && !has(DROUGHT_WORDS)) {
    const subj = forms(HEAT_WORDS).slice(0, 2).join(", ").toLowerCase() || "chaleur";
    groups.push({ id: "heatwave", text: `${subj} observés${/(s|x)$/.test(subj) ? "" : "s"}`, priority: 81, severity: "warn" });
  }

  /* Dédoublonnage de texte + tri par priority décroissante. */
  const seenText = new Set<string>();
  return groups
    .filter((g) => {
      if (seenText.has(g.text)) return false;
      seenText.add(g.text);
      return true;
    })
    .sort((a, b) => b.priority - a.priority);
}

/* -------- Construction TITRE PROFESSIONNEL (PARAPHRASE SELON SALT) -------- */
function buildSemanticTitle(
  tokens: string[],
  fallbackType: string | null,
  baseTplTitle: string,
  lieu: string,
  incidentTypes: IncidentTypeDef[],
  salt: number = 0,
): string {
  const groups = buildSemGroups(tokens);
  const topGroup = groups[0];
  const typeKey = detectIncidentType(tokens, fallbackType);
  const tdef = incidentTypes.find((i) => i.id === typeKey) ?? incidentTypes.find((i) => i.id === fallbackType) ?? null;
  const tLabels = (tdef?.labels ?? {}) as Partial<{ fr: string; ar: string; en: string }>;
  const tLabelRaw = (tLabels.fr ?? tLabels.ar ?? tLabels.en ?? baseTplTitle.replace(/\{lieu\}.*$/, "").trim());
  let tLabel = tLabelRaw.charAt(0).toUpperCase() + tLabelRaw.slice(1);
  /* Upcase acronymes CBRN / NRBC dans titre */
  tLabel = tLabel.replace(/\b(cbrn|nrb|nrbcc?|svt|crs|bri|gign|raid|sdis|snm|uhc|chu|chru)\b/gi, (m) => m.toUpperCase());

  const comp = (() => {
    if (!topGroup) return "";
    /* CAS SPÉCIAL Feu + Vent/Fumée (exemple exact utilisateur) */
    const norm = tokens.map(normKW).filter(Boolean);
    const hasF = norm.some(x => FIRE_WORDS.includes(x));
    const hasW = norm.some(x => STORM_WORDS.includes(x));
    const hasS = norm.some(x => SMOKE_WORDS.includes(x));
    if (hasF && (hasW || hasS)) {
      const parts: string[] = [];
      if (hasW) {
        const allW = tokens.filter(t => STORM_WORDS.includes(normKW(t)));
        const windCore = allW.find(t => ["vent","vents","tempete","orages","orage","rafales","cyclone","ouragan","depression","perturbation"].includes(normKW(t)));
        const adjW = allW.filter(t => ["fort","forts","puissant"].includes(normKW(t)))[0];
        const baseW = windCore ? windCore.charAt(0).toUpperCase()+windCore.slice(1).toLowerCase() : "Vent";
        parts.push(adjW ? `${baseW} ${adjW.toLowerCase()}` : baseW);
      }
      if (hasS) {
        const sArr = tokens.filter(t => SMOKE_WORDS.includes(normKW(t)));
        const dense = sArr.some(t => normKW(t) === "dense" || normKW(t) === "opaque");
        const smkForm = sArr.find(t => normKW(t) !== "dense" && normKW(t) !== "opaque");
        const labelSmk = smkForm ? smkForm.charAt(0).toUpperCase() + smkForm.slice(1).toLowerCase() : "Fumée";
        parts.push(dense ? `${labelSmk} dense` : labelSmk);
      }
      if (parts.length >= 2) return parts.slice(0, 3).join(" et ");
      if (parts.length === 1) return parts[0];
    }
    let g = topGroup;
    const tNorm = normKW(tLabel);
    const gNorm = normKW(g.text.replace(/ en cours.*$/, "").replace(/ constaté[s]?$/, "").replace(/ signalé[s]?$/, ""));
    const sameMeaning = tNorm.length >= 4 && gNorm.length >= 4 && (tNorm.includes(gNorm) || gNorm.includes(tNorm));
    if (sameMeaning && groups[1]) g = groups[1];
    if (g.id === "bldg-dmg") return "dommages aux bâtiments";
    if (g.id === "haz-collapse") return "risque d'effondrement de bâtiments";
    return g.text;
  })();

  /* POOL de formulations PARAPHRASEÉES (mêmes infos, tournure différente) — taille 4
     Salt = index déterministe. Jamais de nouvel élément. */
  if (!comp) {
    const fNoComp = [
      `${tLabel}`,
      `Événement — ${tLabel}`,
      `Signalement : ${tLabel}`,
      `Incident — ${tLabel}`,
    ];
    let title = fNoComp[((salt % fNoComp.length) + fNoComp.length) % fNoComp.length];
    if (lieu) title = `${title} — ${lieu}`;
    return title.replace(/\s+/g, " ").trim();
  }
  const compUpper = comp.charAt(0).toUpperCase() + comp.slice(1);
  const formulations: string[] = [
    `${tLabel} — ${compUpper}`,
    `${tLabel} : ${compUpper}`,
    `${compUpper} · ${tLabel}`,
    `Événement ${tLabel.toLowerCase()} — ${compUpper}`,
  ];
  let title = formulations[((salt % formulations.length) + formulations.length) % formulations.length];
  if (lieu) title = `${title} — ${lieu}`;
  return title.replace(/\s+/g, " ").trim();
}

/* -------- Construction DESCRIPTION 2-3 phrases (PARAPHRASE SELON SALT, 0 invention) -------- */
function buildSemanticDescription(
  tokens: string[],
  fallbackType: string | null,
  tplL1: string,
  tplL2: string,
  lieuDet: string,
  incidentTypes: IncidentTypeDef[],
  salt: number = 0,
): string {
  const groups = buildSemGroups(tokens);
  const typeKey = detectIncidentType(tokens, fallbackType);
  const tdef = incidentTypes.find((i) => i.id === typeKey) ?? incidentTypes.find((i) => i.id === fallbackType) ?? null;
  const tLabels = (tdef?.labels ?? {}) as Partial<{ fr: string; ar: string; en: string }>;
  let tLabel = ((tLabels.fr ?? tLabels.ar ?? tLabels.en ?? "") as string).toLowerCase() || "incident";
  /* Capitalize 1re lettre + upcase les acronymes connus : CBRN / NRBC / SVT / CRS / BRI / GIGN */
  tLabel = tLabel.replace(/^(.)/, (_, c: string) => c.toUpperCase()).replace(/\b(cbrn|nrb|nrbcc?|svt|crs|bri|gign|raid|sdis|snm|uhc|chu|chru)\b/gi, (m) => m.toUpperCase());
  tLabel = tLabel.replace(/\b(de|des|du|d|et|a|au|aux)\b/gi, (m) => m.toLowerCase());
  const tLabelMin = tLabel.toLowerCase().replace(/\b(cbrn|nrb|nrbcc?|svt|crs|bri|gign|raid|sdis|snm|uhc|chu|chru)\b/gi, (m) => m.toUpperCase());

  const norm = tokens.map(normKW).filter(Boolean);
  const has = (dict: string[]) => norm.some((x) => dict.includes(x));
  const byId = Object.fromEntries(groups.map((g) => [g.id, g]));

  /* POOL de PARAPHRASES — déterministe selon salt. Mêmes informations, formulations différentes. */
  const pool = <T extends string>(arr: T[]): T => arr[((salt % arr.length) + arr.length) % arr.length];

  /* PHRASE 1 : nature incident + caractéristiques GLOBALES (mots-clés uniquement) */
  let p1: string;
  const caracGroup = groups.filter((g) => ["sismic-carac","cbrn","cbrn-leak","flood","storm","fire","explosion","road","drought-general","heatwave"].includes(g.id))[0];
  if (has(SEISMIC_WORDS) && byId["sismic-carac"]) {
    p1 = pool([
      `Un phénomène sismique a été signalé${lieuDet ? lieuDet+", " : ", "}avec un épicentre et une magnitude faisant actuellement l'objet d'une évaluation.`,
      `Secousse tellurique rapportée${lieuDet ?? ""} ; l'épicentre et la magnitude sont en cours d'évaluation.`,
      `Un événement sismique est mentionné${lieuDet ?? ""} — localisation et intensité restent à établir.`,
      `Signalement de phénomène sismique${lieuDet ?? ""}, avec magnitude et épicentre en cours de détermination.`,
    ]);
  } else if (has(FIRE_WORDS) && (has(STORM_WORDS) || has(SMOKE_WORDS))) {
    const hasWind = has(STORM_WORDS);
    const hasSmoke = has(SMOKE_WORDS);
    if (hasWind && hasSmoke) {
      p1 = pool([
        `Un ${tLabelMin} est signalé${lieuDet} dans un contexte de vent fort.`,
        `Contexte de ${tLabelMin}${lieuDet}, avec présence de vent fort.`,
        `Un événement de ${tLabelMin} est rapporté${lieuDet}, accompagné d'un vent fort.`,
        `${tLabel.charAt(0).toUpperCase()+tLabel.slice(1)} signalé${lieuDet} — vent fort mentionné.`,
      ]);
    } else if (hasWind) {
      p1 = pool([
        `Un ${tLabelMin} est signalé${lieuDet} dans un contexte de vent fort.`,
        `Contexte de ${tLabelMin}${lieuDet}, avec présence de vent fort.`,
        `Événement de ${tLabelMin} rapporté${lieuDet}, accompagné d'un vent fort.`,
        `${tLabel.charAt(0).toUpperCase()+tLabel.slice(1)} signalé${lieuDet} — vent fort mentionné.`,
      ]);
    } else {
      p1 = pool([
        `Un ${tLabelMin} est signalé${lieuDet}, accompagné d'émissions de fumées.`,
        `Contexte de ${tLabelMin}${lieuDet}, avec présence de fumées.`,
        `Événement de ${tLabelMin} rapporté${lieuDet} — fumées mentionnées.`,
        `${tLabel.charAt(0).toUpperCase()+tLabel.slice(1)} signalé${lieuDet}, des fumées sont observées.`,
      ]);
    }
  } else if (has(DROUGHT_WORDS)) {
    p1 = pool([
      `Un contexte de ${tLabelMin} est signalé${lieuDet}.`,
      `Situation de ${tLabelMin} rapportée${lieuDet}.`,
      `Un épisode de ${tLabelMin} est mentionné${lieuDet}.`,
      `Cas de ${tLabelMin} signalé${lieuDet}.`,
    ]);
  } else if (has(HEAT_WORDS)) {
    p1 = pool([
      `Un épisode de ${tLabelMin} est signalé${lieuDet}.`,
      `Contexte de ${tLabelMin} rapporté${lieuDet}.`,
      `Une vague de chaleur est mentionnée${lieuDet}.`,
      `Situation de ${tLabelMin} — signalement${lieuDet}.`,
    ]);
  } else if (caracGroup) {
    const gn = normKW(caracGroup.text.replace(/ en cours.*$/, "").replace(/ constaté[s]?$/, "").replace(/ signalé[s]?$/, ""));
    const tn = normKW(tLabel);
    const redondant = tn.length >= 4 && gn.length >= 4 && (tn.includes(gn) || gn.includes(tn));
    const caracIds = ["sismic-carac","cbrn","cbrn-leak","flood","storm","fire","explosion","road","fire-wind","smoke","smoke-wind","drought-stress","drought-water","drought-penurie","drought-general","heatwave"];
    const caracs = groups.filter(g => caracIds.includes(g.id));
    let p1detail: string;
    if (redondant && caracs.length >= 2) {
      p1detail = caracs.slice(0, 3).map(g => g.text).join(", ");
    } else if (redondant) {
      const second = groups.find(g => !caracIds.includes(g.id) && g.priority >= 50);
      p1detail = second ? second.text : caracGroup.text;
    } else {
      p1detail = caracs.slice(0, 2).map(g => g.text).join(", ");
    }
    p1 = pool([
      `Un événement de type ${tLabelMin} a été rapporté${lieuDet} : ${p1detail}.`,
      `Signalement d'un incident classé ${tLabelMin}${lieuDet} — ${p1detail}.`,
      `Contexte ${tLabelMin}${lieuDet} — éléments rapportés : ${p1detail}.`,
      `Cas de type ${tLabelMin}${lieuDet} mentionné : ${p1detail}.`,
    ]);
  } else {
    p1 = tplL1
      .replace(/\{lieuDet\}/g, lieuDet)
      .replace(/(d'intensité|de magnitude|d'épicentre|de profondeur)\s+(de|égale|[0-9]|précis|estimé|valeur)/gi, "$1 en cours d'évaluation")
      .replace(/(plusieurs|environ|au moins|au delà) [0-9,]+/gi, "plusieurs éléments")
      .replace(/[0-9]+(,|\.)?[0-9]*\s*(km|km2|km\/h|t|tonne|%|kWh|°|°C|m|cm|mm|ha|hectare|l|kg|pers|personnes|victimes|vehicules|batiments|hect)/gi, "éléments")
      .replace(/\séléments\séléments/g, "éléments")
      .replace(/\s+/g, " ")
      .trim();
  }

  /* PHRASE 2 : observations FAITS CONSTATÉS UNIQUEMENT (pas d'inférence d'effet, pas d'action recommandée) */
  const observed: string[] = [];
  if (byId["fire-wind"]) {
    observed.push(pool([
      "Contexte de feu associé à du vent fort — éléments combinés rapportés.",
      "Présence simultanée de feu et de vent fort.",
      "Signalement combiné : feu et vent fort.",
      "Feu et vent forts sont mentionnés ensemble.",
    ]));
  }
  if (byId["smoke"]) {
    observed.push(pool([
      "Des émissions de fumée dense sont constatées, avec une réduction potentielle de la visibilité.",
      "Présence de fumée dense — visibilité potentiellement réduite.",
      "Fumée dense observée ; la visibilité pourrait être impactée.",
      "Des émissions fumigènes denses sont mentionnées, avec possible baisse de visibilité.",
    ]));
  }
  if (byId["smoke-wind"]) {
    observed.push(pool([
      "Fumées et vent forts mentionnés dans le même contexte.",
      "Signalement combiné : présence de fumées et de vents.",
      "Contexte fumées associé à des vents — éléments rapportés.",
      "Éléments fumées et vents présents simultanément.",
    ]));
  }
  if (byId["bldg-dmg"]) {
    observed.push(pool([
      "Des dommages sur des bâtiments sont constatés.",
      "Des bâtiments présentent des dommages constatés.",
      "Dommages relevés sur des structures bâties.",
      "Des altérations de bâtiments sont mentionnées.",
    ]));
  } else if (byId["bldg"]) {
    observed.push(pool([
      "Des bâtiments sont concernés par l'événement.",
      "Bâtiments — présence mentionnée dans le contexte.",
      "Structures bâties — signalées comme concernées.",
      "Des éléments bâtis font partie du contexte.",
    ]));
  }
  if (byId["human"]) {
    observed.push(pool([
      "Des éléments humains sont mentionnés dans le signalement.",
      "On note la présence d'éléments humains dans le rapport.",
      "Des informations humaines sont transmises.",
      "Des données relatives aux personnes sont présentes.",
    ]));
  }
  if (byId["dmg"] && !byId["bldg-dmg"]) {
    observed.push(pool([
      "Des dégâts matériels sont constatés.",
      "Dégâts matériels — mentionnés.",
      "On relève des dommages sur du matériel.",
      "Altérations matérielles rapportées.",
    ]));
  }
  if (byId["collapse"] && !byId["haz-collapse"]) {
    observed.push(pool([
      "Un effondrement est rapporté.",
      "Effondrement — signalé.",
      "Un cas d'effondrement est mentionné.",
      "Événement d'effondrement rapporté.",
    ]));
  }
  if (has(EVACUATION_WORDS) && byId["evac"]) {
    observed.push(pool([
      "Une évacuation est mentionnée comme mesure.",
      "Évacuation — présente dans les éléments fournis.",
      "Une mesure d'évacuation est signalée.",
      "Élément « évacuation » présent dans le contexte.",
    ]));
  }
  if (has(FORCES_WORDS) && byId["forces"]) {
    observed.push(byId["forces"].text);
  }
  /* Observed DROUGHT — UNIQUEMENT FAITS, 0 action inventée */
  if (byId["drought-stress"]) {
    observed.push(pool([
      "Un stress hydrique est constaté dans le contexte.",
      "Stress hydrique — mentionné dans les éléments fournis.",
      "Contexte de stress hydrique rapporté.",
      "Cas de stress hydrique — signalé.",
    ]));
  }
  if (byId["drought-soil"]) {
    observed.push(pool([
      "Des sols secs sont observés.",
      "Sols secs — présence constatée.",
      "On note la présence de sols asséchés.",
      "Éléments « sols secs » mentionnés.",
    ]));
  }
  if (byId["drought-water"]) {
    observed.push(pool([
      "Un manque d'eau est signalé.",
      "Manque d'eau — présent dans le contexte.",
      "On rapporte un manque d'eau.",
      "Élément « manque d'eau » mentionné.",
    ]));
  }
  if (byId["drought-penurie"]) {
    observed.push(pool([
      "Une pénurie hydrique est constatée.",
      "Pénurie hydrique — signalée.",
      "Contexte de pénurie hydrique mentionné.",
      "Cas de pénurie hydrique rapporté.",
    ]));
  }
  if (byId["drought-supply"]) {
    observed.push(pool([
      "L'alimentation en eau est impactée.",
      "Alimentation en eau — impactée.",
      "Le réseau d'alimentation en eau est concerné.",
      "Élément « alimentation en eau » mentionné.",
    ]));
  }
  if (byId["drought-restrict"]) {
    observed.push(pool([
      "Une restriction d'eau potable est mentionnée.",
      "Restriction sur l'eau potable — signalée.",
      "Des mesures de restriction d'eau potable sont rapportées.",
      "Élément « restriction d'eau potable » présent.",
    ]));
  }
  if (byId["drought-nappe"]) {
    observed.push(pool([
      "Les nappes phréatiques sont concernées.",
      "Nappes phréatiques — mentionnées.",
      "Le niveau des nappes fait partie du contexte.",
      "Élément « nappes » présent dans le signalement.",
    ]));
  }
  if (byId["drought-agri"]) {
    observed.push(pool([
      "Le contexte agricole est concerné.",
      "Secteur agricole — mentionné.",
      "L'agriculture fait partie des éléments rapportés.",
      "Élément « agricole » présent dans le signalement.",
    ]));
  }
  if (byId["drought-dw"]) {
    observed.push(pool([
      "L'eau potable est concernée par l'événement.",
      "Eau potable — mentionnée comme concernée.",
      "La ressource en eau potable est rapportée.",
      "Élément « eau potable » présent dans le contexte.",
    ]));
  }
  if (byId["drought-general"]) {
    observed.push(pool([
      "Un contexte de sécheresse est rapporté.",
      "Sécheresse — contexte mentionné.",
      "Élément « sécheresse » présent dans le signalement.",
      "Cas de sécheresse rapporté dans les faits.",
    ]));
  }
  if (byId["heatwave"]) {
    observed.push(pool([
      byId["heatwave"].text.charAt(0).toUpperCase() + byId["heatwave"].text.slice(1) + ".",
      `Contexte chaleureux : ${byId["heatwave"].text}.`,
      `Éléments de canicule : ${byId["heatwave"].text}.`,
      `Signalement de chaleur : ${byId["heatwave"].text}.`,
    ]));
  }

  let p2: string;
  const fireSmoke = has(FIRE_WORDS) && (has(STORM_WORDS) || has(SMOKE_WORDS));
  if (fireSmoke && has(SMOKE_WORDS)) {
    p2 = pool([
      "Une fumée dense est également observée, pouvant réduire la visibilité dans les zones concernées.",
      "Des émissions de fumée dense sont aussi constatées, avec possible réduction de la visibilité aux abords.",
      "Une présence de fumée dense est également notée, impactant potentiellement la visibilité.",
      "Fumée dense — aussi observée, avec une baisse de visibilité possible sur les zones concernées.",
    ]);
  } else if (fireSmoke && !has(SMOKE_WORDS)) {
    p2 = pool([
      "Des conditions de vent fort sont constatées en contexte.",
      "Un vent fort est également mentionné.",
      "Vent fort — aussi rapporté dans le contexte.",
      "Un vent fort est aussi signalé.",
    ]);
  } else if (observed.length) {
    const joined = observed.join(" ; ");
    p2 = joined.endsWith(".") ? joined : joined + ".";
  } else {
    const cleaned = tplL2
      .replace(/\{lieuDet\}/g, lieuDet)
      .replace(/[0-9]+(,|\.)?[0-9]*\s*(km|km2|km\/h|t|tonne|%|kWh|°|°C|m|cm|mm|ha|hectare|l|kg|pers|personnes|victimes|vehicules|batiments|hect)/gi, "éléments")
      .replace(/\séléments\séléments/g, "éléments")
      .replace(/(minutes|minute)[^.]*/g, "court délai")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length >= 10) p2 = cleaned;
    else p2 = pool([
      "Le contexte de l'événement nécessite une évaluation complémentaire pour établir un bilan précis.",
      "Des éléments complémentaires sont à vérifier pour établir le contexte.",
      "Bilan précis à compléter par des éléments contextuels.",
      "Analyse complémentaire du contexte requise pour établir un bilan fiable.",
    ]);
  }

  /* PHRASE 3 — SEULEMENT 2 cas exceptionnels autorisés (haz-collapse phrase exacte + cbrn-leak sécurité minimum) */
  let p3 = "";
  if (byId["haz-collapse"]) {
    p3 = pool([
      "Un risque d'effondrement est identifié, nécessitant la sécurisation des zones concernées et l'évaluation des infrastructures potentiellement affectées.",
      "Un cas de risque d'effondrement est mentionné — sécurisation des zones et évaluation des infrastructures impactées sont nécessaires.",
      "Risque d'effondrement détecté : sécurisation des lieux et évaluation des bâtiments ou ouvrages potentiellement touchés.",
      "Effondrement potentiel identifié — les zones concernées requièrent une sécurisation et les infrastructures doivent être évaluées.",
    ]);
  } else if (byId["cbrn-leak"]) {
    p3 = pool([
      "Un confinement préventif est recommandé autour de la zone ; population riveraine invitée à suivre les consignes de confinement si elles sont diffusées.",
      "Confinement préventif conseillé au niveau de la zone — population riveraine invitée à respecter les consignes.",
      "Fuite de produit : confinement préventif recommandé et population riveraine invitée à suivre les consignes officielles.",
      "Mesure de confinement préventif suggérée ; les riverains doivent suivre les consignes diffusées.",
    ]);
  }

  const parts = [p1, p2];
  if (p3) parts.push(p3);
  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const k = normKW(p);
    if (!seen.has(k)) {
      seen.add(k);
      uniq.push(p);
    }
  }
  return uniq.join("\n");
}

/* ================= CATALOGUE TEMPLATES RICHE ===================== */

const TITLE_POOL: Record<string, string[]> = {
  earthquake: ["Séisme ressenti{lieu}", "Phénomène sismique{lieu}", "Tremblement de terre{lieu}", "Activité sismique enregistrée{lieu}", "Réplique sismique{lieu}", "Événement tellurique{lieu}", "Secousse sismique{lieu}", "Alerte séisme{lieu}", "Secousse ressentie{lieu}", "Activité tellurique{lieu}"],
  wildfire: ["Départ de feu de forêt{lieu}", "Incendie en zone végétale{lieu}", "Feu de végétation{lieu}", "Foyer d'incendie{lieu}", "Feu de broussailles{lieu}", "Propagation d'incendie{lieu}", "Départ de feu{lieu}", "Feu de forêt{lieu}", "Flamme en zone verte{lieu}", "Incendie végétal{lieu}"],
  flood: ["Inondation{lieu}", "Crues et montée des eaux{lieu}", "Risque inondation{lieu}", "Submersion localisée{lieu}", "Ruissellement et inondations{lieu}", "Hausse rapide des cours d'eau{lieu}", "Débordement{lieu}", "Crue soudaine{lieu}", "Montée des eaux{lieu}", "Inondations torrentielles{lieu}"],
  storm: ["Tempête et orages violents{lieu}", "Événement climatique{lieu}", "Orages et vents forts{lieu}", "Rafales et précipitations{lieu}", "Perturbation atmosphérique{lieu}", "Orage violent{lieu}", "Épisode orageux{lieu}", "Tempête de vent{lieu}", "Rafales orageuses{lieu}", "Perturbation météo{lieu}"],
  road: ["Accident routier{lieu}", "Accident sur la voie publique{lieu}", "Collision routière{lieu}", "Sortie de route{lieu}", "Accident de circulation{lieu}", "Accident impliquant plusieurs véhicules{lieu}", "Accident VL{lieu}", "Accident poids lourd{lieu}", "Collision sur route{lieu}", "Accident et embouteillage{lieu}"],
  industrial: ["Incident industriel{lieu}", "Événement sur site industriel{lieu}", "Alerte site sensible{lieu}", "Sinistre industriel{lieu}", "Incident sur installation classée{lieu}", "Accident du travail{lieu}", "Fuite produit{lieu}", "Alerte industrielle{lieu}", "Incident usine{lieu}", "Événement site SEVESO{lieu}"],
  explosion: ["Explosion{lieu}", "Incident avec déflagration{lieu}", "Déflagration{lieu}", "Explosion sur site{lieu}", "Souffle et débris{lieu}", "Explosion accidentelle{lieu}", "Explosion gaz{lieu}", "Déflagration{lieu}", "Explosion et incendie{lieu}", "Souffle violent{lieu}"],
  epidemic: ["Alerte sanitaire{lieu}", "Cluster épidémique suspecté{lieu}", "Cas groupés suspectés{lieu}", "Événement sanitaire{lieu}", "Foyer épidémique{lieu}", "Foyer infectieux{lieu}", "Cas suspect groupés{lieu}", "Alerte cluster{lieu}", "Épisode infectieux{lieu}", "Investigation sanitaire{lieu}"],
  drought: ["Sécheresse{lieu}", "Situation de sécheresse{lieu}", "Épisode de sécheresse{lieu}", "Pénurie d'eau{lieu}", "Sécheresse agricole{lieu}", "Alimentation en eau dégradée{lieu}", "Sécheresse prolongée{lieu}", "Pénurie hydrique{lieu}", "Baisse du niveau des nappes{lieu}", "Restriction eau potable{lieu}"],
  heatwave: ["Vague de chaleur{lieu}", "Épisode caniculaire{lieu}", "Chaleur extrême{lieu}", "Températures exceptionnelles{lieu}", "Canicule{lieu}", "Vagues de chaleur{lieu}", "Chaleur record{lieu}", "Épisode de chaleur{lieu}", "Pic de chaleur{lieu}", "Chaleur intense{lieu}"],
  missing: ["Disparition{lieu}", "Personne disparue{lieu}", "Recherche de personne disparue{lieu}", "Alerte disparition{lieu}", "Disparition inquiétante{lieu}", "Fugue{lieu}", "Recherche personne{lieu}", "Alerte recherche{lieu}", "Disparu{lieu}", "Enfant disparu{lieu}"],
  cbrn: ["Incident CBRN{lieu}", "Risque chimique / radiologique{lieu}", "Fuite suspectée{lieu}", "Alerte produit dangereux{lieu}", "Fuite chimique{lieu}", "Incident radiologique{lieu}", "Exposition produit toxique{lieu}", "Alerte NRBC{lieu}", "Contamination suspectée{lieu}", "Risque toxique{lieu}"],
};
const TITLE_POOL_GEN = ["Signalement{lieu}", "Événement{lieu}", "Incident{lieu}", "Intervention{lieu}", "Alerte{lieu}", "Situation{lieu}", "Opération{lieu}", "Point de situation{lieu}"];

const DESC_POOL: Record<string, DescPair[]> = {
  earthquake: [
    { l1: "Un épisode sismique a été ressenti{lieuDet} ; l'intensité exacte et l'épicentre sont en cours de confirmation par les services spécialisés.", l2: "Équipes déployées pour évaluer le bilan humain et matériel, évacuation préventive des bâtiments les plus exposés si nécessaire." },
    { l1: "Séisme enregistré{lieuDet} ; vibrations ressenties dans plusieurs communes alentours selon premières informations terrain.", l2: "Mise en place d'un périmètre de sécurité autour des zones à risque, activation du plan de continuité et suivi continu des répliques potentielles." },
    { l1: "Secousse tellurique{lieuDet} — intensité en cours d'évaluation par les autorités.", l2: "Reconnaissance rapide des bâtiments publics et des infrastructures routières à proximité ; recensement immédiat des dégâts visibles." },
    { l1: "Activité sismique{lieuDet} signalée par plusieurs témoins.", l2: "Population invitée à rester prudente ; équipes techniques mobilisées pour contrôler la stabilité des ouvrages à proximité." },
    { l1: "Réplique sismique{lieuDet} après événement principal antérieur.", l2: "Renforcement du suivi des zones endommagées ; évacuation préventive des bâtiments fragiles et coordination avec l'ensemble des acteurs." },
    { l1: "Tremblement de terre{lieuDet} — premières estimations de magnitude en attente.", l2: "Dispositif de secours prépositionné, prise en charge médicale immédiate des victimes potentielles et ouverture d'un point d'accueil." },
  ],
  wildfire: [
    { l1: "Départ de feu détecté{lieuDet} dans une zone à végétation dense ; propagation en cours selon les premières observations.", l2: "Intervention des moyens terrestres et aériens en cours ; évacuation préventive des habitations les plus exposées si nécessaire." },
    { l1: "Foyer d'incendie{lieuDet} signalé en zone de maquis, orientation variable selon le vent.", l2: "Déploiement des pompiers, appui aérien et protection des habitations ; alerte aux riverains de la zone concernée." },
    { l1: "Incendie de végétation{lieuDet} en propagation ; surface brûlée en cours d'évaluation.", l2: "Évacuation préventive des habitations proches ; montée en puissance des moyens et coordination avec la météorologie pour l'évolution du vent." },
    { l1: "Départ de feu de forêt{lieuDet} — alerte transmise à la colonne mobile.", l2: "Intervention rapide pour circonscrire le foyer ; appui logistique et suivi météorologique horaire." },
    { l1: "Feu de broussailles{lieuDet} risque propagation si le vent se lève.", l2: "Périmètre de sécurité autour de la zone, protection des habitations proches et patrouilles anti-rallumage." },
    { l1: "Feu de forêt{lieuDet} — plusieurs foyers secondaires détectés.", l2: "Montée en puissance des moyens, découpage des foyers et priorisation des zones à habitat." },
  ],
  flood: [
    { l1: "Montée rapide des eaux{lieuDet} ; plusieurs points bas commencent à être inondés.", l2: "Mise en place de périmètres de sécurité, évacuation préventive des populations riveraines et prépositionnement de moyens de secours nautiques." },
    { l1: "Crue soudaine{lieuDet} avec augmentation rapide du niveau des cours d'eau.", l2: "Intervention nautique, évacuation des zones inondables et renforcement des digues si nécessaire." },
    { l1: "Inondation{lieuDet} causée par des pluies intenses et durables.", l2: "Reconnaissance par bateau, recensement des isolés, prise en charge sanitaire et montée en puissance du dispositif." },
    { l1: "Risque d'inondation{lieuDet} — seuil critique atteint sur un cours d'eau voisin.", l2: "Alerte des communes, préparation d'évacuations préventives et prépositionnement de sables et matériel d'endiguement." },
    { l1: "Débordement{lieuDet} de la voie d'eau après orages violents.", l2: "Périmètres de sécurité, fermetures de routes et mise à l'abri des populations riveraines immédiates." },
    { l1: "Submersion{lieuDet} progressive sur plusieurs communes.", l2: "Coordination des secours nautiques, ouverture de centres d'hébergement et suivi hydrologique en continu." },
  ],
  storm: [
    { l1: "Orages et vents violents{lieuDet} avec chutes d'arbres et dégâts sur le réseau électrique selon les premiers retours terrain.", l2: "Déploiement d'équipes pour sécuriser les axes, rétablir les réseaux et porter secours aux populations impactées." },
    { l1: "Perturbation météorologique{lieuDet} avec rafales et précipitations orageuses.", l2: "Sécurisation des sites publics, patrouilles pour dégager les axes et appui aux gestionnaires de réseaux." },
    { l1: "Épisode orageux{lieuDet} — chutes de grêle possibles sur la zone.", l2: "Protection des zones exposées, prise en charge des blessés légers et surveillance des toitures et vitrages endommagés." },
    { l1: "Vents violents{lieuDet} — plusieurs arbres couchés sur des axes secondaires.", l2: "Équipes de débouchage mobilisées, fermeture préventive des routes touchées et remise en état des réseaux aériens." },
    { l1: "Tempête{lieuDet} — alerte météo orange en cours sur le secteur.", l2: "Renforcement des équipes d'astreinte, prépositionnement du matériel d'urgence et suivi de l'évolution des vents et inondations associées." },
    { l1: "Orage violent{lieuDet} avec risque d'éclairs et surtensions.", l2: "Protection des victimes, sécurisation des installations sensibles et soutien aux communes impactées." },
  ],
  road: [
    { l1: "Accident sur la voie publique{lieuDet} impliquant au moins un véhicule ; bilan humain en cours d'évaluation.", l2: "Mise en place d'un périmètre de sécurité, prise en charge des victimes et dégagement de la chaussée pour rétablir la circulation." },
    { l1: "Collision routière{lieuDet} — plusieurs véhicules impliqués d'après témoins.", l2: "Prise en charge médicale urgente, relevage des véhicules et signalisation du site pour éviter l'accumulation." },
    { l1: "Accident{lieuDet} — sortie de route avec véhicule en bordure de chaussée.", l2: "Extrications si nécessaire, prise en charge du conducteur et sécurisation du tronçon avant dégagement." },
    { l1: "Accident poids lourd{lieuDet} risque de déversement marchandise.", l2: "Spécialistes marchandises dangereuses alertés, périmètre élargi et expertise du chargement avant toute manœuvre." },
    { l1: "Piéton heurté{lieuDet} — personne blessée en cours de prise en charge.", l2: "SMUR et SAMU mobilisés, sécurisation du croisement et auditions de témoins par les enquêteurs." },
    { l1: "Accident deux roues{lieuDet} — usager vulnérable.", l2: "Intervention rapide médicale, sécurisation du site et relevés techniques pour déterminer les circonstances exactes." },
  ],
  industrial: [
    { l1: "Incident sur site industriel{lieuDet} ; mesure des niveaux de risque et confinement préventif en cours.", l2: "Intervention spécialisée, identification des risques potentiels pour les populations riveraines et coordination avec les services de l'État." },
    { l1: "Fuite produit{lieuDet} sur un site industriel ; nature du produit en cours d'identification.", l2: "Périmètre de sécurité adapté, prise en charge des employés exposés et mesures de décontamination si nécessaire." },
    { l1: "Alerte site sensible{lieuDet} — détection anormale dans les capteurs de sécurité.", l2: "Équipes d'intervention spécialisées mobilisées, vérifications instrumentées et population riveraine invitée à rester confinée si besoin." },
    { l1: "Incendie sur site industriel{lieuDet} — risque d'extension aux cuves ou stockages.", l2: "Moyens lourds de lutte contre l'incendie, périmètre de sécurité et alerte aux populations avoisinantes." },
    { l1: "Accident du travail{lieuDet} — intervention dans un site de production.", l2: "Prise en charge médicale immédiate de la victime, enquête circonstanciée et sécurité renforcée sur le site." },
    { l1: "Risque SEVESO{lieuDet} — incident nécessitant l'activation du PPI.", l2: "Coordination préfectorale, informations aux riverains et déclenchement des mesures d'urgence du plan particulier d'intervention." },
  ],
  explosion: [
    { l1: "Explosion{lieuDet} suivie de dégâts matériels ; origine en cours de détermination.", l2: "Périmètre de sécurité immédiat, prise en charge des victimes et recherche de survivants parmi les débris." },
    { l1: "Déflagration{lieuDet} — souffle entendu dans un large périmètre.", l2: "Intervention multi-services, repérage des blessés, évacuation préventive des bâtiments adjacents et enquête technique." },
    { l1: "Explosion gaz{lieuDet} — fuite possible d'une conduite ou bouteille.", l2: "Fermeture des arrivées de gaz au secteur, sécurisation incendie et prise en charge des victimes exposées au souffle." },
    { l1: "Explosion et incendie{lieuDet} secondaire après déflagration.", l2: "Priorisation des secours aux personnes puis maîtrise des foyers d'incendie dans les débris." },
    { l1: "Souffle violent{lieuDet} — nombreuses vitres et façades endommagées.", l2: "Mise en sécurité des riverains, recensement des blessés et nettoyage sécurisé des voiries." },
    { l1: "Explosion sur site{lieuDet} — intervention en zone potentiellement confinée.", l2: "Reconnaissance des risques toxiques, équipement CBRN si nécessaire et extraction des victimes potentielles." },
  ],
  epidemic: [
    { l1: "Cas groupés suspectés{lieuDet} avec un tableau clinique compatible ; investigations épidémiologiques en cours.", l2: "Activation des dispositifs de veille sanitaire, prise en charge médicale des cas et mesures de prévention autour de la zone." },
    { l1: "Foyer épidémique{lieuDet} — premiers cas identifiés dans une structure collective.", l2: "Isolement des cas, traçabilité des contacts et renforcement des mesures d'hygiène sur le site." },
    { l1: "Cluster suspecté{lieuDet} — investigation épidémiologique immédiate.", l2: "Tests de dépistage, isolement préventif et informations aux populations vulnérables du secteur." },
    { l1: "Foyer infectieux{lieuDet} dans une école, EHPAD ou site de rassemblement.", l2: "Fermeture temporaire du site si nécessaire, désinfection renforcée et suivi sanitaire des personnes exposées." },
    { l1: "Alerte sanitaire{lieuDet} — signalement de cas inhabituels.", l2: "Coordination avec les services de santé et hôpitaux proches, montée en puissance du dispositif d'alerte et préparation lits." },
    { l1: "Investigation sanitaire{lieuDet} après signalement de symptômes groupés.", l2: "Recherche étiologique rapide, prise en charge des malades et renforcement des barrières hygiéniques dans les lieux publics." },
  ],
  drought: [
    { l1: "Situation de sécheresse{lieuDet} avec dégradation progressive de la ressource en eau potable et agricole.", l2: "Intervention déclenchée : évaluation du niveau des nappes et réserves, mise en place de restrictions adaptées et soutien aux populations les plus exposées." },
    { l1: "Perturbation de l'alimentation en eau{lieuDet} liée à une sécheresse prolongée.", l2: "Reconnaissance terrain, périmètre de sécurité autour des points d'eau, plan de distribution d'eau potable par camion-citerne si besoin." },
    { l1: "Sécheresse{lieuDet} et impact sur l'agriculture et le bétail.", l2: "Évaluation du cheptel et des cultures, soutien logistique et mise en œuvre de mesures d'urgence pour l'abreuvement et récolte." },
    { l1: "Pénurie hydrique{lieuDet} — niveau des nappes phréatiques bas.", l2: "Renforcement du suivi des captages, coordination avec les gestionnaires de réseau et campagnes d'économie d'eau sur le territoire." },
    { l1: "Restriction eau potable{lieuDet} — mise en place de mesures arrêtées par les autorités.", l2: "Contrôles terrain, information des usagers et organisation de la distribution d'appui par camion-citerne pour les communes touchées." },
    { l1: "Sécheresse prolongée{lieuDet} — risque incendie forêt aggravé.", l2: "Renforcement des patrouilles de surveillance forêt, alerte aux populations et prépositionnement de moyens d'extinction préventifs." },
  ],
  heatwave: [
    { l1: "Vague de chaleur{lieuDet} avec températures exceptionnelles prévues sur plusieurs jours.", l2: "Déploiement d'un dispositif de surveillance des populations vulnérables, activation des espaces rafraîchis et coordination avec les centres hospitaliers." },
    { l1: "Canicule{lieuDet} — vigilance orange ou rouge selon prévisions.", l2: "Appels et visites aux personnes âgées isolées, distribution d'eau et ouverture 24/24 des lieux rafraîchis." },
    { l1: "Chaleur extrême{lieuDet} — coup de chaleur possible chez les personnes vulnérables.", l2: "Prise en charge médicale précoce des cas suspects, sensibilisation aux risques et appui aux structures d'accueil." },
    { l1: "Pic de chaleur{lieuDet} — augmentation rapide de la température.", l2: "Organisation de la surveillance horaire des populations à risque ; coordination avec SAMU pour transports médicalisés si besoin." },
    { l1: "Températures élevées{lieuDet} sur plusieurs jours d'affilée.", l2: "Ouverture de fontaines publiques, désinfection des lieux de rassemblement et communication usagers sur les bons gestes." },
    { l1: "Épisode caniculaire{lieuDet} — impact sur l'activité professionnelle extérieure.", l2: "Information des employeurs sur les consignes de sécurité, soutien aux chantiers et contrôle des conditions de travail." },
  ],
  missing: [
    { l1: "Signalement de disparition{lieuDet} ; circonstances de la disparition en cours d'investigation.", l2: "Déploiement de patrouilles de recherche sur la zone, activation du dispositif d'alerte et coordination avec les enquêteurs." },
    { l1: "Personne disparue{lieuDet} disparition inquiétante, profil vulnérable.", l2: "Rassemblement des informations ; recherches hélicoptère possible si les conditions le permettent ; activation alerte disparition." },
    { l1: "Fugue{lieuDet} — mineur ou adulte ; connaissance du territoire.", l2: "Équipes cynophiles et patrouilles pédestres ; entretiens avec l'entourage et diffusion du signalement." },
    { l1: "Disparition en montagne{lieuDet} ou zone rurale difficile d'accès.", l2: "Mobilisation gendarmerie, secours en montagne et hélicoptère ; cartographie fine des derniers lieux de passage." },
    { l1: "Recherche personne âgée{lieuDet} — personne désorientée sortie d'EHPAD ou domicile.", l2: "Déploiement multi-services : alerte voisinage, patrouilles itinéraires connus, préparation prise en charge médicale à la localisation." },
    { l1: "Enfant disparu{lieuDet} — inquiétude immédiate des proches.", l2: "Dispositif de recherche mobilisé en priorité maximale ; alerte diffusion large et patrouilles secteur." },
  ],
  cbrn: [
    { l1: "Fuite ou exposition suspecte{lieuDet} à un produit chimique / radiologique.", l2: "Mise en place d'un périmètre de sécurité CBRN, prise en charge des victimes avec décontamination si nécessaire et analyse des risques." },
    { l1: "Fuite chimique{lieuDet} — odeur et symptômes rapportés par témoins.", l2: "Confinement des riverains au vent opposé, décontamination des personnes exposées et mesures d'urgence NRBC." },
    { l1: "Incident NRBC{lieuDet} — agents biologiques ou toxiques soupçonnés.", l2: "Équipement NRBC complet des intervenants, périmètres de zone chaude / froide et soutien laboratoire." },
    { l1: "Produit toxique{lieuDet} — déversement accidentel sur une zone.", l2: "Intervention spécialisée, barrières de confinement et neutralisation ; suivi qualité de l'air et de l'eau." },
    { l1: "Risque radiologique{lieuDet} — source orpaille ou détecteur anormal.", l2: "Gendarmerie spécialisée, expertise radiologique et confinement préventif autour du secteur." },
    { l1: "Contamination suspectée{lieuDet} — plusieurs cas de maux de tête ou irritations.", l2: "Décontamination immédiate, analyse atmosphérique et enquête pour identifier la source et les exposés." },
  ],
};
const DESC_POOL_GEN: DescPair[] = [
  { l1: "Intervention déclenchée{lieuDet} suite à un signalement concernant un {label}.", l2: "Périmètre de sécurité, reconnaissance et évaluation complète de la situation en cours par les responsables de secteur." },
  { l1: "Événement signalé{lieuDet} — opérations de prise en charge immédiate initiées.", l2: "Coordination opérationnelle des moyens engagés et maintien du commandement pour le suivi de l'incident." },
  { l1: "Intervention en cours{lieuDet} pour gestion d'un événement.", l2: "Montée en puissance adaptative ; informations régulières aux autorités et populations riveraines." },
  { l1: "Alerte{lieuDet} transmission validée par le commandement.", l2: "Moyens déployés pour reconnaissance et sécurisation ; point de situation prévu à court délai." },
  { l1: "Situation{lieuDet} — prise en charge par le CODIS.", l2: "Sécurisation du site, prise en charge des victimes et préparation du retour à la normale." },
  { l1: "Opération{lieuDet} — intervention multi-services coordonnée.", l2: "Recensement des moyens, bilans humain et matériel transmis à la cellule de crise." },
];

/* ===================== PICKERS INDÉPENDANTS TITRE / DESCRIPTION ===================== */

/** Pick TITRE — si keywords présents, construit via buildSemanticTitle. */
export function pickTitle(input: DescriptionProposalInput, salt: number): string {
  if (!input.type) return "";
  const label = labelOf(input);
  const lieu = lieuOf(input);
  const tokens = keywordTokens(input.keywords);
  const titles = TITLE_POOL[input.type] ?? TITLE_POOL_GEN;
  const tpl = titles[rngSeed(salt * 131 + titles.length * 17 + 7, titles.length)] ?? TITLE_POOL_GEN[0];
  const injected = inject(tpl as string, label, lieu).replace(/\s+/g, " ").trim();
  if (tokens.length === 0) return injected;
  return buildSemanticTitle(tokens, input.type, injected, lieu, input.incidentTypes, salt);
}

/** Pick DESCRIPTION — si keywords présents, construit via buildSemanticDescription. */
export function pickDesc(input: DescriptionProposalInput, salt: number): string {
  if (!input.type) return "";
  const label = labelOf(input);
  const lieu = lieuOf(input);
  const lieuDet = lieu ? ` au niveau de ${lieu}` : "";
  const tokens = keywordTokens(input.keywords);
  const descs = DESC_POOL[input.type] ?? DESC_POOL_GEN;
  const dTpl: DescPair = (descs[rngSeed(salt * 271 + descs.length * 53 + 11, descs.length)] as DescPair) ?? DESC_POOL_GEN[0];
  const base = buildDesc(dTpl, label, lieu);
  if (tokens.length === 0) return base;
  return buildSemanticDescription(tokens, input.type, dTpl.l1, dTpl.l2, lieuDet, input.incidentTypes, salt);
}

/* ====================== HOOK PRINCIPAL : 2 COMPTEURS / 2 SETTERS SÉPARÉS ====================== */

export function useDraftProposal(
  input: DescriptionProposalInput,
  opts?: {
    currentTitle: string;
    currentDesc: string;
    autoApplyIfEmpty?: boolean;
    setTitle: (t: string) => void;
    setDesc: (d: string) => void;
  },
) {
  const [regenT, setRegenT] = useState(1);
  const [regenD, setRegenD] = useState(1);
  const prevSaltT = useRef(0);
  const prevSaltD = useRef(0);
  const firstInitDone = useRef(false);

  const titleProposal = useMemo(() => pickTitle(input, regenT), [
    input.type, input.adresse, input.province, input.ville, input.pt,
    input.lang, input.incidentTypes, regenT,
  ]);
  const descProposal = useMemo(() => pickDesc(input, regenD), [
    input.type, input.adresse, input.province, input.ville, input.pt,
    input.lang, input.incidentTypes, regenD,
  ]);

  const proposal: Proposal = { title: titleProposal, desc: descProposal };
  const titleUsed = Boolean(opts && opts.currentTitle.trim() === titleProposal.trim() && titleProposal);
  const descUsed = Boolean(opts && opts.currentDesc.trim() === descProposal.trim() && descProposal);

  useEffect(() => {
    if (!opts || !input.type) return;
    if (regenT !== prevSaltT.current) {
      if (regenT > 1) {
        if (titleProposal) opts.setTitle(titleProposal);
      } else if (opts.autoApplyIfEmpty && !firstInitDone.current && !opts.currentTitle.trim()) {
        if (titleProposal) opts.setTitle(titleProposal);
      }
      prevSaltT.current = regenT;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regenT, input.type]);

  useEffect(() => {
    if (!opts || !input.type) return;
    if (regenD !== prevSaltD.current) {
      if (regenD > 1) {
        if (descProposal) opts.setDesc(descProposal);
      } else if (opts.autoApplyIfEmpty && !firstInitDone.current && !opts.currentDesc.trim()) {
        if (descProposal) opts.setDesc(descProposal);
      }
      prevSaltD.current = regenD;
    }
    firstInitDone.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regenD, input.type]);

  const regenFreshT = useCallback(() => setRegenT((x) => x + 1), []);
  const regenFreshD = useCallback(() => setRegenD((x) => x + 1), []);
  const applyTitle = useCallback(() => { if (titleProposal && opts) opts.setTitle(titleProposal); }, [titleProposal, opts]);
  const applyDesc = useCallback(() => { if (descProposal && opts) opts.setDesc(descProposal); }, [descProposal, opts]);

  return {
    proposal, regenFreshT, regenFreshD, applyTitle, applyDesc,
    regenFresh: regenFreshT, titleUsed, descUsed,
  };
}

/* ====================== COMPOSANTS BOUTONS INTÉGRÉS DANS LES CHAMPS ====================== */
const BTN_BASE = "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors";

function AssistButtons(props: {
  label: string; onApply: () => void; onRegen: () => void; applied: boolean; disabled?: boolean;
}): ReactNode {
  const { label, onApply, onRegen, applied, disabled } = props;
  return (
    <div className="flex shrink-0 items-center gap-1" aria-label={`Assistant IA · ${label}`}>
      <button
        type="button" onClick={onApply} disabled={disabled || applied}
        title={applied ? `Proposition ${label} déjà appliquée` : `Appliquer la proposition IA · ${label}`}
        className={cn(BTN_BASE, applied
          ? "border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-400"
          : "border-or-500/25 bg-or-500/8 text-or-700 hover:bg-or-500/16 dark:text-or-300",
          disabled ? "cursor-not-allowed opacity-40" : "")}
      >
        <Icon path={applied ? UI_ICONS.check : UI_ICONS.sparkles} className="h-3.5 w-3.5" />
      </button>
      <button
        type="button" onClick={onRegen} disabled={disabled}
        title={`Régénérer la proposition IA · ${label} — uniquement ${label.toLowerCase()}`}
        className={cn(BTN_BASE, "border-gray-300/80 bg-white/90 text-gray-700 hover:bg-gray-100 dark:border-white/10 dark:bg-white/[0.06] dark:text-rdia-200 dark:hover:bg-white/[0.12]", disabled ? "cursor-not-allowed opacity-40" : "")}
      >
        <Icon path={UI_ICONS.refresh} className="h-3 w-3" />
      </button>
    </div>
  );
}

export function TitleAssistButtons(props: { onApply: () => void; onRegen: () => void; applied: boolean; disabled?: boolean; }): ReactNode {
  return <AssistButtons label="Titre" {...props} />;
}
export function DescAssistButtons(props: { onApply: () => void; onRegen: () => void; applied: boolean; disabled?: boolean; }): ReactNode {
  return <AssistButtons label="Description" {...props} />;
}

/* ====================== RETRO-COMPAT (ancien composant → affiche RIEN) ====================== */
export function IncidentDraftAssist(): ReactNode { return null; }
