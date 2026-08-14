// ============================================================================
// ARGOS · Module IA Prédiction Risques — INFÉRENCE MODÈLE IA (LLM OLLAMA LOCAL)
// ----------------------------------------------------------------------------
// Invoque le modèle IA local (Ollama / vLLM) pour générer des prédictions
// structurées RiskPrediction[] (JSON strictement schématisé).
//
// RÈGLES FONDAMENTALES (non négociables):
//  1) AUCUNE invention de données : chaque prédiction/IDs DOIT exister dans
//     le contexte (incidents, hospitals, units) passé en prompt.
//  2) Le prompt force un ARRAY JSON valide, RIEN d'autre (pas markdown,
//     pas ```, pas de texte hors JSON).
//  3) SCHEMA VALIDATION post-inférence : toute entrée invalide est supprimée.
//  4) Si 0 prédictions valides OU Ollama injoignable → FALLBACK vers le
//     moteur déterministe computeRiskPredictions (100% réel, pas d'invention).
// ============================================================================
import type { LlmProviderConfig } from "@/lib/ai/config";
import { chatComplete } from "@/lib/ai/provider";
import type { Hospital, Incident } from "@/lib/types";
import type { RiskContext, RiskDataSource, RiskFactor, RiskHorizon, RiskLevel, RiskPrediction, RiskTrend } from "./types";
import { computeRiskPredictions, scoreToLevel, scoreToHorizon } from "./engine";

function norm_(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const RISK_LEVELS: RiskLevel[] = ["faible", "modere", "eleve", "critique"];
const RISK_HORIZONS: RiskHorizon[] = ["2h", "6h", "24h", "48h"];
const KINDS: RiskPrediction["kind"][] = ["zone", "hopital", "corridor", "incident.courant"];
const TRENDS: RiskTrend[] = ["aggravation", "stable", "amelioration"];

/** Vérifie qu'un entier/number est bien dans [min,max] (bornes incluses). */
function inRange(n: unknown, min: number, max: number): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
}
function pickLL<T extends string>(v: unknown, allow: readonly T[]): T | null {
  if (typeof v !== "string") return null;
  return (allow as unknown as string[]).includes(v) ? (v as T) : null;
}

/**
 * Transforme un objet brut (LLM JSON) en RiskPrediction VALIDE, ou renvoie
 * null s'il est hors schéma ou référence des IDs absents du contexte (anti-invention).
 */
function sanitizePrediction(
  raw: unknown,
  ctx: RiskContext,
  now: number,
  origin: "deterministic" | "ai_model",
  modelName?: string,
): RiskPrediction | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  // Champs obligatoires (format opérateur exploitable direct)
  const kind = pickLL(r.kind, KINDS);
  if (!kind) return null;
  const label = typeof r.label === "string" && r.label.trim().length > 0 ? r.label.trim().slice(0, 120) : null;
  if (!label) return null;
  const level = pickLL(r.level, RISK_LEVELS) ?? (typeof r.level === "string" ? null : null);
  if (!level) return null;
  const scoreNum = typeof r.score === "string" ? Number(r.score) : (r.score as number);
  if (!inRange(scoreNum, 0, 100)) return null;
  const score = Math.round(scoreNum);
  const probaRaw = typeof r.probability === "string" ? Number(r.probability) : (r.probability as number);
  const probability = inRange(probaRaw, 0, 1) ? (probaRaw as number) : Math.max(0, Math.min(1, score / 100));
  const horizon = pickLL(r.horizon, RISK_HORIZONS);
  if (!horizon) return null;
  // --- CHAMPS OPÉRATEUR (rigueur moins stricte : si absents → inférence SMART depuis contexte) ---
  // riskType (type de risque humain: "Saturation hospitalière", "Inondation", "Aggravation séisme", etc.)
  let riskTypeRaw = typeof r.riskType === "string" ? r.riskType.trim().slice(0, 80) : "";
  // zoneLabel (zone concernée en clair)
  let zoneLabelRaw = typeof r.zoneLabel === "string" ? r.zoneLabel.trim().slice(0, 120) : "";
  // locationLabel (localisation précise optionnelle)
  const locationLabelRaw = typeof r.locationLabel === "string" ? r.locationLabel.trim().slice(0, 160) : undefined;
  // trend (aggravation / stable / amelioration)
  let trend = pickLL(r.trend, TRENDS);

  // Coordonnées optionnelles
  const ll: [number, number] | undefined =
    Array.isArray(r.ll) &&
    r.ll.length === 2 &&
    typeof r.ll[0] === "number" &&
    typeof r.ll[1] === "number" &&
    Number.isFinite(r.ll[0]) &&
    Number.isFinite(r.ll[1])
      ? [r.ll[0], r.ll[1]]
      : undefined;

  // IDs liés : on GARDE UNIQUEMENT les IDs EXISTANTS dans le contexte.
  // → Anti-invention : toute référence inventée est PUREMENT SUPPRIMÉE.
  const idsFromArr = (arr: unknown, existing: Set<string>): string[] | undefined => {
    if (!Array.isArray(arr)) return undefined;
    const out: string[] = [];
    for (const x of arr) if (typeof x === "string" && existing.has(x)) out.push(x);
    return out.length > 0 ? out : undefined;
  };
  const existingInc = new Set(ctx.incidents.map(i => i.id));
  const existingHos = new Set(ctx.hospitals.map(h => h.id));
  const existingUni = new Set(ctx.units.map(u => u.id));
  let linkedIncidentIds = idsFromArr(r.linkedIncidentIds, existingInc);
  let linkedHospitalIds = idsFromArr(r.linkedHospitalIds, existingHos);
  const linkedUnitIds = idsFromArr(r.linkedUnitIds, existingUni);

  // TOLÉRANCE LÉGITIME : si kind est "hopital"/"incident.courant" mais que le LLM n'a pas fourni linkedIds,
  // on INFÈRE depuis le libellé/coordonnées matchant les objets RÉELS du contexte.
  // (toujours 100% réel : on prend pas une décision inventée, on relie seulement ce qui existe).
  const normLabel = typeof r.label === "string" ? norm_(r.label) : "";
  if (kind === "hopital" && !linkedHospitalIds?.length) {
    let best: Hospital | undefined;
    let bestScore = 0;
    for (const h of ctx.hospitals) {
      const tok1 = normLabel.split(/[\s-]+/).filter(t => t.length >= 3);
      const tok2 = (norm_(h.nom) + " " + norm_(h.ville)).split(/[\s-]+/).filter(t => t.length >= 3);
      const int = tok1.filter(t => tok2.includes(t)).length;
      if (ll && h.ll) {
        const d = Math.hypot(h.ll[0] - ll[0], h.ll[1] - ll[1]);
        if (d < 0.25 && int >= 1 && 1 - d > bestScore) { best = h; bestScore = 1 - d; }
      }
      if (int > bestScore) { best = h; bestScore = int; }
    }
    if (best) linkedHospitalIds = [best.id];
  }
  if (kind === "incident.courant" && !linkedIncidentIds?.length) {
    let best: Incident | undefined;
    let bestScore = 0;
    for (const i of ctx.incidents) {
      const tok1 = normLabel.split(/[\s-]+/).filter(t => t.length >= 3);
      const tok2 = (norm_(i.titre) + " " + norm_(i.region ?? "") + " " + norm_(i.adresse ?? "")).split(/[\s-]+/).filter(t => t.length >= 3);
      const int = tok1.filter(t => tok2.includes(t)).length;
      if (ll && i.ll) {
        const d = Math.hypot(i.ll[0] - ll[0], i.ll[1] - ll[1]);
        if (d < 0.25 && int >= 1 && 1 - d > bestScore) { best = i; bestScore = 1 - d; }
      }
      if (int > bestScore) { best = i; bestScore = int; }
    }
    if (best) linkedIncidentIds = [best.id];
  }

  // Kind "hopital" doit pointer un hôpital réel, "incident.courant" un incident.
  if (kind === "hopital" && !linkedHospitalIds?.length) return null;
  if (kind === "incident.courant" && !linkedIncidentIds?.length) return null;

  // =====================================================================
  // INFÉRENCE SMART DES CHAMPS OPÉRATEUR (si LLM n'a pas fourni)
  // Règle stricte : ON NE FAIT PAS D'INVENTION, on dérive uniquement des objets réels liés.
  // =====================================================================
  // Objets liés pour l'inférence
  const linkedHos = linkedHospitalIds?.length ? ctx.hospitals.find(h => h.id === linkedHospitalIds[0]) : undefined;
  const linkedInc = linkedIncidentIds?.length ? ctx.incidents.find(i => i.id === linkedIncidentIds[0]) : undefined;

  // --- riskType : type de risque humain lisible (jamais inventé hors type incident connu / hopital sat) ---
  if (!riskTypeRaw) {
    if (kind === "hopital") {
      riskTypeRaw = score >= 70 ? "Saturation hospitalière" : "Tension hospitalière";
    } else if (kind === "incident.courant" && linkedInc) {
      // On utilise le type INCIDENT RÉEL pour déduire risque lisible (anti-invention 100%)
      const t: Record<string, string> = {
        earthquake: "Aggravation d'un séisme",
        flood: "Inondation",
        fire: "Incendie",
        road_accident: "Accident routier majeur",
        landslide: "Glissement de terrain",
        storm: "Tempête",
        explosion: "Explosion / incident industriel",
        building_collapse: "Affaissement d'immeuble",
        chemical: "Risque chimique / industriel",
        drought: "Sécheresse",
      };
      riskTypeRaw = t[linkedInc.type] ?? `${linkedInc.type[0].toUpperCase()}${linkedInc.type.slice(1).replace(/_/g, " ")}`;
    } else {
      // zone / corridor / incident.courant sans type → on infère depuis label / région
      const labelTokens = norm_(label).split(/\s+/).filter(x => x.length >= 4).join(" ");
      if (labelTokens.includes("inond") || labelTokens.includes("oued")) riskTypeRaw = "Inondation";
      else if (labelTokens.includes("feu") || labelTokens.includes("incendi") || labelTokens.includes("foret")) riskTypeRaw = "Incendie";
      else if (labelTokens.includes("seism") || labelTokens.includes("trembl") || labelTokens.includes("replique")) riskTypeRaw = "Aggravation d'un séisme";
      else if (labelTokens.includes("hospit") || labelTokens.includes("sat")) riskTypeRaw = "Saturation hospitalière";
      else riskTypeRaw = score >= 70 ? "Dégradation de situation" : "Surveillance opérationnelle";
    }
  }

  // --- zoneLabel : zone concernée (100% réelle, jamais inventée) ---
  if (!zoneLabelRaw) {
    if (linkedHos) zoneLabelRaw = `${linkedHos.ville ?? "Zone médicale"} · ${linkedHos.region ?? ""}`.replace(/\s·\s$/, "").trim() || linkedHos.ville || linkedHos.nom;
    else if (linkedInc) zoneLabelRaw = `${linkedInc.region ?? "Région non renseignée"}${linkedInc.adresse ? ` · ${linkedInc.adresse.slice(0, 60)}` : ""}`;
    else zoneLabelRaw = label.length <= 80 ? label : label.slice(0, 80);
  }
  const zoneLabel = zoneLabelRaw;
  const riskType = riskTypeRaw;
  const locationLabel = locationLabelRaw;

  // --- trend : aggravation / stable / amelioration ---
  if (!trend) {
    // Logique 100% déterministe (rien inventé) :
    // - score ≥ 65 OU level critique/élevé → aggravation
    // - score faible → amelioration
    // - sinon stable
    if (score >= 65 || level === "critique" || level === "eleve") trend = "aggravation";
    else if (score <= 30 && level === "faible") trend = "amelioration";
    else trend = "stable";
  }

  // Factors
  let factors: RiskFactor[] = [];
  if (Array.isArray(r.factors) && r.factors.length > 0) {
    for (const fRaw of r.factors as unknown[]) {
      if (!fRaw || typeof fRaw !== "object") continue;
      const f = fRaw as Record<string, unknown>;
      const flabel = typeof f.label === "string" && f.label.trim() ? f.label.trim().slice(0, 160) : null;
      if (!flabel) continue;
      const fweight = inRange(f.weight, 0, 1) ? (f.weight as number) : 0.1;
      // sources : si le LLM n'en a pas fourni, on en déduit selon kind.
      let srcs: RiskDataSource[] = Array.isArray(f.sources)
        ? (f.sources as unknown[]).filter((x): x is RiskDataSource => typeof x === "string")
        : [];
      if (srcs.length === 0) {
        srcs = kind === "hopital"
          ? ["hospitals.saturation", "hospitals.rea", "units.deploiement"]
          : kind === "incident.courant"
          ? ["incidents.actifs", "dashstats.casualties", "units.deploiement"]
          : kind === "corridor"
          ? ["geo.corridor", "hospitals.saturation", "incidents.actifs"]
          : ["geo.concentration", "dashstats.severity", "dashstats.status"];
      }
      factors.push({ label: flabel, weight: fweight, sources: srcs, rawValue: typeof f.rawValue === "string" || typeof f.rawValue === "number" ? f.rawValue : undefined });
    }
  }
  if (factors.length === 0) {
    factors.push({
      label: `Modèle IA · inférence sur ${horizon} · score ${score}/100`,
      weight: Math.max(0.05, Math.min(1, score / 150)),
      sources: kind === "hopital"
        ? ["hospitals.saturation", "hospitals.rea"]
        : kind === "incident.courant"
        ? ["incidents.actifs", "dashstats.casualties"]
        : ["geo.concentration", "incidents.actifs", "dashstats.severity"],
      rawValue: `model=${modelName ?? "llm"}`,
    });
  }

  // ID stable (inférence → on préfixe ai- pour distinguer du déterministe)
  const base =
    kind === "hopital" && linkedHospitalIds?.[0] ? `ai:${kind}:${linkedHospitalIds[0]}` :
    kind === "incident.courant" && linkedIncidentIds?.[0] ? `ai:${kind}:${linkedIncidentIds[0]}` :
    `ai:${kind}:${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32)}`;
  const id = `${base}-${now}`;

  // Sécurité ultime: si level fourni par LLM est bizarrement décorrélé du score,
  // on remplace par la déterministe score→level (évite score 10 level critique).
  const expectedLevel = scoreToLevel(score);
  const expectedHorizon = scoreToHorizon(score);
  const finalLevel =
    (level === "critique" && score < 55) ||
    (level === "faible" && score >= 60)
      ? expectedLevel
      : level;
  const finalHorizon =
    (horizon === "48h" && score >= 75) ||
    (horizon === "2h" && score <= 30)
      ? expectedHorizon
      : horizon;

  return {
    id,
    kind,
    label,
    riskType,
    zoneLabel,
    locationLabel,
    trend,
    ll,
    level: finalLevel,
    score,
    probability,
    horizon: finalHorizon,
    factors,
    linkedIncidentIds,
    linkedHospitalIds,
    linkedUnitIds,
    computedAt: now,
    validatedByHuman: false,
    dismissed: false,
    origin,
    aiModelName: modelName,
    aiGeneratedAt: origin === "ai_model" ? now : undefined,
  };
}

/** Système prompt ultra-strict mode JSON-seul + format OPÉRATEUR EXIGÉ. */
const RISK_AI_SYSTEM = `Tu es un moteur d'analyse de risques de la PLATEFORME ARGOS.

🎯 OBJECTIF OPÉRATEUR IMPÉRATIF : Produire des prédictions DIRECTEMENT EXPLOITABLES par un humain.
Chaque prédiction DOIT fournir LES 5 ÉLÉMENTS SUIVANTS en clair :
   1) riskType     = type de risque (exemples autorisés : Inondation · Incendie · Saturation hospitalière · Aggravation d'un séisme · Glissement de terrain · Tempête · Accident routier majeur · Explosion · Affaissement d'immeuble · Évacuation massive · Risque industriel · Sécheresse)
   2) zoneLabel    = zone géographique concernée (ville / province / région / corridor, 100% ISSUE DES DONNÉES DU CONTEXTE)
   3) level        = 🟢 Faible · 🟡 Modéré · 🟠 Élevé · 🔴 Critique  (valeurs enum)
   4) probability  (0..1)  +  horizon  ("2h" · "6h" · "24h" · "48h")
   5) factors[]    = 1 à 5 EXPLICATIONS COURTES (chacun ~3-12 mots) FRANÇAISES de POURQUOI ce risque existe.
        facteur label possible : "augmentation du nombre de blessés" / "hausse des évacuations sanitaires" /
        "diminution des lits disponibles" / "saturation élevée des établissements proches" /
        "répliques fréquentes" / "pluie intense sur zone" / "topographie à risque" /
        "état des routes dégradé" / "moyens limités sur secteur"  etc.

+ OPTIONNEL MAIS FORTEMENT RECOMMANDÉ :
   6) trend = aggravation | stable | amelioration    ←  ↗ En aggravation / → Stable / ↘ En amélioration
   7) locationLabel = localisation PLUS PRÉCISE que zoneLabel (ex: "Al Haouz · Commune d'Asni · RN9")

RÈGLES IMPÉRATIVES (non respect = réponse rejetée):
[R1] RÉPONSE UNIQUEMENT : un array JSON valide. RIEN d'autre. Pas de commentaire, pas de markdown, PAS de \`\`\`json, PAS de phrase d'introduction ou de conclusion.
[R2] SCHÉMA OBLIGATOIRE par prédiction :
  {
    "kind": "zone" | "hopital" | "corridor" | "incident.courant"   🔒
    "label": string   🔒 (libellé réel de l'entité)
    "riskType": string   🔒  ← TYPE DE RISQUE EXPLOITABLE PAR L'OPÉRATEUR (voir la liste 1)
    "zoneLabel": string  🔒   ← ZONE CONCERNÉE (100% données contexte)
    "locationLabel": string  ← optionnel mais recommandé (localisation précise)
    "trend": "aggravation" | "stable" | "amelioration"
    "level": "faible" | "modere" | "eleve" | "critique"   🔒
    "score": number 0..100   🔒   (100 = dégradation certaine)
    "probability": number 0..1  🔒
    "horizon": "2h" | "6h" | "24h" | "48h"   🔒
    "ll": [lng, lat] ou absent
    "factors": [                                                   🔒  AU MOINS 1 facteur.
       { "label": string, "weight": 0..1, "sources": string[], "rawValue": string|number|absent }
    ]
    "linkedIncidentIds": [ids INCIDENTS EXISTANTS DU CONTEXTE] OU []
    "linkedHospitalIds": [ids HÔPITAUX EXISTANTS] OU []
    "linkedUnitIds": [ids UNITÉS EXISTANTES] OU []
  }
[R3] AUCUNE INVENTION :
   → kind="hopital"            → linkedHospitalIds CONTIENT OBLIGATOIREMENT un id HOPITAL EXISTANT.
   → kind="incident.courant"   → linkedIncidentIds CONTIENT OBLIGATOIREMENT un id INCIDENT EXISTANT.
   → kind="zone" / "corridor"  → label ET zoneLabel = NOM VRAI DE VILLE/PROVINCE/RÉGION/CORRIDOR du contexte (incidents.region OU hospitals.ville).
   → TU NE CRÉES AUCUN nouvel incident, hôpital, ville, ou type de risque qui n'existerait PAS dans le contexte.
[R4] scores/probabilités DOIVENT ÊTRE JUSTIFIÉS par les facteurs labels.
[R5] Si tu ne peux estimer →  [] (array vide).

Bon courage.`;

/** Génère la partie données (contexte) du prompt user (token-safe, ~1800 tokens max). */
function buildUserContextPayload(ctx: RiskContext): string {
  const incs = ctx.incidents.slice(0, 16).map((i) => ({
    id: i.id,
    titre: i.titre.slice(0, 80),
    type: i.type,
    region: i.region,
    sev: i.sev,
    st: i.st,
    time: i.time,
    ll: i.ll,
    casualties: i.casualties ?? null,
    responders_units: i.responders?.units?.slice(0, 4) ?? [],
    responders_hospitals: i.responders?.hospitals?.slice(0, 4) ?? [],
    subIncidents: i.subIncidents?.length ?? 0,
  }));

  const hos = ctx.hospitals.slice(0, 12).map((h) => ({
    id: h.id,
    nom: h.nom,
    ville: h.ville,
    kind: h.kind ?? "civ",
    lits: h.lits,
    occ: h.occ,
    occPct: Math.round(100 * Math.min(1, h.lits > 0 ? h.occ / h.lits : 0)),
    rea: h.rea,
    reaOcc: h.reaOcc,
    reaPct: Math.round(100 * Math.min(1, h.rea > 0 ? h.reaOcc / h.rea : 0)),
    staff: h.staff,
    ll: h.ll,
  }));

  const uns = ctx.units.slice(0, 10).map((u) => ({
    id: u.id,
    nom: u.nom,
    ville: u.ville,
    dispo: u.dispo,
    readiness: u.readiness,
    ll: u.ll,
  }));

  const evo = (ctx.dashStats?.evolution ?? []).slice(-10);
  const stats = ctx.dashStats
    ? {
        evolution: evo,
        severity: ctx.dashStats.severity,
        status: ctx.dashStats.status,
        casualties: ctx.dashStats.casualties ?? null,
      }
    : null;

  return JSON.stringify({
    incidents: incs,
    hospitals: hos,
    units: uns,
    dashStats: stats,
    now: new Date(ctx.now ?? Date.now()).toISOString(),
  });
}

/** Extrait la section JSON array d'une réponse LLM (potentiellement polluée par texte avant/après). */
function extractJsonArray(text: string): unknown[] | null {
  const t = text.trim();
  if (!t) return null;
  // 1) Commence par [ directement
  if (t.startsWith("[")) {
    try { return JSON.parse(t); } catch { /* pas valide direct → on essaie 2) */ }
  }
  // 2) Bloc ```json … ```
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) {
    try { return JSON.parse(fence[1].trim()); } catch { /* pas JSON → 3) */ }
  }
  // 3) Trouve [ extérieur à des strings, prend la première fermeture ]
  const openIdx = t.indexOf("[");
  if (openIdx === -1) return null;
  let depth = 0;
  let inStr: "\"" | "'" | null = null;
  for (let i = openIdx; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (c === "\\") { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === "\"" || c === "'") { inStr = c; continue; }
    if (c === "[") depth++;
    if (c === "]") {
      depth--;
      if (depth === 0) {
        const slice = t.slice(openIdx, i + 1);
        try { return JSON.parse(slice); } catch { return null; }
      }
    }
  }
  return null;
}

/**
 * Point d'entrée principal : demande au modèle IA LOCAL des prédictions.
 * Si le modèle échoue (injoignable, timeout, JSON invalide, 0 prédictions
 * valides après sanitize) → retour AUTOMATIQUEMENT le moteur déterministe
 * (origin = "deterministic"), de manière à ce qu'il n'y ait JAMAIS 0
 * prédictions affichées et AUCUNE invention.
 */
export async function predictRiskPredictionsAI(
  ctx: RiskContext,
  cfg: LlmProviderConfig,
): Promise<{ predictions: RiskPrediction[]; origin: "ai_model" | "deterministic"; error?: string; model: string }> {
  const now = ctx.now ?? Date.now();
  const userMsg = `## CONTEXTE RÉEL ARGOS (100% réel — AUCUNE invention autorisée)
${buildUserContextPayload(ctx)}

## CONSIGNE FINALE
Produis maintenant UNIQUEMENT l'array JSON de RiskPrediction[] valide (entre 1 et 12 prédictions max, triées score décroissant). Si tu ne peux rien produire de valide → []`;

  const res = await chatComplete(cfg, [
    { role: "system", content: RISK_AI_SYSTEM },
    { role: "user", content: userMsg },
  ]);

  // Si échec → fallback déterministe GARANTI 100% réel.
  if (!res.ok || !res.text) {
    const fallback = computeRiskPredictions(ctx).map((p) => ({ ...p, origin: "deterministic" as const }));
    return { predictions: fallback, origin: "deterministic", error: res.error ?? "LLM vide", model: cfg.model };
  }

  const arr = extractJsonArray(res.text);
  if (!Array.isArray(arr) || arr.length === 0) {
    const fallback = computeRiskPredictions(ctx).map((p) => ({ ...p, origin: "deterministic" as const }));
    return { predictions: fallback, origin: "deterministic", error: "pas de JSON array valide dans la réponse LLM", model: cfg.model };
  }

  // Schéma + anti-invention : on rejette tout ce qui n'est pas cohérent avec le contexte réel.
  const valid: RiskPrediction[] = [];
  for (const entry of arr) {
    const p = sanitizePrediction(entry, ctx, now, "ai_model", cfg.model);
    if (p) valid.push(p);
  }
  valid.sort((a, b) => b.score - a.score);

  // Si 0 valide → fallback déterministe (on ne montre jamais de coquilles)
  if (valid.length === 0) {
    const fallback = computeRiskPredictions(ctx).map((p) => ({ ...p, origin: "deterministic" as const }));
    return { predictions: fallback, origin: "deterministic", error: "0 prédiction valide après schéma sanitize", model: cfg.model };
  }

  return { predictions: valid.slice(0, 12), origin: "ai_model", model: cfg.model };
}
