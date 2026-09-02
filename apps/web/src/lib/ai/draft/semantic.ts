// ============================================================================
// lib/ai/draft/semantic.ts — moteur sémantique : groupes de mots, type déduit, titre et description
//
// Aucune valeur précise n'est inventée : ni magnitude, ni ville, ni bilan.
// Le moteur ne fait que RELIER les mots-clés saisis par l'opérateur.
// Logique PURE, sans React : extraite de IncidentDraftAssist.tsx pour être
// testée seule et réutilisée par le brouillon LLM (lib/ai/llmIncidentDraft.ts)
// sans qu'une bibliothèque n'importe plus un composant.
// ============================================================================

import { AIR_ASSET_WORDS , BUILDING_WORDS, CBRN_ACTION_WORDS, CBRN_WORDS, COLLAPSE_WORDS, DAMAGE_WORDS, DROUGHT_WORDS, EVACUATION_WORDS, EXPLOSION_WORDS, FIRE_WORDS, FLOOD_WORDS, FORCES_WORDS, HAZARD_WORDS, HEAT_WORDS, HUMAN_WORDS, INDUSTRIAL_WORDS, MEDICAL_WORDS, ROAD_WORDS, SEISMIC_WORDS, SMOKE_WORDS, STORM_WORDS, WATER_ASSET_WORDS, normKW} from "./lexicon";
import type { IncidentTypeDef } from "@/lib/types";
import type { SemGroup } from "./types";

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
export function buildSemanticTitle(
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
export function buildSemanticDescription(
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
