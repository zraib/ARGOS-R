// ========================================================================
// Conscience Situationnelle IA — MODÈLE LLM OLLAMA LOCAL + fallback déterministe.
// ========================================================================
import type { DashStats, Hospital, Incident, Unit, Lang } from "@/lib/types";
import type { LlmProviderConfig } from "@/lib/ai/config";
import { chatComplete } from "@/lib/ai/provider";
import type { EquipItem } from "@/lib/data/modules";
import { clamp01, safeNum } from "@/lib/ai/shared";
import type {
  CriticalFactor,
  GlobalAlertLevel,
  Hotspot,
  NextRisk,
  SituationalAwareness,
  SituationalForecasts,
} from "./types";
import { filterActiveIncidents } from "@/lib/derive";
import { tpl } from "@/lib/i18n/format";

// ========================================================================
// Injection libellés localisés · Pattern identique à EvolutionLabels/PdfLabels
// ------------------------------------------------------------------------
// Interface publique, DEFAULT FR strict (rétrocompat appel anciens), merge
// partial → DEFAULT ∪ partial. Param optionnel `labels?` sur les 2 computes.
// ========================================================================
export interface SituationalLabels {
  fc_hospital_saturation_full: string;
  fc_hospital_saturation_critical: string;
  fc_hospital_tension: string;
  fc_simultaneous_high_incidents: string;
  fc_one_high_incident: string;
  fc_unit_readiness_low: string;
  fc_rapid_deterioration: string;
  fc_notable_improvement: string;
  fc_situation_controlled: string;
  rt_hospital_saturation: string;
  rt_seismic_aftershocks: string;
  rt_critical_zone_degradation: string;
  rt_situation_stable: string;
  zone_national: string;
  zone_hospital_network: string;
  zone_epicentral: string;
  flow_trend_up: string;
  flow_trend_stable: string;
  flow_trend_down: string;
  syn_alerte_rouge: string;
  syn_vigilance: string;
  syn_surveillance: string;
  syn_calme: string;
}

export const DEFAULT_SITUATIONAL_LABELS: SituationalLabels = {
  fc_hospital_saturation_full: "Saturation hôpital {nom} ({ville})",
  fc_hospital_saturation_critical: "Saturation hospitalière critique",
  fc_hospital_tension: "Tension sur le réseau hospitalier",
  fc_simultaneous_high_incidents: "{n} incidents critiques simultanés",
  fc_one_high_incident: "1 incident critique en cours",
  fc_unit_readiness_low: "Readiness des unités insuffisante",
  fc_rapid_deterioration: "Aggravation rapide ({durée})",
  fc_notable_improvement: "Amélioration notable",
  fc_situation_controlled: "Situation maîtrisée (aucun facteur critique détecté)",
  rt_hospital_saturation: "Saturation hospitalière",
  rt_seismic_aftershocks: "Répliques sismiques & aggravation bilan",
  rt_critical_zone_degradation: "Dégradation zone critique",
  rt_situation_stable: "Situation stable",
  zone_national: "National",
  zone_hospital_network: "Réseau hospitalier",
  zone_epicentral: "Zone épicentrale",
  flow_trend_up: "↗ en hausse",
  flow_trend_stable: "↗ stable",
  flow_trend_down: "↘ en baisse",
  syn_alerte_rouge: "ALERTE ROUGE — {openHigh} incident(s) critique(s) · hôpitaux {satPct}% sat. · focus {region}.",
  syn_vigilance: "Vigilance renforcée — {openInc} incident(s) ouvert(s) · {openHigh} critique(s) · tension capacités.",
  syn_surveillance: "Surveillance — {openInc} incident(s) ouvert(s) · capacités suffisantes · évolution standard.",
  syn_calme: "Calme — situation maîtrisée · {openInc} incident(s) ouvert(s).",
};

export function mergeSituationalLabels(
  partial?: Partial<SituationalLabels>,
): SituationalLabels {
  if (!partial) return DEFAULT_SITUATIONAL_LABELS;
  return { ...DEFAULT_SITUATIONAL_LABELS, ...partial };
}

// ---------- helpers (depuis shared.ts : clamp01 + safeNum) ------------------------
function numOr(v: unknown, d: number): number { return safeNum(v, d); }
function pickLL<T extends string>(v: unknown, list: readonly T[]): T | null {
  return typeof v === "string" && list.includes(v as T) ? (v as T) : null;
}
// ---------- ----------------------------------------------------------------

// ============================================================
// 1) FALLBACK DÉTERMINISTE (100% réel, zéro invention)
// ============================================================
export function computeSituationalAwarenessFallback(
  input: {
    incidents: Incident[];
    hospitals: Hospital[];
    units: Unit[];
    dashStats: DashStats | null;
    equipment?: EquipItem[];
    now?: number;
  },
  labels?: Partial<SituationalLabels>,
): SituationalAwareness {
  const { incidents, hospitals, units, dashStats, equipment = [], now } = input;
  const L = mergeSituationalLabels(labels);
  const time = now ?? Date.now();
  const openInc = filterActiveIncidents(incidents);
  const openHigh = openInc.filter((i) => i.sev === "high").length;
  const openMed = openInc.filter((i) => i.sev === "medium").length;
  const sev = dashStats?.severity ?? { high: openHigh, medium: openMed, low: Math.max(0, openInc.length - openHigh - openMed) };

  // scoreGlobal
  const severity = sev.high * 30 + sev.medium * 12 + sev.low * 3;
  const worstOccPct = hospitals.length
    ? Math.max(...hospitals.map((h) => (h.lits > 0 ? h.occ / h.lits : 0)))
    : 0;
  const hospitalSat = Math.round(worstOccPct * 22);
  const readinessAvg = units.length
    ? units.reduce((s, u) => s + (Number.isFinite(u.readiness) ? u.readiness : 0.5), 0) / units.length
    : 0.5;
  const readinessPen = Math.round((1 - clamp01(readinessAvg)) * 15);
  const scoreGlobal = Math.max(0, Math.min(100, severity + hospitalSat + readinessPen));

  const niveauGlobal: GlobalAlertLevel =
    scoreGlobal >= 75 ? "alerte_rouge" :
    scoreGlobal >= 45 ? "vigilance" :
    scoreGlobal >= 20 ? "surveillance" : "calme";

  // ---------- PRÉDICTIONS EXCLUSIVES (ZÉRO redondance KPI dashboard) ----------
  // Base occupancy + capacity
  const litsTot = hospitals.reduce((s, h) => s + Math.max(0, h.lits), 0);
  const litsOcc = hospitals.reduce((s, h) => s + Math.max(0, h.occ), 0);
  const litsDispos = Math.max(0, litsTot - litsOcc);
  const litsOccPct = litsTot ? clamp01(litsOcc / litsTot) : 0;

  // Flux estimé (patients par jour) depuis évolution / incidents ouverts et gravité
  const evoBase = dashStats?.evolution ?? [];
  const flux24h = evoBase.length >= 2
    ? Math.max(0, evoBase.slice(-2).reduce((a, b) => a + (b.opened ?? 0), 0) * 3) // ≈ 3 patients / incident ouvert moyen
    : Math.max(5, openInc.length * 4);
  const fluxParMinute = flux24h / (24 * 60);

  // --- #1) TTG (temps avant saturation globale en minutes) ---
  const occParMinute = fluxParMinute * 0.55; // ≈ 55% flux → admissions lits
  const ttgMinutes = occParMinute > 0 && litsDispos > 0
    ? Math.max(1, Math.round(litsDispos / occParMinute))
    : litsOccPct >= 0.95 ? 0 : 9999;
  const ttgStable = ttgMinutes >= 9999 || litsOccPct < 0.5;

  // --- #2) Prochain hôpital le plus proche de saturation ---
  let nextSat: SituationalForecasts["nextSat"] | undefined;
  if (hospitals.length) {
    const ranked = hospitals
      .filter((h) => h.lits > 0)
      .map((h) => {
        const occ = h.occ / h.lits;
        const alreadySat = occ >= 0.95;
        // Tendance simple (proxy: aggravation + sévérité régionale)
        const deltaPerMin = alreadySat
          ? 0
          : Math.max(0, (0.0005 + (worstOccPct > 0.7 ? 0.0008 : 0)));
        const minutesUntilSat = alreadySat ? 0 : Math.max(0, Math.round((0.95 - occ) / Math.max(0.00001, deltaPerMin)));
        // Score proximité sat
        const score = alreadySat ? 1_000_000 + minutesUntilSat : occ * 1_000_000 - minutesUntilSat;
        return { h, occ, alreadySat, minutesUntilSat, score };
      })
      .filter((x) => Number.isFinite(x.occ))
      .sort((a, b) => b.score - a.score);
    const top = ranked[0];
    if (top) {
      nextSat = {
        id: top.h.id,
        nom: top.h.nom,
        ville: top.h.ville,
        occPctNow: clamp01(top.occ),
        minutesUntilSat: Math.min(top.minutesUntilSat, 60 * 48),
        alreadySat: top.alreadySat,
      };
    }
  }

  // --- #3) Besoin HMC prédictif 6h ---
  const flux6hRaw = Math.round(flux24h / 4); // 25% flux 24h sur 6h
  const admissions6h = Math.round(flux6hRaw * 0.55);
  const manque6h = Math.max(0, admissions6h - litsDispos * 0.35); // utilise 35% des dispos dans 6h
  const litsParHMC = 30; // taille moyenne HMC Maroc
  const besoinNbre = manque6h > 0 ? Math.max(1, Math.ceil(manque6h / litsParHMC)) : 0;
  const besoinHMC: SituationalForecasts["besoinHMC"] = besoinNbre > 0
    ? { nombre: besoinNbre, litsParHMC, litsTotal: besoinNbre * litsParHMC }
    : { nombre: 0, litsParHMC, litsTotal: 0 };

  // --- #4) Redirection possible ---
  const redirCandidates = hospitals.filter((h) => h.lits > 0 && (h.occ / h.lits) <= 0.7 && (h.lits - h.occ) >= 5);
  const redirection: SituationalForecasts["redirection"] = {
    nHopitaux: redirCandidates.length,
    litsRedirigeables: redirCandidates.reduce((s, h) => s + (h.lits - h.occ), 0),
  };

  // --- #5) Flux 6h prédit ---
  const s1 = evoBase.length >= 2 ? evoBase.slice(-2).reduce((a, b) => a + (b.opened ?? 0), 0) : 0;
  const s2 = evoBase.length >= 4 ? evoBase.slice(-4, -2).reduce((a, b) => a + (b.opened ?? 0), 0) : 0;
  const ratio = s2 > 0 ? s1 / s2 : 1;
  const tendanceFlux: SituationalForecasts["flux6h"]["tendance"] =
    ratio >= 1.2 ? L.flow_trend_up : ratio <= 0.8 ? L.flow_trend_down : L.flow_trend_stable;
  const flux6h: SituationalForecasts["flux6h"] = {
    total: Math.max(0, flux6hRaw),
    picDansMinutes: openHigh > 0 ? 30 : ratio >= 1.2 ? 75 : 140, // heure pic prédite
    tendance: tendanceFlux,
  };

  // --- #6) Stock critique (basé sur l'inventaire réel catalog.equipment) ---
  type EquipRupture = { id: string; desig: string; cat: string; cond: EquipItem["cond"]; delta: number; ratio: number };
  const rupturesReelles: EquipRupture[] = equipment
    .map((e) => {
      const delta = Number.isFinite(e.threshold) && Number.isFinite(e.stock) ? e.stock - e.threshold : 0;
      const ratio = e.threshold > 0 ? e.stock / e.threshold : (e.stock > 0 ? 1 : 0);
      const estRupture = (Number.isFinite(e.stock) && Number.isFinite(e.threshold) && e.stock < e.threshold) || e.cond === "oos";
      return estRupture ? { id: e.id, desig: e.desig, cat: e.cat, cond: e.cond, delta, ratio } : null;
    })
    .filter(Boolean) as EquipRupture[];
  const nRuptures = rupturesReelles.length;
  const oosCount = rupturesReelles.filter((r) => r.cond === "oos").length;
  const stockNiveauBase: SituationalForecasts["stockCritique"]["niveau"] =
    nRuptures >= 6 || oosCount >= 2 ? "alerte" :
    nRuptures >= 3 || oosCount >= 1 ? "attention" :
    nRuptures >= 1 ? "attention" : "ok";
  const stockBySeverity = rupturesReelles
    .slice()
    .sort((a, b) => {
      const aBad = a.cond === "oos" ? 0 : 1;
      const bBad = b.cond === "oos" ? 0 : 1;
      if (aBad !== bBad) return aBad - bBad;
      if (a.ratio !== b.ratio) return a.ratio - b.ratio;
      return a.delta - b.delta;
    })
    .slice(0, 4);
  const stockRuptures: string[] = stockBySeverity.length
    ? stockBySeverity.map((r) => {
        const suffix = r.cond === "oos" ? " · HS" : r.cond === "repair" ? " · réparation" : "";
        return `${r.desig}${suffix}`;
      })
    : [];
  const stockCtxFlag = (nextSat?.alreadySat || (nextSat?.minutesUntilSat ?? 9999) < 30 || openHigh >= 2);
  const stockNiveau: SituationalForecasts["stockCritique"]["niveau"] =
    stockNiveauBase === "alerte" ? "alerte" :
    stockCtxFlag && (stockNiveauBase === "attention" || stockNiveauBase === "ok" && nRuptures >= 1) ? "attention" :
    stockNiveauBase;
  const stockCritique: SituationalForecasts["stockCritique"] = {
    niveau: stockNiveau,
    ruptures: stockRuptures,
    meta: rupturesReelles.length
      ? { nRuptures, nHorsService: oosCount, nSousSeuil: Math.max(0, nRuptures - oosCount) }
      : undefined,
  };

  const predictions: SituationalForecasts = {
    ttgMinutes: ttgStable ? 9999 : Math.min(ttgMinutes, 60 * 72),
    ttgStable,
    nextSat,
    besoinHMC,
    redirection,
    flux6h,
    stockCritique,
  };
  // ---------- FIN PRÉDICTIONS EXCLUSIVES ----------

  // Points chauds (régions × concentration)
  const byRegion = new Map<string, Incident[]>();
  for (const i of openInc) {
    const r = i.region?.trim() || "Région inconnue";
    if (!byRegion.has(r)) byRegion.set(r, []);
    byRegion.get(r)!.push(i);
  }
  const pointsChauds: Hotspot[] = [...byRegion.entries()]
    .map(([region, list]) => {
      const nHigh = list.filter((i) => i.sev === "high").length;
      const nMed = list.filter((i) => i.sev === "medium").length;
      const poids = clamp01((nHigh * 1 + nMed * 0.4) / 4);
      const top1 = list.reduce<Incident>((acc, cur) => {
        const w = (x: Incident) => (x.sev === "high" ? 3 : x.sev === "medium" ? 1.2 : 0.5);
        return w(cur) > w(acc) ? cur : acc;
      }, list[0]);
      const sev: "high" | "medium" | "low" = nHigh > 0 ? "high" : nMed > 0 ? "medium" : "low";
      return {
        id: `hs-${encodeURIComponent(region)}-${time}`,
        label: `${region} · ${list.length} incident(s)`,
        region,
        typeInc: top1.type,
        sev,
        ll: top1.ll,
        poids,
        nIncidents: list.length,
      };
    })
    .sort((a, b) => b.poids - a.poids)
    .slice(0, 5);

  // Facteurs critiques
  const facteursCritiques: CriticalFactor[] = [];
  if (worstOccPct >= 0.8) {
    const worstH = hospitals.reduce<Hospital | null>((acc, h) => {
      const occ = h.lits > 0 ? h.occ / h.lits : 0;
      const a = acc && acc.lits > 0 ? acc.occ / acc.lits : 0;
      return occ > a ? h : acc;
    }, null);
    facteursCritiques.push({
      id: `fc-hs-sat-${time}`,
      label: worstH
        ? tpl(L.fc_hospital_saturation_full, { nom: worstH.nom, ville: worstH.ville ?? "" })
        : L.fc_hospital_saturation_critical,
      type: "saturation",
      impact: "haut",
      value: `${Math.round(worstOccPct * 100)}%`,
      linkedHospitalIds: worstH ? [worstH.id] : undefined,
    });
  } else if (worstOccPct >= 0.65) {
    facteursCritiques.push({
      id: `fc-hs-ten-${time}`,
      label: L.fc_hospital_tension,
      type: "saturation",
      impact: "moyen",
      value: `${Math.round(worstOccPct * 100)}%`,
    });
  }
  if (openHigh >= 2) {
    facteursCritiques.push({
      id: `fc-inc-h-${time}`,
      label: tpl(L.fc_simultaneous_high_incidents, { n: openHigh }),
      type: "evenement",
      impact: "haut",
      value: `${openHigh}`,
    });
  } else if (openHigh === 1) {
    facteursCritiques.push({
      id: `fc-inc-h-${time}`,
      label: L.fc_one_high_incident,
      type: "evenement",
      impact: "moyen",
    });
  }
  if (readinessAvg < 0.5 && units.length > 0) {
    facteursCritiques.push({
      id: `fc-read-${time}`,
      label: L.fc_unit_readiness_low,
      type: "capacite",
      impact: readinessAvg < 0.3 ? "haut" : "moyen",
      value: `${Math.round(readinessAvg * 100)}%`,
    });
  }
  const evo = dashStats?.evolution ?? [];
  if (evo.length >= 4) {
    const s1 = evo.slice(-2).reduce<number>((a, b) => a + (b.opened ?? 0), 0);
    const s2 = evo.slice(-4, -2).reduce<number>((a, b) => a + (b.opened ?? 0), 0) || 1;
    if (s1 / s2 > 1.2) {
      facteursCritiques.push({
        id: `fc-evo-${time}`,
        label: tpl(L.fc_rapid_deterioration, { durée: "48h" }),
        type: "evenement",
        impact: "haut",
        value: `+${Math.round((s1 / s2 - 1) * 100)}%`,
      });
    } else if (s1 / s2 < 0.85) {
      facteursCritiques.push({
        id: `fc-evo-${time}`,
        label: L.fc_notable_improvement,
        type: "evenement",
        impact: "faible",
      });
    }
  }
  if (facteursCritiques.length === 0) {
    facteursCritiques.push({
      id: `fc-neutre-${time}`,
      label: L.fc_situation_controlled,
      type: "evenement",
      impact: "faible",
    });
  }

  // Risques prochaines
  const risquesProchaines: NextRisk[] = [];
  const worstHosp = hospitals.reduce<Hospital | null>((acc, h) => {
    const occ = h.lits > 0 ? h.occ / h.lits : 0;
    const a = acc && acc.lits ? acc.occ / acc.lits : 0;
    return occ > a ? h : acc;
  }, null);
  if (worstOccPct >= 0.65 && worstHosp) {
    risquesProchaines.push({
      horizon: "2h",
      type: L.rt_hospital_saturation,
      niveau: worstOccPct >= 0.85 ? "critique" : "eleve",
      probabilitePct: Math.round(45 + worstOccPct * 40),
      zone: `${worstHosp.ville || L.zone_hospital_network}`,
    });
  }
  const earth = openInc.find((i) => i.type === "earthquake" && i.sev === "high");
  if (earth) {
    risquesProchaines.push({
      horizon: "6h",
      type: L.rt_seismic_aftershocks,
      niveau: openHigh >= 2 ? "critique" : "eleve",
      probabilitePct: 68,
      zone: earth.region || L.zone_epicentral,
    });
  }
  if (pointsChauds[0] && pointsChauds[0].poids >= 0.55) {
    risquesProchaines.push({
      horizon: "24h",
      type: L.rt_critical_zone_degradation,
      niveau: pointsChauds[0].sev === "high" ? "eleve" : "modere",
      probabilitePct: Math.round(50 + pointsChauds[0].poids * 35),
      zone: pointsChauds[0].region,
    });
  }
  for (const h of ["2h", "6h", "24h"] as const) {
    if (risquesProchaines.find((r) => r.horizon === h)) continue;
    risquesProchaines.push({
      horizon: h,
      type: L.rt_situation_stable,
      niveau: "faible",
      probabilitePct: 20,
      zone: L.zone_national,
    });
  }

  // Synthèse courte
  const synVars = {
    openInc: String(openInc.length),
    openHigh: String(openHigh),
    satPct: String(Math.round(worstOccPct * 100)),
    region: pointsChauds[0]?.region?.trim() || L.zone_national,
  };
  const syntheseRaw =
    niveauGlobal === "alerte_rouge"
      ? tpl(L.syn_alerte_rouge, synVars)
      : niveauGlobal === "vigilance"
      ? tpl(L.syn_vigilance, synVars)
      : niveauGlobal === "surveillance"
      ? tpl(L.syn_surveillance, synVars)
      : tpl(L.syn_calme, synVars);
  const synthese = syntheseRaw.slice(0, 200);

  return {
    niveauGlobal,
    scoreGlobal,
    synthese,
    totalIncidents: openInc.length,
    pointsChauds: pointsChauds.slice(0, 5),
    facteursCritiques: facteursCritiques.slice(0, 6),
    predictions,
    risquesProchaines: risquesProchaines.slice(0, 3),
    generatedAt: time,
    fromAI: false,
    ...({ _debugLitsTot: litsTot, _debugLitsOcc: litsOcc } as const),
  };
}

// ============================================================
// 2) INFERENCE LLM + sanitize (fallback garanti si LLM échoue)
// ============================================================
function buildSystemSitAware(lang: Lang, L: SituationalLabels): string {
  const tFb = `"${L.flow_trend_stable}" | "${L.flow_trend_up}" | "${L.flow_trend_down}"`;
  if (lang === "en") {
    return `You are the SITUATIONAL AWARENESS AI MODEL of IRIS (FAR, Morocco).

🎯 Return ONLY a valid JSON object (no text, no markdown):
{
  "niveauGlobal": "calme" | "surveillance" | "vigilance" | "alerte_rouge",
  "scoreGlobal": 0..100,
  "synthese": "1 SENTENCE ≤ 180 chars. Short, actionable style.",
  "pointsChauds": [ { "region","label","typeInc","sev":"high|medium|low","ll":[lng,lat],"poids":0..1,"nIncidents":N } ] (3..5),
  "facteursCritiques": [ { "label", "type":"capacite|saturation|blocage|evenement|materiel", "impact":"haut|moyen|faible", "value"?:string|number } ] (4..6),
  "predictions": {
     "ttgMinutes": number (minutes until global saturation, 9999 if stable),
     "ttgStable": boolean,
     "nextSat": null or { "nom": string, "ville"?: string, "occPctNow": 0..1, "minutesUntilSat": integer, "alreadySat": bool },
     "besoinHMC": null or { "nombre": integer, "litsParHMC": integer, "litsTotal": integer },
     "redirection": { "nHopitaux": integer, "litsRedirigeables": integer },
     "flux6h": { "total": integer, "picDansMinutes": integer, "tendance": ${tFb} },
     "stockCritique": { "niveau": "ok" | "attention" | "alerte", "ruptures": ["O- Group", "Morphine", ...] }
  },
  "risquesProchaines": [ { "horizon":"2h|6h|24h", "type", "niveau":"faible|modere|eleve|critique", "probabilitePct":0..100, "zone" } ] (3 — distinct horizons)
}

RULES:
- NO INVENTION. All figures 100% from context data.
- predictions = DO NOT COPY raw capacities (staff / available beds). These 6 indicators MUST BE PREDICTIVE: time / next saturation / HMC need / redirection / 6h flow / stocks.
- Synthesis = QUOTE level + open/critical incident count + 1 critical point.
- If insufficient data: use zeros / realistic values (never null).
- Write ENTIRELY in English. Every textual field (synthese, labels, types, zones, ruptures list) must be in English; proper nouns stay as provided.`;
  }
  if (lang === "ar") {
    return `أنت النموذج الذكي للوعي الظرفي لمنصة إيريس (IRIS) (القوات المسلحة الملكية، المغرب).

🎯 أرجع فقط كائن JSON صالح (لا نصوص، لا markdown):
{
  "niveauGlobal": "calme" | "surveillance" | "vigilance" | "alerte_rouge",
  "scoreGlobal": 0..100,
  "synthese": "جملة واحدة ≤ 180 حرفاً. أسلوب مختصر وقابل للتنفيذ.",
  "pointsChauds": [ { "region","label","typeInc","sev":"high|medium|low","ll":[lng,lat],"poids":0..1,"nIncidents":N } ] (3..5),
  "facteursCritiques": [ { "label", "type":"capacite|saturation|blocage|evenement|materiel", "impact":"haut|moyen|faible", "value"?:string|number } ] (4..6),
  "predictions": {
     "ttgMinutes": رقم (دقائق حتى التشبع العام، 9999 إذا كان مستقراً),
     "ttgStable": منطقي,
     "nextSat": null أو { "nom": نصي, "ville"?: نصي, "occPctNow": 0..1, "minutesUntilSat": صحيح, "alreadySat": منطقي },
     "besoinHMC": null أو { "nombre": صحيح, "litsParHMC": صحيح, "litsTotal": صحيح },
     "redirection": { "nHopitaux": صحيح, "litsRedirigeables": صحيح },
     "flux6h": { "total": صحيح, "picDansMinutes": صحيح, "tendance": ${tFb} },
     "stockCritique": { "niveau": "ok" | "attention" | "alerte", "ruptures": ["فصيلة O-", "مورفين", ...] }
  },
  "risquesProchaines": [ { "horizon":"2h|6h|24h", "type", "niveau":"faible|modere|eleve|critique", "probabilitePct":0..100, "zone" } ] (3 — آفاق متميزة)
}

قواعد:
- لا اختراع أبداً. جميع الأرقام 100% من بيانات السياق.
- predictions = لا تنسخ القدرات الخامة (الموظفون / الأسرّة المتاحة). هذه المؤشرات الستة يجب أن تكون تنبؤية: الوقت / التشبع القادم / الحاجة إلى مستشفى متنقل / إعادة التوجيه / تدفق 6 ساعات / المخزون.
- الملخص = اذكر المستوى + عدد الحوادث المفتوحة/الحرجة + نقطة حرجة واحدة.
- إذا كانت البيانات غير كافية: استخدم أصفاراً / قيم واقعية (لا أبداً null).
- اكتب باللغة العربية بالكامل. كل حقل نصي (synthese, labels, types, zones, ruptures list) يجب أن يكون بالعربية؛ الأسماء الخاصة تبقى كما هي مكتوبة.`;
  }
  // fr — default, retrocompat strict
  return `Tu es le MODÈLE IA DE CONSCIENCE SITUATIONNELLE d'IRIS (FAR, Maroc).

🎯 Retourne UNIQUEMENT un objet JSON valide (pas de texte, pas de markdown) :
{
  "niveauGlobal": "calme" | "surveillance" | "vigilance" | "alerte_rouge",
  "scoreGlobal": 0..100,
  "synthese": "1 PHRASE ≤ 180 car. Style court, actionnable.",
  "pointsChauds": [ { "region","label","typeInc","sev":"high|medium|low","ll":[lng,lat],"poids":0..1,"nIncidents":N } ] (3..5),
  "facteursCritiques": [ { "label", "type":"capacite|saturation|blocage|evenement|materiel", "impact":"haut|moyen|faible", "value"?:string|number } ] (4..6),
  "predictions": {
     "ttgMinutes": nombre (minutes avant saturation globale, 9999 si stable),
     "ttgStable": booléen,
     "nextSat": null ou { "nom": string, "ville"?: string, "occPctNow": 0..1, "minutesUntilSat": entier, "alreadySat": bool },
     "besoinHMC": null ou { "nombre": entier, "litsParHMC": entier, "litsTotal": entier },
     "redirection": { "nHopitaux": entier, "litsRedirigeables": entier },
     "flux6h": { "total": entier, "picDansMinutes": entier, "tendance": ${tFb} },
     "stockCritique": { "niveau": "ok" | "attention" | "alerte", "ruptures": ["Groupe O-", "Morphine", ...] }
  },
  "risquesProchaines": [ { "horizon":"2h|6h|24h", "type", "niveau":"faible|modere|eleve|critique", "probabilitePct":0..100, "zone" } ] (3 — horizons distincts)
}

RÈGLES :
- AUCUNE INVENTION. Tous chiffres 100% données du contexte.
- predictions = NE PAS RECOPIER les capacités brutes (personnel / lits dispos). Ces 6 indicateurs DOIVENT ETRE PREDICTIFS : temps / prochaine saturation / besoin HMC / redirection / flux 6h / stocks.
- Synthèse = CITER niveau + nb incidents ouvert/critique + 1 point critique.
- Si données insuffisantes : utiliser zéros / valeurs réalistes (jamais null).`;
}

function buildCtx(inp: { incidents: Incident[]; hospitals: Hospital[]; units: Unit[]; dashStats: DashStats | null; now?: number }) {
  const incs = inp.incidents.slice(0, 20).map((i) => ({
    id: i.id, titre: i.titre.slice(0, 70), type: i.type, sev: i.sev, st: i.st, region: i.region,
    adresse: i.adresse?.slice(0, 50) ?? null, ll: i.ll, time: i.time,
    casualties: i.casualties ?? null, subN: i.subIncidents?.length ?? 0,
  }));
  const hos = inp.hospitals.slice(0, 16).map((h) => ({
    id: h.id, nom: h.nom, ville: h.ville, kind: h.kind, lits: h.lits, occ: h.occ,
    satPct: h.lits ? Math.round((100 * h.occ) / h.lits) : 0, rea: h.rea ?? 0, reaOcc: h.reaOcc ?? 0, staff: h.staff ?? 0, ll: h.ll,
  }));
  const uns = inp.units.slice(0, 12).map((u) => ({
    id: u.id, nom: u.nom, ville: u.ville, dispo: u.dispo, readiness: u.readiness, staff: u.eff ?? 0,
  }));
  const ds = inp.dashStats
    ? { severity: inp.dashStats.severity, status: inp.dashStats.status, casualties: inp.dashStats.casualties ?? null,
        evolution: inp.dashStats.evolution?.slice(-12) ?? null, units: inp.dashStats.units ?? null }
    : null;
  return JSON.stringify({ incidents: incs, hospitals: hos, units: uns, dashStats: ds, now: new Date(inp.now ?? Date.now()).toISOString() });
}

function extractJson(text: string): unknown | null {
  const t = text.trim(); if (!t) return null;
  if (t.startsWith("{")) { try { return JSON.parse(t); } catch { /* next */ } }
  const m = t.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (m?.[1]) { try { return JSON.parse(m[1].trim()); } catch { /* last */ } }
  const o = t.indexOf("{"); const c = t.lastIndexOf("}");
  if (o >= 0 && c > o) { try { return JSON.parse(t.slice(o, c + 1)); } catch { /* noop */ } }
  return null;
}

function sanitizeSA(raw: unknown, fallback: SituationalAwareness): SituationalAwareness {
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Record<string, unknown>;
  const niveauGlobal = pickLL(r.niveauGlobal, ["calme", "surveillance", "vigilance", "alerte_rouge"] as const) ?? fallback.niveauGlobal;
  const scoreGlobal = Math.max(0, Math.min(100, Math.round(numOr(r.scoreGlobal, fallback.scoreGlobal))));
  const syntheseRaw = typeof r.synthese === "string" ? r.synthese : fallback.synthese;
  const synthese = syntheseRaw.slice(0, 200) || fallback.synthese;

  const pointsChauds: Hotspot[] = Array.isArray(r.pointsChauds)
    ? (r.pointsChauds as unknown[])
        .map((h) => {
          const o = h as Record<string, unknown> | null;
          if (!o || typeof o !== "object") return null;
          const region = typeof o.region === "string" ? o.region.slice(0, 60) : null;
          if (!region) return null;
          const label = typeof o.label === "string" ? o.label.slice(0, 100) : `${region} · incidents`;
          const typeInc = typeof o.typeInc === "string" ? o.typeInc.slice(0, 40) : "incident";
          const sev = pickLL(o.sev, ["high", "medium", "low"] as const) ?? "medium";
          const poids = clamp01(numOr(o.poids, 0.5));
          const llValid = Array.isArray(o.ll) && o.ll.length === 2 && o.ll.every((n) => typeof n === "number");
          const ll = llValid ? (o.ll as [number, number]) : fallback.pointsChauds[0]?.ll ?? [-7.5, 31.8];
          const nIncidents = Math.max(0, Math.round(numOr(o.nIncidents, 1)));
          return {
            id: `pc-${encodeURIComponent(region)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            label, region, typeInc, sev, ll, poids, nIncidents,
          } as Hotspot;
        })
        .filter(Boolean) as Hotspot[]
    : fallback.pointsChauds;

  const facteursCritiques: CriticalFactor[] = Array.isArray(r.facteursCritiques)
    ? (r.facteursCritiques as unknown[])
        .map((f, idx) => {
          const o = f as Record<string, unknown> | null;
          if (!o || typeof o !== "object") return null;
          const label = typeof o.label === "string" ? o.label.slice(0, 120) : null;
          if (!label) return null;
          const type = pickLL(o.type, ["capacite", "saturation", "blocage", "evenement", "materiel"] as const) ?? "evenement";
          const impact = pickLL(o.impact, ["haut", "moyen", "faible"] as const) ?? "moyen";
          const value = o.value !== undefined ? (o.value as string | number) : undefined;
          return { id: `fc-${idx}-${Date.now()}`, label, type, impact, value } as CriticalFactor;
        })
        .filter(Boolean) as CriticalFactor[]
    : fallback.facteursCritiques;

  const pp = r.predictions && typeof r.predictions === "object" ? (r.predictions as Record<string, unknown>) : null;
  const pnum = (k: string, d: number) => Math.max(0, Math.round(numOr(pp?.[k], d)));
  const predictions: SituationalForecasts = pp
    ? {
        ttgMinutes: pnum("ttgMinutes", fallback.predictions.ttgMinutes),
        ttgStable: typeof pp.ttgStable === "boolean" ? pp.ttgStable : fallback.predictions.ttgStable,
        nextSat: (() => {
          const o = pp.nextSat && typeof pp.nextSat === "object" ? (pp.nextSat as Record<string, unknown>) : null;
          if (!o || typeof o.nom !== "string") return fallback.predictions.nextSat;
          const nom = o.nom.slice(0, 80);
          const ville = typeof o.ville === "string" ? o.ville.slice(0, 40) : undefined;
          const occPctNow = clamp01(numOr(o.occPctNow, fallback.predictions.nextSat?.occPctNow ?? 0));
          const minutesUntilSat = Math.max(0, Math.min(60 * 72, Math.round(numOr(o.minutesUntilSat, fallback.predictions.nextSat?.minutesUntilSat ?? 0))));
          const alreadySat = typeof o.alreadySat === "boolean" ? o.alreadySat : fallback.predictions.nextSat?.alreadySat ?? false;
          return { nom, ville, occPctNow, minutesUntilSat, alreadySat };
        })(),
        besoinHMC: (() => {
          const o = pp.besoinHMC && typeof pp.besoinHMC === "object" ? (pp.besoinHMC as Record<string, unknown>) : null;
          if (!o) return fallback.predictions.besoinHMC;
          const nombre = Math.max(0, Math.round(numOr(o.nombre, fallback.predictions.besoinHMC?.nombre ?? 0)));
          const litsParHMC = Math.max(1, Math.round(numOr(o.litsParHMC, fallback.predictions.besoinHMC?.litsParHMC ?? 30)));
          const litsTotal = Math.max(0, Math.round(numOr(o.litsTotal, nombre * litsParHMC)));
          return { nombre, litsParHMC, litsTotal };
        })(),
        redirection: (() => {
          const o = pp.redirection && typeof pp.redirection === "object" ? (pp.redirection as Record<string, unknown>) : null;
          const nHopitaux = Math.max(0, Math.round(numOr(o?.nHopitaux, fallback.predictions.redirection.nHopitaux)));
          const litsRedirigeables = Math.max(0, Math.round(numOr(o?.litsRedirigeables, fallback.predictions.redirection.litsRedirigeables)));
          return { nHopitaux, litsRedirigeables };
        })(),
        flux6h: (() => {
          const o = pp.flux6h && typeof pp.flux6h === "object" ? (pp.flux6h as Record<string, unknown>) : null;
          const total = Math.max(0, Math.round(numOr(o?.total, fallback.predictions.flux6h.total)));
          const picDansMinutes = Math.max(0, Math.min(60 * 12, Math.round(numOr(o?.picDansMinutes, fallback.predictions.flux6h.picDansMinutes))));
          const tendance = (typeof o?.tendance === "string" && (o.tendance as string).trim().length <= 40)
            ? (o.tendance as string).trim()
            : fallback.predictions.flux6h.tendance;
          return { total, picDansMinutes, tendance };
        })(),
        stockCritique: (() => {
          const o = pp.stockCritique && typeof pp.stockCritique === "object" ? (pp.stockCritique as Record<string, unknown>) : null;
          const niveau = pickLL(o?.niveau, ["ok", "attention", "alerte"] as const) ?? fallback.predictions.stockCritique.niveau;
          const ruptures = Array.isArray(o?.ruptures)
            ? (o!.ruptures as unknown[]).filter((x) => typeof x === "string").slice(0, 5).map((s) => String(s).slice(0, 40))
            : fallback.predictions.stockCritique.ruptures;
          type StockMeta = { nRuptures: number; nHorsService: number; nSousSeuil: number };
          const fb = fallback.predictions.stockCritique.meta as StockMeta | undefined;
          const fallbackMeta: StockMeta | undefined = fb
            ? {
                nRuptures: Number.isFinite(fb.nRuptures) ? fb.nRuptures : ruptures.length,
                nHorsService: Number.isFinite(fb.nHorsService) ? fb.nHorsService : 0,
                nSousSeuil: Number.isFinite(fb.nSousSeuil) ? fb.nSousSeuil : ruptures.length,
              }
            : undefined;
          const fallbackNRupt = fallbackMeta?.nRuptures ?? ruptures.length;
          const fallbackNHors = fallbackMeta?.nHorsService ?? 0;
          const fallbackNSous = fallbackMeta?.nSousSeuil ?? ruptures.length;
          const metaRaw = o?.meta && typeof o.meta === "object" ? (o.meta as Record<string, unknown>) : null;
          const meta: StockMeta | undefined = fallbackMeta ?? (
            metaRaw
              ? {
                  nRuptures: Math.max(0, Math.round(numOr((metaRaw as { nRuptures?: unknown }).nRuptures, fallbackNRupt))),
                  nHorsService: Math.max(0, Math.round(numOr((metaRaw as { nHorsService?: unknown }).nHorsService, fallbackNHors))),
                  nSousSeuil: Math.max(0, Math.round(numOr((metaRaw as { nSousSeuil?: unknown }).nSousSeuil, fallbackNSous))),
                }
              : undefined
          );
          return { niveau, ruptures, meta };
        })(),
      }
    : fallback.predictions;

  const risquesProchaines: NextRisk[] = Array.isArray(r.risquesProchaines)
    ? (r.risquesProchaines as unknown[])
        .map((nr, i) => {
          const o = nr as Record<string, unknown> | null;
          if (!o || typeof o !== "object") return null;
          const horizonArr = ["2h", "6h", "24h"] as const;
          const horizon = pickLL(o.horizon, horizonArr) ?? horizonArr[i % 3];
          const type = typeof o.type === "string" ? o.type.slice(0, 80) : "Risque opérationnel";
          const niveau = pickLL(o.niveau, ["faible", "modere", "eleve", "critique"] as const) ?? "modere";
          const probabilitePct = Math.max(0, Math.min(100, Math.round(numOr(o.probabilitePct, 40))));
          const zone = typeof o.zone === "string" ? o.zone.slice(0, 80) : "National";
          return { horizon, type, niveau, probabilitePct, zone } as NextRisk;
        })
        .filter(Boolean) as NextRisk[]
    : fallback.risquesProchaines;

  return {
    niveauGlobal,
    scoreGlobal,
    synthese,
    totalIncidents: fallback.totalIncidents,
    pointsChauds: pointsChauds.slice(0, 5),
    facteursCritiques: facteursCritiques.slice(0, 6),
    predictions,
    risquesProchaines: risquesProchaines.slice(0, 3),
    generatedAt: Date.now(),
    fromAI: true,
    // Si le LLM renvoie pas explicitement ces meta → on les hérite du fallback pour que l'UI affiche les chiffres Réseau stable en clair
    _debugLitsTot: numOr((r as Record<string, unknown>)._debugLitsTot, fallback._debugLitsTot ?? 0),
    _debugLitsOcc: numOr((r as Record<string, unknown>)._debugLitsOcc, fallback._debugLitsOcc ?? 0),
  };
}

export async function computeSituationalAwarenessAI(
  input: { incidents: Incident[]; hospitals: Hospital[]; units: Unit[]; dashStats: DashStats | null; equipment?: EquipItem[]; now?: number },
  cfg: LlmProviderConfig,
  /** Permet d'INTERROMPRE le calcul quand une question d'opérateur arrive. */
  signal: AbortSignal | undefined,
  labels?: Partial<SituationalLabels>,
  lang: Lang = "fr",
): Promise<{ data: SituationalAwareness; error?: string; model: string; aborted?: boolean }> {
  const L = mergeSituationalLabels(labels);
  const fallback = computeSituationalAwarenessFallback(input, L);
  try {
    const usermsg = lang === "fr"
      ? `## CONTEXTE RÉEL IRIS (100% réel)\n${buildCtx(input)}\n\n## CONSIGNE\nRetourne UNIQUEMENT l'objet JSON SituationalAwareness valide.`
      : lang === "en"
      ? `## REAL IRIS CONTEXT (100% factual)\n${buildCtx(input)}\n\n## INSTRUCTION\nReturn ONLY the valid SituationalAwareness JSON object.`
      : `## سياق إيريس الحقيقي (100٪ واقعي)\n${buildCtx(input)}\n\n## تعليمات\nأرجع فقط كائن JSON SituationalAwareness الصالح.`;
    const sysPrompt = buildSystemSitAware(lang, L);
    const res = await chatComplete(cfg, [
      { role: "system", content: sysPrompt },
      { role: "user", content: usermsg },
    ], { signal });
    if (res.aborted) return { data: fallback, error: "annulé", model: cfg.model, aborted: true };
    if (!res.ok || !res.text) return { data: fallback, error: res.error ?? "LLM vide", model: cfg.model };
    const raw = extractJson(res.text);
    const data = sanitizeSA(raw, fallback);
    return { data: { ...data, modelName: cfg.model }, model: cfg.model };
  } catch (e) {
    return { data: fallback, error: e instanceof Error ? e.message : "err inconnu", model: cfg.model };
  }
}
