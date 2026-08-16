// ============================================================================
// ARGOS — orchestrateur de l'assistant IA (§6.17 Couche 2)
// Traduit une requête en langage naturel en une requête Couche 1 DÉTERMINISTE,
// l'exécute contre le moteur de reco / les données, et produit une réponse par
// gabarit en français. Le LLM local ne fait ensuite que reformuler ce résultat
// (voir provider.ts). Cœur exécutable hors-ligne, sans LLM.
//
// Copilot général : contexte enrichi (hôpitaux, stats, séismes) et ~15
// intentions couvrant incident, situation globale, tendances, hôpitaux,
// unités, croisements multi-données, ORSEC, sismologie et recherche.
// ============================================================================

import type { DashStats, Hospital, Incident, SeismicEvent, Unit } from "@/lib/types";
import type { TransportMovement } from "@/lib/data/dispatch";
import type { EquipItem, OrsecBoard } from "@/lib/data/modules";
import { etaMinutes, UNIT_CAPS, CAP_LABELS, type Capability, recommend, needFromIncident, haversineKm } from "@/lib/reco";
import { cleanFinalText } from "@/lib/ai/config";
import type { RiskPrediction } from "@/lib/ai/risk/types";

export type AiIntent =
  | "reachability"
  | "sitrep"
  | "anomaly"
  | "incident_details"
  | "incidents_list"
  | "global_overview"
  | "trends"
  | "casualties_summary"
  | "hospitals_status"
  | "hospitals_nearest"
  | "units_status"
  | "cross_analysis"
  | "orsec_summary"
  | "seismic_status"
  | "equipment_search"
  | "help"
  | "greeting"
  | "social"
  // --- Intents temporels (noveaux : ARGOS §6.22)
  | "today_incidents"
  | "last24h_summary"
  | "today_vs_yesterday"
  | "trend_incidents"
  | "activity_peaks"
  | "unusual_evolution"
  // --- Intents géographiques (nouveaux : ARGOS §6.22)
  | "touched_zones"
  | "incidents_near_city"
  | "critical_concentration"
  | "riskiest_zone"
  // --- Intents module IA prédictions risques (nouveau : module dashboard RiskPanel)
  | "risks_prediction"
  | "risks_zone"
  | "unknown";

export interface AiUnitResult {
  id: string;
  nom: string;
  ville: string;
  etaMin: number;
  caps: string[];
  dispo: string;
  within: boolean;
  /** Champs enrichis Copilot (optionnels pour rétro-compat) */
  type?: string;
  readiness?: number;
  score?: number;
}

export interface AiIncidentRow {
  id: string;
  titre: string;
  region: string;
  type: string;
  sev: string;
  st: string;
  time: string;
  casualties?: { dead: number; injured: number; missing: number; rescued?: number };
  lieu?: string;
  coords?: [number, number];
  declared?: string;
}

export interface AiHospitalRow {
  id: string;
  nom: string;
  ville: string;
  kind?: string;
  occPct: number;
  icuPct: number;
  lits: number;
  rea: number;
  distKm?: number;
  distanceKm?: number;
  etaMin?: number;
  ll?: [number, number];
  name?: string; // alias retro: AiHospitalRow utilisé parfois avec .name
}

export interface AiTopEquip {
  id: string;
  desig: string;
  cat: string;
  stock: number;
  cond: string;
  unit: string;
  seuil?: number;
}

export interface AiAnswerStatsItem {
  label: string;
  value: string | number;
  level: number;
}

export interface AiAnswerStats {
  open?: number;
  prog?: number;
  closed?: number;
  high?: number;
  medium?: number;
  low?: number;
  dead?: number;
  injured?: number;
  missing?: number;
  rescued?: number;
  unitsReady?: number;
  unitsDeployed?: number;
  avgReadiness?: number;
  totalHospitals?: number;
  totalLits?: number;
  litsDisponibles?: number;
  occMoyennePct?: number;
  totalRea?: number;
  reaDisponibles?: number;
  etablissementsSousTension?: number;
  items?: AiAnswerStatsItem[];
}

export interface AiCrossUnitRec {
  unit: { id: string; nom: string; ville: string; type?: string };
  score: number;
  timeScore: number;
  capScore: number;
  regionScore: number;
  dispoScore: number;
}

export interface AiCrossUnitEquip {
  unitName: string;
  equipment: { desig: string; stock: number; cond: string }[];
}

export interface AiCrossBlock {
  incident?: AiIncidentRow & { lieu?: string; coords?: [number, number] };
  recommendedUnits?: AiCrossUnitRec[];
  hospitals?: AiHospitalRow[];
  unitEquipment?: AiCrossUnitEquip[];
  quakes?: SeismicEvent[];
  // --- géo : centrage carte demandé depuis Copilot « Afficher sur la carte »
  mapFocus?: {
    ll: [number, number];
    zoom: number;
    label?: string;
    /** si c'est un incident précis : son ID (on appelle focusIncident) */
    incidentId?: string;
  };
  // --- temporel : infos 24h / hier / aujourd'hui (pour synthèse Qwen)
  temporal?: {
    today: { count: number; severity: Record<string, number>; ids: string[] };
    last24h: { count: number; severity: Record<string, number>; ids: string[] };
    yesterday?: { count: number; severity: Record<string, number>; ids: string[] };
    trend?: "increasing" | "decreasing" | "stable";
    deltaPct?: number;
    peakHour?: string;
    unusual?: boolean;
  };
  // --- géo : agrégation par zone
  zones?: { nom: string; count: number; severity: "critique" | "élevé" | "moyen" | "faible"; ll?: [number, number]; ids: string[] }[];
}

export interface AiSuggestion {
  label: string;
  query: string;
  priority?: "primary" | "secondary";
}

export interface AiAnswer {
  intent: AiIntent;
  layer1: string;
  text: string;
  units?: AiUnitResult[];
  incidents?: AiIncidentRow[];
  hospitals?: AiHospitalRow[];
  stats?: AiAnswerStats;
  topEquip?: AiTopEquip[];
  quakes?: { id: string; region: string; mag: number; depth: number; time: string }[];
  suggestions?: (string | AiSuggestion)[];
  cross?: AiCrossBlock;
}

export interface AiContext {
  incidents: Incident[];
  movements: TransportMovement[];
  units: Unit[];
  hospitals?: Hospital[];
  equipment: EquipItem[];
  orsec: OrsecBoard;
  dashStats?: DashStats | null;
  quakes?: SeismicEvent[];
  currentPath?: string;
  currentIncidentId?: string | null;
  /** Module prédictions risques IA (100% réel). Peut être vide si module désactivé. */
  riskPredictions?: RiskPrediction[];
}

// --- Utilitaires ----------------------------------------------------------

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

type IntentTopicHint = "incident" | "hospital" | "unit" | "seismic" | "orsec" | "equipment" | "global" | "logistics" | "trends" | "casualties" | "cross" | "unknown";

export interface EnrichedQuery {
  query: string;
  targetIncidentId?: string;
  targetUnitId?: string;
  targetHospitalId?: string;
}

/**
 * Enrichit une requête potentiellement vague ("quel est sa sévérité ?", "au niveau international")
 * à partir des ~15 derniers messages. Retourne :
 *   - la requête enrichie (texte),
 *   - un incident cible (si détecté dans l'historique, ex INC-2595),
 *   - des unités / hôpitaux cibles optionnels.
 */
export function enrichFromHistory(query: string, history: { role: "user" | "assistant"; text: string; layer1?: string }[]): EnrichedQuery {
  const q = query.trim();
  const result: EnrichedQuery = { query: q };
  if (!q) return result;
  const nq = norm(q);

  // --- 1) INCIDENT CIBLE depuis l'historique : 3 stratégies ---
  // a) Chercher INC-\d+ DANS LA REQUÊTE ACTUELLE (priorité max)
  const mCurrent = q.match(/\b(INC-\d{3,6})\b/i);
  if (mCurrent) {
    result.targetIncidentId = mCurrent[1].toUpperCase();
  }
  // b) Sinon : le DERNIER INC-\d+ apparaissant dans les 15 derniers messages (user OU assistant)
  if (!result.targetIncidentId) {
    for (let i = history.length - 1; i >= Math.max(0, history.length - 15); i--) {
      const txt = history[i]?.text || "";
      const m = txt.match(/\b(INC-\d{3,6})\b/i);
      if (m) {
        result.targetIncidentId = m[1].toUpperCase();
        break;
      }
    }
  }
  // c) Sinon : regarder layer1 "detail INC-XXXX"
  if (!result.targetIncidentId) {
    for (let i = history.length - 1; i >= Math.max(0, history.length - 15); i--) {
      const l1 = history[i]?.layer1 || "";
      const m = l1.match(/\b(INC-\d{3,6})\b/i);
      if (m) {
        result.targetIncidentId = m[1].toUpperCase();
        break;
      }
    }
  }

  // --- 2) Unité / Hôpital cible depuis historique (si layer1 les mentionne explicitement) ---
  for (let i = history.length - 1; i >= Math.max(0, history.length - 8); i--) {
    const l1 = history[i]?.layer1 || "";
    if (!result.targetUnitId) {
      const um = l1.match(/unit[eé]\s*(\S+)/i);
      if (um) result.targetUnitId = um[1];
    }
    if (!result.targetHospitalId) {
      const hm = l1.match(/hosp\S*\s*(\S+)/i);
      if (hm) result.targetHospitalId = hm[1];
    }
    if (result.targetUnitId && result.targetHospitalId) break;
  }

  // --- 3) Requête courte / vague → préfixe avec le sujet du layer1 précédent ---
  if (q.length <= 140) {
    const hasEnoughContext =
      /(d[eéé]tail|fiche|description|informations?|statut|s[eé]v[ée]rit[ée]|gravit[ée]|localis|proche|analyse\s*crois[ée]e|croisement|cross|combien|quel\s+(est|sont|est\s*son|est\s*sa|sont\s*ses)|c['e]st\s*quoi|ou\s+est|son\s+statut|sa\s+(s[eé]v|s[eé]vé|grav)|sa\s+localis|ses\s+d[eéé]tails?|ses?\s+caract[eé]ristiques?|historique|d[eé]clench[eé]|comment\s+ca\s+va|et\s+pourquoi|au\s+niveau|ensuite|et\s+apres|et\s+après|donne\s+moi|affiche|montre)/.test(nq) ||
      (result.targetIncidentId ? nq.length <= 140 : nq.length <= 70);
    if (hasEnoughContext) {
      // Cherche le sujet du dernier assistant par layer1
      let topic: IntentTopicHint = "unknown";
      for (let i = history.length - 1; i >= Math.max(0, history.length - 8); i--) {
        const layer = (history[i]?.layer1 || "").toLowerCase();
        if (/seismic|sism|seisme|quake/.test(layer)) { topic = "seismic"; break; }
        else if (/hospitaux|hospinet|sante|etablissement/.test(layer)) { topic = "hospital"; break; }
        else if (/detail.*incident|liste.*incident|incident/.test(layer) || result.targetIncidentId) { topic = "incident"; break; }
        else if (/posture|unite.*far|unite|readiness/.test(layer)) { topic = "unit"; break; }
        else if (/cross|croise|croisement/.test(layer)) { topic = "cross"; break; }
        else if (/global|vue.*ensemble|panorama|apercu|synthese multi/.test(layer)) { topic = "global"; break; }
        else if (/orsec/.test(layer)) { topic = "orsec"; break; }
        else if (/equip|inventaire|materiel|cherche/.test(layer)) { topic = "equipment"; break; }
        else if (/mouvement|convoi|retard|anomal/.test(layer)) { topic = "logistics"; break; }
        else if (/tendanc|evolution 30|statist/.test(layer)) { topic = "trends"; break; }
        else if (/bilan humain|victime|deces|blesse|casualt/.test(layer)) { topic = "casualties"; break; }
      }
      // Si on a trouvé un incident cible OU que le sujet est incident → préfixe avec INC cible
      if (topic === "incident" && result.targetIncidentId) {
        // On ajoute systématiquement l'INC cible dans la query texte pour que regex detail/statut matche
        if (!/INC-\d+/i.test(q)) {
          result.query = `${result.targetIncidentId} — ${q}`;
          return result;
        }
      }
      if (topic === "unknown") return result;
      const prefix: Record<IntentTopicHint, string> = {
        seismic: "Concernant la sismologie : ",
        hospital: "Concernant les hôpitaux : ",
        incident: "Concernant les incidents : ",
        unit: "Concernant les unités FAR : ",
        cross: "Dans le cadre d'une analyse croisée : ",
        global: "Sur la situation globale : ",
        orsec: "Concernant le dispositif ORSEC : ",
        equipment: "Concernant les équipements / inventaire : ",
        logistics: "Concernant la logistique et les mouvements : ",
        trends: "Concernant les tendances / statistiques : ",
        casualties: "Concernant le bilan humain : ",
        unknown: "",
      };
      result.query = (prefix[topic] || "") + q;
    }
  }
  return result;
}

const UNIT_CODE: Record<string, string> = {
  "1er GI": "U1", "3e BG": "U2", "7e RA": "U3", "2e GL": "U4", "5e BS": "U5", "4e NRBC": "U6",
};

const INCIDENT_PLACE: Record<string, string> = {
  "INC-2607": "Al Haouz", "INC-2606": "Ourika", "INC-2604": "Chefchaouen",
  "INC-2601": "Al Hoceïma", "INC-2598": "Mohammedia", "INC-2595": "Zagora",
};

const SEV_LABEL: Record<string, string> = { high: "élevée", medium: "moyenne", low: "faible" };
const ST_LABEL: Record<string, string> = { open: "ouverte", prog: "en cours", closed: "fermée" };
const DISPO_LABEL: Record<string, string> = { ready: "opérationnelle", deployed: "déployée", standby: "en attente" };
const COND_LABEL: Record<string, string> = { ok: "OK", repair: "en réparation", oos: "HS" };

/**
 * Vue STOCKS CRITIQUES / ÉTAT DES ÉQUIPEMENTS (ruptures, HS, sous seuil).
 * Déclenchée quand l'utilisateur demande l'état global des stocks / ruptures
 * (pas une recherche par mot-clé). → retourne 100% réel depuis ctx.equipment.
 */
function equipmentCriticalStatus(_q: string, ctx: AiContext): AiAnswer {
  const all = ctx.equipment;
  const total = all.length;
  const ruptures = all
    .filter((e) => (e.stock < e.threshold) || e.cond === "oos")
    .slice()
    .sort((a, b) => {
      const aHs = a.cond === "oos" ? 0 : a.cond === "repair" ? 1 : 2;
      const bHs = b.cond === "oos" ? 0 : b.cond === "repair" ? 1 : 2;
      if (aHs !== bHs) return aHs - bHs;
      const aRatio = a.threshold > 0 ? a.stock / a.threshold : 1;
      const bRatio = b.threshold > 0 ? b.stock / b.threshold : 1;
      if (aRatio !== bRatio) return aRatio - bRatio;
      return (b.stock - a.stock);
    });
  const nHorsService = ruptures.filter((e) => e.cond === "oos").length;
  const nSousSeuil = ruptures.filter((e) => e.cond !== "oos" && e.stock < e.threshold).length;
  const nRepair = ruptures.filter((e) => e.cond === "repair" && e.stock < e.threshold).length;
  const niveau =
    ruptures.length >= 6 || nHorsService >= 2 ? "alerte"
      : ruptures.length >= 3 || nHorsService >= 1 ? "attention"
        : "ok";
  const niveauLabel = niveau === "alerte" ? "🔴 ALERTE" : niveau === "attention" ? "🟠 ATTENTION" : "🟢 OK";
  const top = ruptures.slice(0, 8);
  const conformes = total - ruptures.length;

  const text = [
    `ÉTAT DES STOCKS ÉQUIPEMENTS CRITIQUES — ARGOS`,
    `Total inventaire : ${total} équipements · Conformes : ${conformes} · ${niveauLabel}`,
    `${ruptures.length} point(s) sensible(s) : ${nHorsService} HORS SERVICE · ${nSousSeuil} sous seuil · ${nRepair} en réparation + sous seuil.`,
    ruptures.length
      ? ""
      : "Aucune rupture ni équipement hors service. Tous les stocks sont conformes.",
    ...top.map(
      (e, i) =>
        `${String(i + 1).padStart(2, " ")}. ${e.id} · ${e.desig}\n` +
        `      Catégorie : ${e.cat} · Unité : ${e.unit}\n` +
        `      Stock : ${e.stock} / seuil ${e.threshold} · État : ${COND_LABEL[e.cond]}` +
        (e.cond === "oos" ? "  ⛔ HORS SERVICE" : e.stock < e.threshold ? "  ⚠ SOUS SEUIL" : ""),
    ),
    conformes && ruptures.length
      ? `\nLes autres équipements (${conformes}) ont un stock ≥ seuil et état OK.`
      : "",
  ].filter(Boolean).join("\n");

  return {
    intent: "equipment_search",
    layer1: "état stocks équipements — ruptures / hors-service (issu de catalog.equipment)",
    text,
    topEquip: ruptures.map((e) => ({
      id: e.id, desig: e.desig, cat: e.cat, stock: e.stock,
      cond: COND_LABEL[e.cond], unit: e.unit, seuil: e.threshold,
    })),
    suggestions: [
      { label: "Situation globale", query: "Situation globale opérationnelle" },
      { label: "Posture unités FAR", query: "Posture globale des unités FAR" },
    ],
  };
}

function resolveTarget(q: string, incidents: Incident[]): Incident | null {
  const nq = norm(q);
  // 1) match direct sur ID incident (ex: INC-2607)
  const idMatch = q.toUpperCase().match(/INC-\d+/);
  if (idMatch) {
    const byId = incidents.find((i) => i.id === idMatch[0]);
    if (byId) return byId;
  }
  for (const inc of incidents) {
    const place = INCIDENT_PLACE[inc.id] ?? inc.region;
    if (nq.includes(norm(place))) return inc;
    if (nq.includes(norm(inc.region.split("-")[0]))) return inc;
    if (norm(inc.titre).includes(nq)) return inc;
  }
  return null;
}

function parseThreshold(q: string): number | null {
  const nq = norm(q);
  const min = nq.match(/(\d+)\s*min/);
  if (min) return Number(min[1]);
  const h = nq.match(/(\d+)\s*h(?:eure)?/);
  if (h) return Number(h[1]) * 60;
  if (/une heure|1 heure|d'une heure|en une heure/.test(nq)) return 60;
  if (/deux heures|2 heures/.test(nq)) return 120;
  if (/trois heures|3 heures/.test(nq)) return 180;
  return null;
}

const CAP_KEYWORDS: [RegExp, Capability][] = [
  [/genie|deblaiement|deblai/, "genie"],
  [/sauvetage|sar|recherche|cynophile|cynotech/, "sar"],
  [/medical|medicalis|sante|infirmier|medecin|blesse/, "medical"],
  [/nrbc|chimique|radiologique|decontamin/, "nrbc"],
  [/logistique|ravitaill|fret|transport/, "logistique"],
  [/potabilisation|\beau\b|hydrique/, "eau"],
  [/transmission|radio|liaison/, "transmissions"],
  [/pompage|hydraulique|crue|inondation/, "hydraulique"],
  [/aeroporte|heliporte|helico|parachut/, "aeroporte"],
];

function parseEquipCategory(q: string): string | null {
  const nq = norm(q);
  if (/electrogene|generateur|courant|eclairage|energie/.test(nq)) return "Énergie";
  if (/tente|campement|abri/.test(nq)) return "Campement";
  if (/brancard|medical/.test(nq)) return "Médical";
  return null;
}

function parseCapability(q: string): Capability | null {
  const nq = norm(q);
  for (const [re, cap] of CAP_KEYWORDS) if (re.test(nq)) return cap;
  return null;
}

function incidentRow(i: Incident): AiIncidentRow {
  return {
    id: i.id,
    titre: i.titre,
    region: i.region,
    type: i.type,
    sev: SEV_LABEL[i.sev] ?? i.sev,
    st: ST_LABEL[i.st] ?? i.st,
    time: i.time,
    casualties: i.casualties ? { ...i.casualties } : undefined,
  };
}

function hospitalRow(h: Hospital, fromLL?: [number, number]): AiHospitalRow {
  const occPct = h.lits ? Math.round((h.occ / h.lits) * 100) : 0;
  const icuPct = h.rea ? Math.round((h.reaOcc / h.rea) * 100) : 0;
  const row: AiHospitalRow = {
    id: h.id,
    nom: h.nom,
    ville: h.ville,
    kind: h.kind,
    occPct,
    icuPct,
    lits: h.lits,
    rea: h.rea,
  };
  if (fromLL) {
    row.distanceKm = Math.round(haversineKm(h.ll, fromLL) * 10) / 10;
    row.etaMin = etaMinutes(h.ll, fromLL);
  }
  return row;
}

// --- Intentions : existentes (gardées) ------------------------------------

function reachability(q: string, ctx: AiContext): AiAnswer {
  const target = resolveTarget(q, ctx.incidents);
  const threshold = parseThreshold(q);
  const cap = parseCapability(q);
  const equipCat = parseEquipCategory(q);

  if (!target) {
    return {
      intent: "reachability",
      layer1: "portée d'unités — lieu non résolu",
      text: "Je n'ai pas identifié le lieu ou l'opération visée. Précisez une zone (ex. « Al Haouz », « Ourika », « Al Hoceïma ») ou un identifiant (ex. « INC-2607 »).",
    };
  }

  const equipUnitIds = equipCat
    ? new Set(ctx.equipment.filter((e) => e.cat === equipCat).map((e) => UNIT_CODE[e.unit]).filter(Boolean))
    : null;

  let rows: AiUnitResult[] = ctx.units.map((u) => {
    const caps = UNIT_CAPS[u.id] ?? [];
    return {
      id: u.id,
      nom: u.nom,
      ville: u.ville,
      etaMin: etaMinutes(u.ll, target.ll),
      caps: caps.map((c) => CAP_LABELS[c]),
      dispo: DISPO_LABEL[u.dispo] ?? u.dispo,
      within: true,
    };
  });

  if (cap || equipUnitIds) {
    rows = rows.filter((r) => {
      const capOk = cap ? (UNIT_CAPS[r.id] ?? []).includes(cap) : false;
      const equipOk = equipUnitIds ? equipUnitIds.has(r.id) : false;
      return capOk || equipOk;
    });
  }

  rows.sort((a, b) => a.etaMin - b.etaMin);
  if (threshold != null) rows.forEach((r) => (r.within = r.etaMin <= threshold));

  const capLabel = cap ? CAP_LABELS[cap] : equipCat ? `équipement « ${equipCat} »` : null;
  const placeName = INCIDENT_PLACE[target.id] ?? target.region;
  const layer1 = [
    `unités pour ${placeName} (${target.id})`,
    capLabel ? `capacité = ${capLabel}` : null,
    threshold != null ? `ETA ≤ ${threshold} min` : null,
  ].filter(Boolean).join(", ");

  const within = rows.filter((r) => r.within);
  let text: string;
  if (rows.length === 0) {
    text = `Aucune unité ne correspond à la capacité demandée${capLabel ? ` (${capLabel})` : ""}.`;
  } else if (threshold != null && within.length === 0) {
    const nearest = rows[0];
    text = `Aucune unité ne peut atteindre ${placeName} en moins de ${threshold} min. La plus proche est ${nearest.nom} (${nearest.ville}), ETA ~${nearest.etaMin} min.`;
  } else {
    const list = (threshold != null ? within : rows.slice(0, 4))
      .map((r) => `${r.nom} (${r.ville}) — ETA ~${r.etaMin} min`)
      .join(" ; ");
    text = `${threshold != null ? within.length : Math.min(4, rows.length)} unité(s) correspondent : ${list}.`;
  }

  return { intent: "reachability", layer1, text, units: rows };
}

function sitrep(_q: string, ctx: AiContext): AiAnswer {
  const b = ctx.orsec;
  const active = ctx.incidents.filter((i) => i.st !== "closed").length;
  const inTransit = ctx.movements.filter((m) => m.progress < 100).length;
  const delayed = ctx.movements.filter((m) => m.delayMin > 0).length;
  const text = [
    "SITREP — Opération SALAMA (brouillon)",
    `1. SITUATION : ${active} opérations actives ; séisme M5.9 — Al Haouz, niveau ORSEC ${b.planLevel} (renforcé), activé ${b.activatedAt}.`,
    `2. BILAN HUMAIN : ${b.casualties.dead} décès, ${b.casualties.injured} blessés, ${b.casualties.missing} disparus, ${b.casualties.rescued} secourus.`,
    `3. MOYENS ENGAGÉS : ${b.units.engaged} unités, ${b.personnel.engaged} personnels, ${b.vehicles.engaged} véhicules.`,
    `4. SANTÉ & ABRIS : charge hospitalière ${b.hospitalLoad} %, ${b.sheltersActive} abris actifs.`,
    `5. MOUVEMENTS : ${inTransit} convois en cours, dont ${delayed} en retard.`,
    "6. PROCHAINES ÉTAPES : maintien du pont aérien Agadir–Amizmiz ; réouverture RP2010 visée 14h00 ; consolidation des HMC.",
  ].join("\n");
  return { intent: "sitrep", layer1: "SITREP auto-rempli depuis l'état ORSEC + incidents + mouvements", text };
}

function anomaly(_q: string, ctx: AiContext): AiAnswer {
  const delayed = ctx.movements.filter((m) => m.delayMin > 0).sort((a, b) => b.delayMin - a.delayMin);
  const text = delayed.length
    ? [`${delayed.length} mouvement(s) en écart sur les itinéraires planifiés :`,
       ...delayed.map((m) => `• ${m.id} ${m.mission} — retard +${m.delayMin} min (${m.origin} → ${m.destination}), progression ${m.progress} %.`)].join("\n")
    : "Aucune anomalie : tous les mouvements sont conformes à l'itinéraire planifié.";
  return { intent: "anomaly", layer1: "analyse des écarts sur les mouvements de transport", text };
}

// --- Intentions : nouvelles (Copilot général) -----------------------------

/**
 * PIRE / PLUS GRAVE incidents : tri PAR POIDS SÉVÉRITÉ (high > medium > low),
 * PUIS par statut (OPEN > PROG > CLOSED), PUIS plus récent.
 * Jamais par proximité texte comme resolveTarget.
 */
function worstIncidents(q: string, ctx: AiContext, topN: 1 | 3 = 1): AiAnswer {
  const weight: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const stWeight: Record<string, number> = { open: 3, prog: 2, closed: 1 };
  const sorted = [...ctx.incidents].sort((a, b) => {
    const da = (weight[a.sev] ?? 0) * 10 + (stWeight[a.st] ?? 0);
    const db = (weight[b.sev] ?? 0) * 10 + (stWeight[b.st] ?? 0);
    if (db !== da) return db - da;
    // Incident n'a pas declaredAt (champ time = string seulement). On utilise le tri secondaire par id décroissant (plus récent).
    return a.id.localeCompare(b.id);
  });
  const top = sorted.slice(0, topN);

  const plural = topN > 1 ? `${topN} incidents les plus graves` : "Incident le plus grave";
  const lines = top.map((i, idx) => {
    const sev = SEV_LABEL[i.sev] ?? i.sev;
    const st = ST_LABEL[i.st] ?? i.st;
    const cas = i.casualties;
    const bilan = cas
      ? ` · bilan ${cas.dead}D ${cas.injured}B${cas.missing ? " " + cas.missing + "?" : ""}`
      : "";
    const place = INCIDENT_PLACE[i.id] ?? i.region;
    return `  ${idx + 1}. ${i.id} · ${sev.toUpperCase()} · ${st} · ${i.titre} (${place}, depuis ${i.time})${bilan}`;
  });
  const casLine = top
    .filter((i) => i.casualties)
    .map((i) => `${i.id}: ${i.casualties!.dead}D ${i.casualties!.injured}B ${i.casualties!.missing ?? 0}?`)
    .join(" · ");
  const text = [
    `📊 ${plural} (classement sévérité ${topN > 1 ? "TOP " + topN : "#1"} / statut actif) :`,
    lines.join("\n"),
    casLine ? `\nBilan humain cumulé TOP ${topN} : ${casLine}` : "",
    top[0].st !== "closed"
      ? `\n${top[0].id} est actuellement ${ST_LABEL[top[0].st] ?? top[0].st} — recommandation : consulter l'analyse croisée.`
      : `\n${top[0].id} est clos.`,
  ].join("");

  const rows = top.map(incidentRow);
  const suggestions: AiSuggestion[] = top.map((i) => ({
    label: `Analyse croisée ${i.id}`,
    query: `Analyse croisée ${i.id}`,
    priority: "primary" as const,
  }));
  suggestions.push({ label: "Tous incidents", query: "tous les incidents en cours" });
  return {
    intent: "incidents_list", // AiIntent existant (pluriel)
    layer1: `worst_incidents top=${topN} · sev desc`,
    text,
    incidents: rows,
    suggestions,
  };
}

type IncSubIntent = "severity" | "status" | "location" | "opinion" | "casualties" | "full";

/**
 * Détermine SOUS-INTENT d'une question d'incident : est-ce que l'utilisateur demande
 * spécifiquement UN ATTRIBUT (c'est grave ? → severity / son statut ? → status / où est-ce ? → location)
 * ou la fiche complète ?
 */
function classifyIncSubIntent(q: string): IncSubIntent {
  const nq = norm(q);
  if (/(c['e]st\s+grave|est[- ]ce\s+grave|grave\s*\?|comment\s+il\s+est|t['e]n\s+penses\s+quoi|qu['e]n\s+penses[- ]tu|avis|appr[eé]ciation|analys|risque|dangere|niveau)/.test(nq)) return "opinion";
  if (/(s[eé]v[eé]rit[eé]|gravit[eé]|s[eé]v[èe]re|quel\s+niveau|niveau\s+de).*\?*$/.test(nq)) return "severity";
  if (/(statut|status|stade|en\s+cours|ouverte|ferm[eé]e|comment\s+ça\s+avance|o[uù]\s+en\s+est|avancement|d[eé]roulement).*\?*$/.test(nq)) return "status";
  if (/(localis|position|o[uù]\s+est|o[uù]\s+se\s+trouve|lieu|ville|adresse|coordonn[eé]es|g[eé]olocalis|r[eé]gion|province|zone).*\?*$/.test(nq)) return "location";
  if (/(victime|bilan\s+humain|d[eé]c[eé]s|mort[s]?|bless[eé]s?|disparus?|secourus?|casualt).*\?*$/.test(nq)) return "casualties";
  return "full";
}

/**
 * Réponse CONCISE par attribut d'incident.
 * Utilisée COMME CONTEXTE / FALLBACK : le LLM Qwen reçoit ces données et reformule.
 */
function incidentConcise(q: string, ctx: AiContext, kind: IncSubIntent): AiAnswer {
  // "full" → délègue IMMÉDIATEMENT à incidentDetails (évite unreachable default dans le switch ci-après)
  if (kind === "full") return incidentDetails(q, ctx);

  const target = resolveTarget(q, ctx.incidents);
  if (!target) {
    return {
      intent: "incident_details",
      layer1: `incident_concise ${kind} — cible non résolue`,
      text: "Aucun incident ne correspond. Précisez un identifiant (ex. INC-2607), une région ou un mot du titre.",
      suggestions: [
        { label: "Liste incidents", query: "tous les incidents en cours" },
        { label: "Fiche INC-2607", query: "Détail INC-2607", priority: "primary" as const },
      ],
    };
  }
  const placeName = INCIDENT_PLACE[target.id] ?? target.region;
  const sev = SEV_LABEL[target.sev] ?? target.sev;
  const st = ST_LABEL[target.st] ?? target.st;
  const cas = target.casualties;
  const header = `${target.id} · ${target.titre} · ${placeName}`;

  const row = incidentRow(target);
  const rows = [row];
  const baseSugg: AiSuggestion[] = [
    { label: "Analyse croisée", query: `Analyse croisée ${target.id}`, priority: "primary" as const },
    { label: "Fiche complète", query: `Détail ${target.id}` },
    { label: "Unités à mobiliser", query: `unités médicales pour ${target.region}` },
  ];
  const reco = recommend(needFromIncident(target), ctx.units).slice(0, 3);
  // 2026-08-11 : Unit n'a PAS `type` → retiré. Champs AiUnitResult (caps, within) sont fournis avec valeurs sûres.
  const units: AiUnitResult[] = reco.map((r) => ({
    id: r.unit.id,
    nom: r.unit.nom,
    ville: r.unit.ville,
    dispo: r.unit.dispo,
    readiness: r.unit.readiness,
    score: r.score,
    etaMin: r.etaMin,
    caps: [],
    within: true,
  }));

  // Moyenne occupation hôpitaux : DashStats.hospitals est un tableau {occPct}[], PAS un champ simple.
  const avgOcc =
    ctx.dashStats?.hospitals && ctx.dashStats.hospitals.length
      ? Math.round(ctx.dashStats.hospitals.reduce((a, b) => a + b.occPct, 0) / ctx.dashStats.hospitals.length)
      : null;

  let text = "";
  let layer1 = `incident_concise ${kind} ${target.id} (${placeName})`;
  switch (kind) {
    case "severity":
      text = `${header} · Sévérité : ${sev.toUpperCase()} · Statut : ${st}.`;
      if (target.sev === "high") text += ` Ce type d'incident (${target.type}) est classé niveau élevé — vigilance renforcée recommandée dans la région ${target.region}.`;
      else if (target.sev === "medium") text += ` Sévérité moyenne — suivi opérationnel normal, posture adaptée selon évolution.`;
      else text += ` Sévérité faible — incident contenu, posture standard.`;
      break;
    case "status":
      text = `${header} · Statut : ${st.toUpperCase()} · Sévérité : ${sev} · Déclaré : ${target.time}.`;
      if (target.st === "closed") text += ` Incident terminé et clos.`;
      else if (target.st === "prog") text += ` Interventions en cours — responders rattachés : ${target.responders?.units?.length ?? 0} unités.`;
      else text += ` En attente de moyens — responders rattachés : ${target.responders?.units?.length ?? 0} unités.`;
      break;
    case "location":
      text = `${header} · Coordonnées [${target.ll[1].toFixed(3)}, ${target.ll[0].toFixed(3)}] (région ${target.region}${target.adresse ? ` · ${target.adresse}` : ""}).`;
      break;
    case "casualties":
      // rescued n'existe PAS sur Incident.casualties (seulement sur DashStats.casualties résumé).
      if (cas) text = `${header} · Bilan humain : ${cas.dead} décès · ${cas.injured} blessés · ${cas.missing} disparus.`;
      else text = `${header} · Aucun bilan humain saisi à ce stade (incident ${target.type}, ${st}).`;
      break;
    case "opinion":
      text = [
        `${header} · type ${target.type} · sév. ${sev} · statut ${st} · déclaré ${target.time}.`,
        cas ? `Bilan humain : ${cas.dead}D · ${cas.injured}B · ${cas.missing}?.` : "Bilan humain : non saisi.",
        `Contextualisation : ORSEC N3 · Unités prêtes ${ctx.dashStats?.units?.ready ?? 0} · Occup. hôp. moyen ${avgOcc ?? "—"}%${ctx.quakes?.length ? ` · Séismes≥M4.5 dernier mois : ${ctx.quakes.length}` : ""}.`,
        reco.length && reco[0].score > 0
          ? `Moyens recommandés : ${reco[0].unit.nom} (score ${reco[0].score}/100, ETA ${reco[0].etaMin}min)${reco[1] ? `, ${reco[1].unit.nom} (${reco[1].score}/100)` : ""}.`
          : "Moyens : à préciser selon région/capacités demandées.",
      ].join("\n");
      layer1 += " · avis contextualisé données plateforme";
      break;
  }
  return {
    intent: "incident_details",
    layer1,
    text,
    incidents: rows,
    units: kind === "opinion" ? units : undefined,
    suggestions: baseSugg,
  };
}

function incidentDetails(q: string, ctx: AiContext): AiAnswer {
  const target = resolveTarget(q, ctx.incidents);
  if (!target) {
    return {
      intent: "incident_details",
      layer1: "détails incident — cible non résolue",
      text: "Aucun incident ne correspond. Précisez un identifiant (ex. INC-2607), une région (Al Haouz, Ourika…) ou un mot du titre.",
    };
  }
  const sub = target.subIncidents ?? [];
  const placeName = INCIDENT_PLACE[target.id] ?? target.region;
  const cas = target.casualties;
  const lines: string[] = [];
  lines.push(`INCIDENT ${target.id} — ${target.titre}`);
  lines.push(`Localisation : ${placeName} (région ${target.region}), coordonnées [${target.ll[1].toFixed(2)}, ${target.ll[0].toFixed(2)}].`);
  lines.push(`Type : ${target.type} · Sévérité : ${SEV_LABEL[target.sev]} · Statut : ${ST_LABEL[target.st]} · Déclaré : ${target.time}.`);
  if (cas) lines.push(`Bilan humain saisi : ${cas.dead} décès, ${cas.injured} blessés, ${cas.missing} disparus.`);
  if (target.adresse) lines.push(`Adresse / lieu-dit : ${target.adresse}.`);
  if (sub.length) {
    lines.push(`Sous-incidents (aléas secondaires) : ${sub.length}`);
    sub.slice(0, 5).forEach((s) =>
      lines.push(`  • ${s.id} · ${s.type} · sév. ${SEV_LABEL[s.sev]} · ${s.time}${s.note ? ` — ${s.note}` : ""}`),
    );
  }
  // Intervenants rattachés
  if (target.responders?.units?.length) {
    const noms = target.responders.units.map((uid) => ctx.units.find((u) => u.id === uid)?.nom ?? uid).join(", ");
    lines.push(`Unités rattachées : ${noms}.`);
  }
  if (target.responders?.hospitals?.length) {
    const noms = target.responders.hospitals.map((hid) => (ctx.hospitals ?? []).find((h) => h.id === hid)?.nom ?? hid).join(", ");
    lines.push(`Établissements de santé rattachés : ${noms}.`);
  }
  // Recommandation unités (moteur reco)
  const recs = recommend(needFromIncident(target), ctx.units).slice(0, 3);
  if (recs.length && !recs[0].excluded) {
    lines.push("Recommandation Couche 1 (TOP 3 unités) :");
    recs.forEach((r, i) =>
      lines.push(`  ${i + 1}. ${r.unit.nom} — score ${r.score}/100 · ETA ${r.etaMin} min · capacités ${r.matchedCaps.map((c) => CAP_LABELS[c]).join("+") || "—"}`),
    );
  }
  return {
    intent: "incident_details",
    layer1: `détails incident ${target.id} (${placeName}) + sous-incidents + responders + reco Couche 1`,
    text: lines.join("\n"),
    incidents: [incidentRow(target)],
    units: recs.slice(0, 3).map((r) => ({
      id: r.unit.id,
      nom: r.unit.nom,
      ville: r.unit.ville,
      etaMin: r.etaMin,
      caps: r.matchedCaps.map((c) => CAP_LABELS[c]),
      dispo: DISPO_LABEL[r.unit.dispo],
      within: true,
    })),
  };
}

function incidentsList(q: string, ctx: AiContext): AiAnswer {
  const nq = norm(q);
  let set = ctx.incidents.filter((i) => !i.archived);
  const filters: string[] = [];

  if (/ouverte|en cours|active/.test(nq)) {
    set = set.filter((i) => i.st !== "closed");
    filters.push("statut ≠ fermée");
  } else if (/ferm|clos|archive/.test(nq)) {
    set = set.filter((i) => i.st === "closed" || i.archived);
    filters.push("fermées / archivées");
  }

  if (/haute|grave|critique/.test(nq)) {
    set = set.filter((i) => i.sev === "high");
    filters.push("sév. élevée");
  } else if (/moyenne/.test(nq)) {
    set = set.filter((i) => i.sev === "medium");
    filters.push("sév. moyenne");
  } else if (/faible/.test(nq)) {
    set = set.filter((i) => i.sev === "low");
    filters.push("sév. faible");
  }

  // filtre région / lieu
  const regionFilter = ctx.incidents.find((i) => {
    const p = INCIDENT_PLACE[i.id] ?? i.region;
    return nq.includes(norm(p)) || nq.includes(norm(i.region.split("-")[0]));
  });
  if (regionFilter) {
    const rKey = regionFilter.region;
    set = set.filter((i) => i.region === rKey);
    filters.push(`région ${rKey}`);
  }

  set.sort((a, b) => (ST_LABEL[a.st] === ST_LABEL[b.st] ? (b.sev === "high" ? 1 : -1) : (a.st === "closed" ? 1 : -1)));
  const rows = set.map(incidentRow);
  const text = set.length === 0
    ? `Aucun incident ne correspond aux critères (${filters.join(", ") || "aucun critère"}).`
    : [
        `${set.length} incident(s) correspondant${filters.length ? " — " + filters.join(", ") : ""} :`,
        ...set.slice(0, 8).map((i) => {
          const placeName = INCIDENT_PLACE[i.id] ?? i.region;
          return `• ${i.id} · ${SEV_LABEL[i.sev].toUpperCase()} · ${ST_LABEL[i.st]} · ${i.titre} (${placeName}, ${i.time})${
            i.casualties ? ` — ${i.casualties.dead}D/${i.casualties.injured}B/${i.casualties.missing}?` : ""
          }`;
        }),
        ...(set.length > 8 ? [`… et ${set.length - 8} supplémentaire(s).`] : []),
      ].join("\n");
  return {
    intent: "incidents_list",
    layer1: `liste incidents : filtres ${filters.join(",") || "aucun"}`,
    text,
    incidents: rows.slice(0, 10),
    stats: {
      open: set.filter((s) => s.st === "open").length,
      prog: set.filter((s) => s.st === "prog").length,
      closed: set.filter((s) => s.st === "closed").length,
      high: set.filter((s) => s.sev === "high").length,
      medium: set.filter((s) => s.sev === "medium").length,
      low: set.filter((s) => s.sev === "low").length,
    },
    suggestions: [
      "Quel est le détail de INC-2607 ?",
      "Montre-moi les incidents en sévérité élevée",
      "Situation globale",
    ],
  };
}

function globalOverview(_q: string, ctx: AiContext): AiAnswer {
  const s = ctx.dashStats ?? null;
  const orsec = ctx.orsec;
  const active = ctx.incidents.filter((i) => !i.archived);
  const openSt = active.filter((i) => i.st === "open").length;
  const progSt = active.filter((i) => i.st === "prog").length;
  const high = active.filter((i) => i.sev === "high").length;
  const mov = ctx.movements;
  const inTransit = mov.filter((m) => m.progress < 100).length;
  const delayed = mov.filter((m) => m.delayMin > 0).length;
  const hospitals = ctx.hospitals ?? [];
  const milHosps = hospitals.filter((h) => h.kind === "mil");
  const avgHospOcc = milHosps.length ? Math.round(milHosps.reduce((a, h) => a + (h.lits ? (h.occ / h.lits) * 100 : 0), 0) / milHosps.length) : 0;
  const avgHospRea = milHosps.length ? Math.round(milHosps.reduce((a, h) => a + (h.rea ? (h.reaOcc / h.rea) * 100 : 0), 0) / milHosps.length) : 0;
  const units = ctx.units;
  const uReady = units.filter((u) => u.dispo === "ready").length;
  const uDeployed = units.filter((u) => u.dispo === "deployed").length;
  const avgR = units.length ? Math.round(units.reduce((a, u) => a + u.readiness, 0) / units.length) : 0;
  const quakes = ctx.quakes ?? [];
  const quakeHigh = quakes.filter((q) => q.mag >= 4.5).length;
  const eqCrit = ctx.equipment.filter((e) => e.stock <= e.threshold || e.cond === "oos").length;

  const sections = [
    `📋 VUE GLOBALE — ARGOS · ${new Date().toLocaleString("fr-FR", { hour12: false })}`,
    ``,
    `INCIDENTS · ${active.length} actifs (${openSt} ouvertes, ${progSt} en cours) · ${high} sévérité HIGH`,
    ...active.slice(0, 5).map((i) => `  • ${i.id} ${SEV_LABEL[i.sev].toUpperCase()} ${i.titre} (${INCIDENT_PLACE[i.id] ?? i.region})`),
    (active.length > 5 ? `    … et ${active.length - 5} autres.` : ""),
    ``,
    `BILAN HUMAIN · ORSEC niveau ${orsec.planLevel} (activé ${orsec.activatedAt})`,
    `  Décès ${orsec.casualties.dead} · Blessés ${orsec.casualties.injured} · Disparus ${orsec.casualties.missing} · Secourus ${orsec.casualties.rescued}`,
    s?.casualties ? `  Stats API — Décès ${s.casualties.dead} · Blessés ${s.casualties.injured} · Disparus ${s.casualties.missing} · Secourus ${s.casualties.rescued}` : "",
    ``,
    `SANTÉ (réseau militaire · ${milHosps.length} établissements)`,
    `  Occupation moyenne lits : ${avgHospOcc}% · Occupation moyenne REA : ${avgHospRea}% · Charge ORSEC globale ${orsec.hospitalLoad}%`,
    ``,
    `UNITÉS FAR (${units.length})`,
    `  Prêtes ${uReady} · Déployées ${uDeployed} · En attente ${units.length - uReady - uDeployed} · Readiness moyenne ${avgR}%`,
    ``,
    `LOGISTIQUE & MOUVEMENTS`,
    `  Convois en cours : ${inTransit} · En retard : ${delayed} · Équipements sous seuil / HS : ${eqCrit}`,
    ``,
    `RISQUES EXOGÈNES (flux souverains)`,
    `  Séismes ≥ M4.5 détectés : ${quakeHigh} · Abris actifs : ${orsec.sheltersActive}`,
    ``,
    s?.evolution && s.evolution.length ? `TENDANCES 30 j (API /stats) — ouvert/fermé derniers jours :` : "",
    ...(s?.evolution?.slice(-5).map((d) => `  ${d.d} · ouverts ${d.opened} · fermés ${d.closed}`) ?? []),
  ].filter(Boolean);

  return {
    intent: "global_overview",
    layer1: "synthèse multi-domaines : incidents, ORSEC, hopitaux, unités, mouvements, équipements, sismologie, évolution 30 j",
    text: sections.join("\n"),
    incidents: active.map(incidentRow).slice(0, 6),
    hospitals: hospitals.filter((h) => h.kind === "mil").map((h) => hospitalRow(h)),
    stats: {
      open: openSt, prog: progSt, closed: s?.status?.closed ?? 0,
      high, medium: active.filter((i) => i.sev === "medium").length, low: active.filter((i) => i.sev === "low").length,
      dead: orsec.casualties.dead, injured: orsec.casualties.injured, missing: orsec.casualties.missing, rescued: orsec.casualties.rescued,
      unitsReady: uReady, unitsDeployed: uDeployed, avgReadiness: avgR,
      items: [
        { label: "Incidents actifs", value: active.length, level: Math.min(1, active.length / 12) },
        { label: "Dont sév. HIGH", value: high, level: Math.min(1, high / 4) },
        { label: "Décès (ORSEC)", value: orsec.casualties.dead, level: Math.min(1, orsec.casualties.dead / 3000) },
        { label: "Blessés", value: orsec.casualties.injured, level: Math.min(1, orsec.casualties.injured / 6000) },
        { label: "Unités prêtes", value: uReady, level: 1 - Math.min(1, uDeployed / Math.max(1, units.length)) },
        { label: "Occup. hôp. moyen", value: `${avgHospOcc}%`, level: avgHospOcc / 100 },
        { label: "Convois en cours", value: inTransit, level: Math.min(1, inTransit / 10) },
        { label: "Séismes ≥ M4.5", value: quakeHigh, level: Math.min(1, quakeHigh / 5) },
      ],
    },
    suggestions: [
      "Détail de l'incident INC-2607",
      "Montre les hôpitaux les plus proches d'Al Haouz",
      "Quelles unités mobiliser en moins d'une heure pour INC-2607 ?",
      "Rapport de situation (SITREP)",
    ],
  };
}

function trends(_q: string, ctx: AiContext): AiAnswer {
  const s = ctx.dashStats;
  const active = ctx.incidents.filter((i) => !i.archived);
  const sev = s?.severity ?? {
    high: active.filter((i) => i.sev === "high").length,
    medium: active.filter((i) => i.sev === "medium").length,
    low: active.filter((i) => i.sev === "low").length,
  };
  const st = s?.status ?? {
    open: active.filter((i) => i.st === "open").length,
    prog: active.filter((i) => i.st === "prog").length,
    closed: active.filter((i) => i.st === "closed").length,
  };
  const u = s?.units ?? { total: ctx.units.length, deployed: ctx.units.filter((u) => u.dispo === "deployed").length, ready: ctx.units.filter((u) => u.dispo === "ready").length, avgReadiness: ctx.units.length ? Math.round(ctx.units.reduce((a, x) => a + x.readiness, 0) / ctx.units.length) : 0 };
  const hospOcc = s?.hospitals ?? [];

  const totalByRegion = new Map<string, number>();
  active.forEach((i) => totalByRegion.set(i.region, (totalByRegion.get(i.region) ?? 0) + 1));
  const regions = [...totalByRegion.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const lines: string[] = [
    "ANALYSE DES TENDANCES & ÉVOLUTIONS",
    `Répartition par sévérité (sur ${sev.high + sev.medium + sev.low} incidents) :`,
    `  HIGH ${sev.high} · MEDIUM ${sev.medium} · LOW ${sev.low}`,
    `Répartition par statut : OUVERTES ${st.open} · EN COURS ${st.prog} · FERMÉES ${st.closed}`,
    `Posture des unités (${u.total}) : prêtes ${u.ready} · déployées ${u.deployed} · readiness moyenne ${u.avgReadiness}%`,
    `Concentration géographique (TOP 5 régions) :`,
    ...regions.map(([r, n]) => `  • ${r} — ${n} incident(s)`),
  ];
  if (hospOcc.length) {
    lines.push(`Saturation hospitalière TOP 3 (charge lits %) :`);
    [...hospOcc].sort((a, b) => b.occPct - a.occPct).slice(0, 3).forEach((h) =>
      lines.push(`  • ${h.nom} (${h.ville}) · lits ${h.occPct}% · REA ${h.icuPct}%`),
    );
  }
  if (s?.evolution?.length) {
    lines.push(`Évolution 30 j (ouverts / fermés par jour) :`);
    const last = s.evolution.slice(-7);
    last.forEach((d) => lines.push(`  ${d.d} · +${d.opened} / -${d.closed}`));
    // delta net sur la période
    const tot = last.reduce((a, d) => ({ opened: a.opened + d.opened, closed: a.closed + d.closed }), { opened: 0, closed: 0 });
    lines.push(`  ▷ 7 derniers j : +${tot.opened} ouverts · -${tot.closed} fermés · solde net ${tot.opened - tot.closed >= 0 ? "+" : ""}${tot.opened - tot.closed}`);
  }
  return {
    intent: "trends",
    layer1: "tendances : sévérité × statut × posture unités × régions × saturation hôpital × évolution 30 j",
    text: lines.join("\n"),
    stats: {
      open: st.open, prog: st.prog, closed: st.closed,
      high: sev.high, medium: sev.medium, low: sev.low,
      unitsReady: u.ready, unitsDeployed: u.deployed, avgReadiness: u.avgReadiness,
    },
    hospitals: hospOcc.slice(0, 5).map((h) => ({ id: h.id, nom: h.nom, ville: h.ville, kind: h.kind, occPct: h.occPct, icuPct: h.icuPct, lits: 0, rea: 0 })),
    suggestions: [
      "Situation globale",
      "Liste les incidents en sévérité élevée",
      "Quels hôpitaux sont saturés ?",
    ],
  };
}

function casualtiesSummary(q: string, ctx: AiContext): AiAnswer {
  const b = ctx.orsec.casualties;
  const target = resolveTarget(q, ctx.incidents);
  if (target?.casualties) {
    const place = INCIDENT_PLACE[target.id] ?? target.region;
    const c = target.casualties;
    return {
      intent: "casualties_summary",
      layer1: `bilan humain ciblé sur ${target.id} (${place})`,
      text: `BILAN HUMAIN · ${target.id} — ${target.titre} (${place})\nDécès : ${c.dead}\nBlessés : ${c.injured}\nDisparus : ${c.missing}\n\nRéférentiel ORSEC global — décès ${b.dead}, blessés ${b.injured}, disparus ${b.missing}, secourus ${b.rescued}.`,
      stats: { dead: c.dead, injured: c.injured, missing: c.missing, rescued: b.rescued },
      incidents: [incidentRow(target)],
    };
  }
  // Agrégat sur tous les incidents
  const sum = ctx.incidents.filter((i) => i.casualties).reduce((a, i) => ({
    dead: a.dead + (i.casualties?.dead ?? 0),
    injured: a.injured + (i.casualties?.injured ?? 0),
    missing: a.missing + (i.casualties?.missing ?? 0),
  }), { dead: 0, injured: 0, missing: 0 });
  const withCas = ctx.incidents.filter((i) => i.casualties).map(incidentRow);
  return {
    intent: "casualties_summary",
    layer1: "bilan humain agrégé : ORSEC + somme des incidents déclarants + détail par incident",
    text: [
      "BILAN HUMAIN GLOBAL (sources croisées)",
      `Référentiel ORSEC : décès ${b.dead} · blessés ${b.injured} · disparus ${b.missing} · secourus ${b.rescued}`,
      `Somme des incidents (${withCas.length} incidents rapportent un bilan) : décès ${sum.dead} · blessés ${sum.injured} · disparus ${sum.missing}`,
      ...withCas.slice(0, 6).map((r) => `  • ${r.id} — ${r.region} : D${r.casualties?.dead ?? 0} / B${r.casualties?.injured ?? 0} / ?${r.casualties?.missing ?? 0}`),
    ].join("\n"),
    stats: { dead: b.dead, injured: b.injured, missing: b.missing, rescued: b.rescued },
    incidents: withCas.slice(0, 8),
    suggestions: ["Situation globale", "Détail INC-2607"],
  };
}

function hospitalsStatus(_q: string, ctx: AiContext): AiAnswer {
  const hospitals = ctx.hospitals ?? [];
  const mil = hospitals.filter((h) => h.kind === "mil");
  const civ = hospitals.filter((h) => h.kind?.startsWith("civ"));
  const rows = [...mil, ...civ].map((h) => hospitalRow(h));
  rows.sort((a, b) => b.occPct - a.occPct);
  const avg = (arr: AiHospitalRow[]) => arr.length ? Math.round(arr.reduce((a, h) => a + h.occPct, 0) / arr.length) : 0;
  const avgRea = (arr: AiHospitalRow[]) => arr.length ? Math.round(arr.reduce((a, h) => a + h.icuPct, 0) / arr.length) : 0;
  const milRows = mil.map((h) => hospitalRow(h));
  const civRows = civ.map((h) => hospitalRow(h));
  const saturated = rows.filter((h) => h.occPct >= 90 || h.icuPct >= 95);
  const litsTot = rows.reduce((s, h) => s + h.lits, 0);
  const litsOcc = rows.reduce((s, h) => s + Math.round(h.lits * h.occPct / 100), 0);
  const litsDispo = Math.max(0, litsTot - litsOcc);
  const reaTot = rows.reduce((s, h) => s + h.rea, 0);
  const reaOcc = rows.reduce((s, h) => s + Math.round(h.rea * h.icuPct / 100), 0);
  const reaDispo = Math.max(0, reaTot - reaOcc);
  const lines = [
    `ÉTAT DU RÉSEAU HOSPITALIER · ${hospitals.length} établissements · ${litsTot.toLocaleString("fr-FR")} lits au total · **${litsDispo.toLocaleString("fr-FR")} lits disponibles** (${litsTot ? Math.round(litsDispo * 100 / litsTot) : 0}% marge) · REA totale : ${reaTot} · REA libres **${reaDispo}**`,
    `Militaire (${mil.length}) : occ. moyenne ${avg(milRows)}% · REA moyenne ${avgRea(milRows)}%`,
    civ.length ? `Civil (${civ.length}) : occ. moyenne ${avg(civRows)}% · REA moyenne ${avgRea(civRows)}%` : "",
    saturated.length ? `Établissements sous tension (≥90% occupation lits ou ≥95% REA) : ${saturated.length}` : "Aucun établissement sous tension.",
    ...saturated.map((h) => `  ⚠ ${h.nom} (${h.ville}) · occ ${h.occPct}% · REA ${h.icuPct}% · lits libres ${Math.max(0, h.lits - Math.round(h.occPct * h.lits / 100))} · REA libres ${Math.max(0, h.rea - Math.round(h.icuPct * h.rea / 100))}`),
    rows.length ? `TOP 8 — taux lits disponibles (du PLUS saturé au MOINS saturé) — chaque établissement transmis dans JSON pour réponse détaillée :` : "",
    ...rows.slice(0, 8).map((h) => `  • ${h.nom} (${h.ville}) · occ ${h.occPct}% (${Math.max(0, h.lits - Math.round(h.occPct * h.lits / 100))} lits libres sur ${h.lits}) · REA ${h.icuPct}% (${Math.max(0, h.rea - Math.round(h.icuPct * h.rea / 100))} REA libres sur ${h.rea})`),
  ].filter(Boolean);
  return {
    intent: "hospitals_status",
    layer1: "état réseau hospitalier : militaire + civil, occupation / REA, établissements sous tension",
    text: lines.join("\n"),
    hospitals: rows.slice(0, Math.max(50, rows.length)),
    stats: {
      totalHospitals: hospitals.length,
      totalLits: litsTot,
      litsDisponibles: litsDispo,
      occMoyennePct: avg(rows),
      totalRea: reaTot,
      reaDisponibles: reaDispo,
      etablissementsSousTension: saturated.length,
    },
    suggestions: [
      "Hôpitaux les plus proches d'Al Haouz",
      "Croise hôpitaux + incident INC-2607",
    ],
  };
}

function hospitalsNearest(q: string, ctx: AiContext): AiAnswer {
  const target = resolveTarget(q, ctx.incidents);
  if (!target) {
    return {
      intent: "hospitals_nearest",
      layer1: "hôpitaux les plus proches — cible non résolue",
      text: "Précisez une zone (ex. Al Haouz, Ourika) ou un incident (ex. INC-2607) pour classer les hôpitaux par proximité.",
    };
  }
  const hospitals = ctx.hospitals ?? [];
  const rows = hospitals.map((h) => hospitalRow(h, target.ll)).sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
  const place = INCIDENT_PLACE[target.id] ?? target.region;
  const top6 = rows.slice(0, 6);
  return {
    intent: "hospitals_nearest",
    layer1: `hôpitaux les plus proches de ${place} (${target.id}), distance/ETA + occupation`,
    text: [
      `HÔPITAUX LES PLUS PROCHES de ${place} — ${target.id} · ${target.titre}`,
      ...top6.map((h) => `  • ${h.nom} (${h.ville}${h.kind ? ` · ${h.kind}` : ""}) — ${h.distanceKm} km · ETA ${h.etaMin} min · occ ${h.occPct}% · REA ${h.icuPct}% · lits libres ${Math.max(0, h.lits - Math.round(h.occPct * h.lits / 100))}, REA libres ${Math.max(0, h.rea - Math.round(h.icuPct * h.rea / 100))}`),
    ].join("\n"),
    hospitals: top6,
    incidents: [incidentRow(target)],
    suggestions: [
      "Quelles unités médicales pour INC-2607 ?",
      "Situation globale",
    ],
  };
}

function unitsStatus(_q: string, ctx: AiContext): AiAnswer {
  const us = ctx.units;
  const uReady = us.filter((u) => u.dispo === "ready");
  const uDep = us.filter((u) => u.dispo === "deployed");
  const uStd = us.filter((u) => u.dispo === "standby");
  const avgR = us.length ? Math.round(us.reduce((a, u) => a + u.readiness, 0) / us.length) : 0;
  const lowR = us.filter((u) => u.readiness < 70);
  const byRegion = new Map<string, number>();
  us.forEach((u) => byRegion.set(u.ville, (byRegion.get(u.ville) ?? 0) + 1));
  const lines = [
    `POSTURE DES UNITÉS · ${us.length} unités référencées`,
    `Prêtes : ${uReady.length} · Déployées : ${uDep.length} · En attente : ${uStd.length} · Readiness moyenne : ${avgR}%`,
    lowR.length ? `Unités sous-readiness (<70%) : ${lowR.length}` : "Toutes les unités ≥70% readiness.",
    ...lowR.map((u) => `  • ${u.nom} (${u.ville}) · readiness ${u.readiness}% · statut ${DISPO_LABEL[u.dispo]}`),
    `Répartition par ville :`,
    ...[...byRegion.entries()].sort((a, b) => b[1] - a[1]).map(([v, n]) => `  • ${v} : ${n} unité(s)`),
    `Détail des unités (readiness décroissant) :`,
    ...[...us].sort((a, b) => b.readiness - a.readiness).map((u) => {
      const caps = UNIT_CAPS[u.id]?.map((c) => CAP_LABELS[c]).join(", ") || "—";
      return `  • ${u.id} ${u.nom} (${u.ville}) · ${DISPO_LABEL[u.dispo]} · readiness ${u.readiness}% · eff. ${u.eff} · ${caps}`;
    }),
  ];
  return {
    intent: "units_status",
    layer1: "posture unités : dispo × readiness × répartition géographique × capacités",
    text: lines.join("\n"),
    units: [...us].sort((a, b) => b.readiness - a.readiness).map((u) => ({
      id: u.id, nom: u.nom, ville: u.ville, etaMin: u.readiness, caps: (UNIT_CAPS[u.id] ?? []).map((c) => CAP_LABELS[c]), dispo: DISPO_LABEL[u.dispo], within: true,
    })),
    stats: { unitsReady: uReady.length, unitsDeployed: uDep.length, avgReadiness: avgR },
  };
}

function crossAnalysis(q: string, ctx: AiContext): AiAnswer {
  const target = resolveTarget(q, ctx.incidents);
  if (!target) {
    return {
      intent: "cross_analysis",
      layer1: "analyse croisée — cible non résolue",
      text: "Précisez une zone ou un incident pour croiser : incidents × unités × hôpitaux × équipements × météo/séismes.",
    };
  }
  const place = INCIDENT_PLACE[target.id] ?? target.region;
  const hospitals = ctx.hospitals ?? [];
  const quakes = ctx.quakes ?? [];
  // Unités top
  const unitRecs = recommend(needFromIncident(target), ctx.units).filter((r) => !r.excluded).slice(0, 4);
  // Hôpitaux proches
  const hops = hospitals.map((h) => hospitalRow(h, target.ll)).sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999)).slice(0, 4);
  // Équipements rattachés aux unités les mieux classées
  const topUnitIds = new Set(unitRecs.map((r) => r.unit.id));
  const inv = ctx.equipment.filter((e) => {
    const uid = UNIT_CODE[e.unit];
    return uid ? topUnitIds.has(uid) : false;
  }).slice(0, 6);
  // Quake context
  const nearQuakes = quakes.filter((qk) => haversineKm([qk.lon, qk.lat], target.ll) < 100).slice(0, 3);

  // Bloc structuré « cross » avec décomposition de score et regroupement inventaire
  const incRow: AiIncidentRow & { lieu?: string; coords?: [number, number] } = {
    ...incidentRow(target),
    lieu: place,
    coords: target.ll,
  };
  const recommendedUnits: AiCrossUnitRec[] = unitRecs.map((r) => ({
    unit: { id: r.unit.id, nom: r.unit.nom, ville: r.unit.ville },
    score: r.score,
    timeScore: r.breakdown.travel,
    capScore: r.breakdown.capability,
    regionScore: r.breakdown.readiness,
    dispoScore: r.breakdown.availability,
  }));
  const unitEquipment: AiCrossUnitEquip[] = unitRecs
    .map((r) => {
      const uid = Object.entries(UNIT_CODE).find(([, v]) => v === r.unit.id)?.[0];
      const list = uid
        ? ctx.equipment.filter((e) => e.unit === uid).slice(0, 4).map((e) => ({ desig: e.desig, stock: e.stock, cond: COND_LABEL[e.cond] }))
        : [];
      return { unitName: r.unit.nom, equipment: list };
    })
    .filter((x) => x.equipment.length > 0);

  const lines: string[] = [
    `ANALYSE CROISÉE · ${target.id} — ${target.titre} (${place}) · sév. ${SEV_LABEL[target.sev]} · ${ST_LABEL[target.st]}`,
    `Incident · type ${target.type} · déclaré ${target.time}${target.casualties ? ` · bilan D${target.casualties.dead}/B${target.casualties.injured}/?${target.casualties.missing}` : ""}`,
    ``,
    `➤ UNITÉS RECOMMANDÉES (moteur reco Couche 1) :`,
    ...unitRecs.map((r, i) => {
      const occ = r.breakdown;
      return `  ${i + 1}. ${r.unit.nom} · score ${r.score}/100 (t${occ.travel}/c${occ.capability}/r${occ.readiness}/d${occ.availability}) · ETA ${r.etaMin} min · ${r.matchedCaps.map((c) => CAP_LABELS[c]).join("+") || "—"}`;
    }),
    ``,
    `➤ HÔPITAUX LES PLUS PROCHES :`,
    ...hops.map((h) => `  • ${h.nom} (${h.ville}) · ${h.distanceKm} km / ${h.etaMin} min · occ ${h.occPct}% · REA ${h.icuPct}% · lits libres ${Math.max(0, h.lits - Math.round(h.occPct * h.lits / 100))}`),
    ``,
    inv.length ? `➤ INVENTAIRE lié aux unités recommandées :` : "➤ Aucun équipement lié trouvé pour les unités proposées.",
    ...inv.map((e) => `  • ${e.desig} · stock ${e.stock}/${e.threshold} · unité ${e.unit} · état ${COND_LABEL[e.cond]}`),
    ``,
    nearQuakes.length ? `➤ CONTEXTE SISMIQUE (<100 km) :` : "➤ Aucun séisme significatif dans un rayon de 100 km.",
    ...nearQuakes.map((qk) => `  • M${qk.mag.toFixed(1)} · ${qk.region} · profondeur ${qk.depth} km · ${new Date(qk.time).toLocaleString("fr-FR", { hour12: false })}`),
  ];
  return {
    intent: "cross_analysis",
    layer1: `cross-data ${target.id} : reco unités × hôpitaux proches × inventaire unités × séismes <100 km`,
    text: lines.join("\n"),
    incidents: [incidentRow(target)],
    units: unitRecs.map((r) => ({ id: r.unit.id, nom: r.unit.nom, ville: r.unit.ville, etaMin: r.etaMin, caps: r.matchedCaps.map((c) => CAP_LABELS[c]), dispo: DISPO_LABEL[r.unit.dispo], within: true })),
    hospitals: hops,
    topEquip: inv.map((e) => ({ id: e.id, desig: e.desig, cat: e.cat, stock: e.stock, cond: COND_LABEL[e.cond], unit: e.unit, seuil: e.threshold })),
    quakes: nearQuakes.map((qk) => ({ id: qk.id, region: qk.region, mag: qk.mag, depth: qk.depth, time: qk.time })),
    cross: {
      incident: incRow,
      recommendedUnits,
      hospitals: hops,
      unitEquipment,
      quakes: nearQuakes,
    },
    suggestions: [
      "Envoyer une unité médicale en moins de 45 min",
      "Hôpitaux sous tension dans la région",
      "Rédige le SITREP",
    ],
  };
}

function orsecSummary(_q: string, ctx: AiContext): AiAnswer {
  const b = ctx.orsec;
  const lines = [
    `TABLEAU ORSEC · Niveau ${b.planLevel} activé le ${b.activatedAt}`,
    `Bilan humain consolidé : Décès ${b.casualties.dead} · Blessés ${b.casualties.injured} · Disparus ${b.casualties.missing} · Secourus ${b.casualties.rescued}`,
    `Moyens engagés : ${b.units.engaged} unités (${b.units.available} dispo) · ${b.personnel.engaged} personnels · ${b.vehicles.engaged} véhicules`,
    `Système de santé : charge hospitalière ${b.hospitalLoad}% · Abris actifs ${b.sheltersActive}`,
    `Organisation de la chaîne de commandement :`,
    ...b.org.map((o) => `  • ${o.role} : ${o.name}`),
    `Décisions récentes (${b.decisions.length}) :`,
    ...b.decisions.slice(-5).map((d) => `  • ${d.time} · ${d.author} : ${d.decision}`),
    `Personnes de permanence :`,
    ...b.duty.map((d) => `  • ${d.role} : ${d.name}`),
  ];
  return {
    intent: "orsec_summary",
    layer1: "synthèse ORSEC : niveau, bilan, moyens, commandement, décisions, permanence",
    text: lines.join("\n"),
    stats: {
      dead: b.casualties.dead, injured: b.casualties.injured, missing: b.casualties.missing, rescued: b.casualties.rescued,
      unitsDeployed: b.units.engaged, unitsReady: b.units.available,
    },
    suggestions: ["Situation globale", "SITREP", "Tendances incidents"],
  };
}

function seismicStatus(q: string, ctx: AiContext): AiAnswer {
  const nq = norm(q);

  // --- 🌟 RÈGLE RÉGION (INVERSÉE PAR RAPPORT À AVANT) :
  // DÉFAUT = "world" (MONDIAL, toutes régions confondues).
  // SEULEMENT SI user dit explicitement MAROC → région = morocco.
  const explicitMorocco = /\b(au\s+maroc|maroc|marocaine|nationale|national|locale|local|au\s+pays|dans\s+le\s+pays|far|interieur|intérieur|territoire\s+national)\b/.test(nq);
  const region = explicitMorocco ? "morocco" : "world";

  // --- 🌟 SEUIL MAGNITUDE PAR DÉFAUT = 2.0
  let minMag: number;
  if (/\b(majeur|majeurs|tres\s+fort|tres\s+forts|superieur|supérieur|>=?\s*5|≥\s*5)\b/.test(nq)) {
    minMag = 5;
  } else if (/\b(>=?\s*4|≥\s*4|moyen|modere|modéré|significatif)\b/.test(nq)) {
    minMag = 4;
  } else if (explicitMorocco) {
    minMag = 3;
  } else {
    minMag = 2;
  }

  // --- 🌟 TRI : DERNIER (date DESC) ou PLUS FORT (mag DESC) ?
  const temporalCue = /\b(dernier|demier|derniers|demiers|plus\s+recent|plus\s+récent|recente|récente|actualite|actualité|actualités|actualites|en\s+ce\s+moment|ce\s+jour|aujourd.?hui|24h|48h|semaine|7\s*j|jours?|séisme\s+récent|seisme\s+recent)\b/.test(nq);
  const sortByTime = temporalCue;

  // --- 🌟 SINGULIER VS PLURIEL : NOMBRE D'ÉVÉNEMENTS À AFFICHER DANS LE TEXTE COUCHE1
  // User demande explicitement UN SEUL :
  //   • 1 seul séisme / un seul / juste un / unique / seulement 1 / que 1 / que un
  //   • OU : mot "séisme" SANS "s" final (singulier) ET il y a un mot "dernier/le plus récent"
  const singleCue = /\b(1\s*seul|un\s+seul|juste\s+un|seulement\s+1|seulement\s+un|que\s+1|que\s+un|unique|juste\s+1|seulement|le\s+plus\s+recent|le\s+plus\s+récent|le\s+dernier|le\s+demier)\b/.test(nq)
    // Singulier grammatical fort : "le dernier séisme" / "le plus récent séisme" / "le séisme le plus récent"
    || /\ble\s+(dernier|demier|plus\s+récent|plus\s+recent|seul|unique)\s+(séisme|seisme|evenement|événement|tremblement)\b/.test(nq)
    || /\b(séisme|seisme|tremblement)\s+(le\s+)?(dernier|demier|plus\s+récent|plus\s+recent|seul|unique)\b/.test(nq)
    // Plus le mot "singulier" ou pas de "s" à la fin de la requête (trop fragile → ignoré).
    ;
  // Compte le nombre d'occurrences de "séismes" / "seismes" (PLURIEL)
  const pluralCue = /\b(séismes|seismes|evenements|événements|derniers|demiers|plusieurs|nombre|combien|liste|tous|toutes|les\s+(\d+|quelques|plusieurs))\b/.test(nq);

  // Nombre final d'affichage dans Couche1 :
  let desiredCount: number;
  if (singleCue) {
    desiredCount = 1;
  } else if (/\b(top|meilleurs|pire|pires|plus\s+forts|plus\s+faibles)\s+\d+/.test(nq)) {
    const digits = nq.match(/\b\d+\b/);
    desiredCount = Math.min(20, Math.max(1, digits?.length ? parseInt(digits[0] ?? "3", 10) : 3));
  } else if (pluralCue) {
    desiredCount = sortByTime ? 5 : 8;
  } else if (sortByTime) {
    // Tri temporel SANS singulier/pluriel explicite:
    // SI user a écrit "séisme" SANS "s" = on essaie 1, sinon on prend 3
    const nqRaw = q.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const hasSingularNoun = /(^|[^a-z])(seisme|tremblement)([^a-z]|$)/i.test(nqRaw);
    desiredCount = hasSingularNoun ? 1 : 3;
  } else {
    desiredCount = 5;
  }

  const quakes = ctx.quakes ?? [];
  let list = quakes.filter((qk) => (region === "morocco" ? (qk.lon >= -14 && qk.lon <= -1 && qk.lat >= 21 && qk.lat <= 36) : true));
  list = list.filter((qk) => qk.mag >= minMag);
  if (sortByTime) {
    list.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  } else {
    list.sort((a, b) => b.mag - a.mag);
  }
  const top = list.slice(0, desiredCount);

  // --- 🌟 ENRICHISSEMENT LLM (brut non filtré mag/région)
  const llmVisible = [...quakes]
    .sort((a, b) => b.mag - a.mag)
    .slice(0, 12)
    .map((qk) => ({ id: qk.id, region: qk.region, mag: qk.mag, depth: qk.depth, time: qk.time }));

  // --- 🌟 TEXTE COUCHE1
  // Si SINGULIER (desiredCount === 1) et qu'il y a un événement → RÉPONSE 1 SEUL ÉVÉNEMENT SANS LISTE À PUCES
  const lines: string[] = [];
  if (desiredCount === 1 && top.length === 1) {
    const qk = top[0];
    const t = new Date(qk.time).toLocaleString("fr-FR", { hour12: false });
    lines.push(
      `DERNIER SÉISME · région = ${region} · seuil M ≥ ${minMag} · 1 événement (le ${sortByTime ? "plus récent" : "plus fort"})`,
    );
    lines.push(
      `  M${qk.mag.toFixed(1)}${qk.magType ? ` (${qk.magType})` : ""} — ${qk.region} · profondeur ${qk.depth} km · ${t}${qk.agency ? ` · agence ${qk.agency}` : ""}`,
    );
  } else {
    lines.push(
      `VEILLE SISMIQUE · région = ${region} · seuil M ≥ ${minMag} · ordre = ${sortByTime ? "plus récent d'abord" : "magnitude décroissante"} · ${list.length} événements · affichés ${top.length}`,
    );
    lines.push(
      ...top.map((qk) => {
        const t = new Date(qk.time).toLocaleString("fr-FR", { hour12: false });
        return `  • M${qk.mag.toFixed(1)}${qk.magType ? ` (${qk.magType})` : ""} · ${qk.region} · ${qk.depth} km · ${t}${qk.agency ? ` · agence ${qk.agency}` : ""}`;
      }),
    );
    if (!top.length) lines.push(`  Aucun événement au-dessus du seuil M≥${minMag} dans la zone ${region}.`);
  }

  return {
    intent: "seismic_status",
    layer1: `séismes ${region} M≥${minMag}, ${sortByTime ? "tri par temps décroissant" : "tri par magnitude décroissante"}, affichés ${top.length}/${list.length}${singleCue ? " (singulier)" : ""}`,
    text: lines.filter(Boolean).join("\n"),
    quakes: llmVisible.length ? llmVisible : top.map((qk) => ({ id: qk.id, region: qk.region, mag: qk.mag, depth: qk.depth, time: qk.time })),
    suggestions: [
      "Situation globale",
      explicitMorocco ? "Activité sismique mondiale" : "Séismes au Maroc",
      ...(top.length ? [`Analyse croisée ${top[0].id.startsWith("INC") ? top[0].id : "INC-2607"}`] : ["Analyse croisée avec INC-2607"]),
    ],
  };
}

function equipmentSearch(q: string, ctx: AiContext): AiAnswer {
  const nq = norm(q);
  let rows = ctx.equipment.map((e) => ({ e, score: 0 }));
  if (parseEquipCategory(q)) {
    const cat = parseEquipCategory(q)!;
    rows = rows.filter((r) => norm(r.e.cat).includes(norm(cat)));
  }
  rows = rows.map((r) => {
    let sc = 0;
    const nd = norm(r.e.desig);
    const nc = norm(r.e.cat);
    const nu = norm(r.e.unit);
    if (nd.includes(nq)) sc += 8;
    if (nc.includes(nq)) sc += 5;
    if (nu.includes(nq)) sc += 3;
    // mots-clés
    q.split(/\s+/).forEach((w) => {
      if (w.length < 3) return;
      const nw = norm(w);
      if (nd.includes(nw)) sc += 2;
      if (nc.includes(nw)) sc += 1;
    });
    return { ...r, score: sc };
  }).filter((r) => r.score > 0 || parseEquipCategory(q)).sort((a, b) => b.score - a.score);

  const top = rows.slice(0, 10).map((r) => r.e);
  const critical = top.filter((e) => e.stock <= e.threshold || e.cond === "oos");
  const text = top.length === 0
    ? `Aucun équipement ne correspond à « ${q.trim()} ». Rechercher par catégorie : Énergie, Campement, Médical, ou par désignation (ex. « groupe électrogène », « tente »).`
    : [
        `RECHERCHE ÉQUIPEMENT · ${rows.length} correspondances pour « ${q.trim()} » · affichage TOP ${top.length}`,
        critical.length ? `  ⚠ ${critical.length} sous seuil / HS :` : "  Stock / état conformes.",
        ...critical.map((e) => `    • ${e.desig} · stock ${e.stock}/${e.threshold} · état ${COND_LABEL[e.cond]} · unité ${e.unit}`),
        ...top.map((e) => `  • ${e.id} · ${e.desig} · cat. ${e.cat} · stock ${e.stock}/${e.threshold} · ${COND_LABEL[e.cond]} · rattaché à ${e.unit}`),
      ].join("\n");
  return {
    intent: "equipment_search",
    layer1: `recherche équipement "${q.trim()}" (catégorie + désignation + unité) + alerte stock/état`,
    text,
    topEquip: top.map((e) => ({ id: e.id, desig: e.desig, cat: e.cat, stock: e.stock, cond: COND_LABEL[e.cond], unit: e.unit })),
    suggestions: [
      "Unités qui détiennent cet équipement",
      "Situation globale",
    ],
  };
}

function help(_q: string, _ctx: AiContext): AiAnswer {
  return {
    intent: "help",
    layer1: "aide Copilot : intentions et exemples",
    text: "🤖 Copilot ARGOS — Assistant transversal de la plateforme. Je synthétise les incidents, unités, hôpitaux, ORSEC, logistique, sismologie.\n\nEssaie ces requêtes :\n  • Quelle est la situation actuelle ?\n  • Résume les incidents des 24 dernières heures\n  • Quelles zones sont les plus touchées ?\n  • Incidents près de Casablanca\n  • Incidents critiques (intervention prioritaire)",
    suggestions: [
      { label: "Situation actuelle", query: "Quelle est la situation actuelle ?", priority: "primary" as const },
      { label: "Résumé 24h", query: "Résume-moi les incidents des dernières 24 heures" },
      { label: "Incidents critiques", query: "Quels incidents nécessitent une intervention prioritaire ?" },
      { label: "Zones à risque", query: "Quelles zones présentent actuellement le plus de risques ?" },
      { label: "Évolution", query: "Quelle est l'évolution des incidents ?" },
      { label: "Près de Casablanca", query: "Quels incidents sont actuellement proches de Casablanca ?" },
    ],
  };
}

/** Stats globales (open/high/medium/...) issues de incidents. */
function getStats(ctx: AiContext): AiAnswerStats {
  const open = ctx.incidents.filter((i) => i.st === "open");
  const prog = ctx.incidents.filter((i) => i.st === "prog");
  const closed = ctx.incidents.filter((i) => i.st === "closed");
  const high = ctx.incidents.filter((i) => (sevRank[i.sev ?? "medium"] ?? 0) >= 2);
  const medium = ctx.incidents.filter((i) => (sevRank[i.sev ?? "medium"] ?? 0) === 1);
  const low = ctx.incidents.filter((i) => (sevRank[i.sev ?? "medium"] ?? 0) <= 0);
  return {
    open: open.length, prog: prog.length, closed: closed.length,
    high: high.length, medium: medium.length, low: low.length,
  };
}

// --- TEMPORAL (nouveaux §6.22) ------------------------------------------------

const sevRank: Record<string, number> = { critique: 3, high: 3, elevé: 2, moyen: 1, medium: 1, faible: 0, low: 0 };
const sevLabel = (s: string): "critique" | "élevé" | "moyen" | "faible" => {
  const n = norm(s);
  if (n === "critique" || n === "high") return "critique";
  if (n === "eleve" || n === "med" || n === "sever") return "élevé";
  if (n === "moyen" || n === "medium") return "moyen";
  return "faible";
};

function sevCounts(rows: { sev?: string }[]): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, r) => {
    const l = sevLabel(r.sev ?? "moyen");
    acc[l] = (acc[l] ?? 0) + 1;
    return acc;
  }, {});
}

/** Heure de déclaration en millis, depuis champ time (ISO) ou HH:MM + today. */
function incidentTs(ctx: AiContext, inc: AiContext["incidents"][number]): number {
  if (inc.time) {
    const ms = new Date(inc.time).getTime();
    if (!Number.isNaN(ms)) return ms;
    if (/^\d{1,2}:\d{2}/.test(inc.time)) {
      const [h, mm] = inc.time.split(":").map((n) => parseInt(n, 10) || 0);
      const d = new Date();
      d.setHours(h, mm, 0, 0);
      return d.getTime();
    }
  }
  return Date.now();
}

function windowIncidents(ctx: AiContext, predicate: (ts: number) => boolean): AiContext["incidents"] {
  return ctx.incidents.filter((i) => predicate(incidentTs(ctx, i)));
}

function toAiRow(i: AiContext["incidents"][number]): AiIncidentRow {
  return {
    id: i.id, titre: i.titre, region: i.region ?? "—",
    type: i.type ?? "—", sev: (sevLabel(i.sev ?? "medium") === "faible" ? "moyenne" : sevLabel(i.sev ?? "medium") === "moyen" ? "moyenne" : sevLabel(i.sev ?? "medium") === "élevé" ? "élevée" : "critique"),
    st: i.st === "prog" ? "en cours" : i.st === "closed" ? "fermé" : "ouvert",
    time: /^\d{4}-/.test(i.time ?? "")
      ? new Date(i.time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
      : (i.time ?? "—"),
    lieu: i.adresse, coords: i.ll,
    declared: i.time,
  };
}

/** Incidents survenus AUJOURD'HUI (minuit → maintenant). */
function todayIncidents(_q: string, ctx: AiContext): AiAnswer {
  const D = new Date(); const mid0 = new Date(D.getFullYear(), D.getMonth(), D.getDate(), 0, 0, 0).getTime();
  const list = windowIncidents(ctx, (ts) => ts >= mid0);
  const rows = list.map(toAiRow);
  const counts = sevCounts(list);
  const text =
    `📅 **Incidents survenus aujourd'hui** (${D.toLocaleDateString("fr-FR")}) :\n` +
    `• Total déclaré : **${rows.length}**\n` +
    `• Critique ${counts.critique ?? 0} · Élevé ${counts.élevé ?? 0} · Moyen ${counts.moyen ?? 0} · Faible ${counts.faible ?? 0}\n` +
    (rows.length ? rows.slice(0, 3).map((r) => `  ▸ ${r.id} · ${r.titre} · ${r.region} · ${r.sev}`).join("\n") : "Aucun incident documenté aujourd'hui.");
  return {
    intent: "today_incidents",
    layer1: `fenêtre temporelle aujourd'hui (${list.length} incidents)`,
    text,
    incidents: rows,
    stats: { ...getStats(ctx), open: rows.length, items: [
      { label: "Aujourd'hui total", value: rows.length, level: 2 },
    ]},
    cross: {
      temporal: {
        today: { count: rows.length, severity: counts, ids: rows.map(r => r.id) },
        last24h: last24hBucket(ctx),
      },
    },
    suggestions: [
      { label: "Résumé 24h", query: "Résume-moi les incidents des dernières 24 heures" },
      { label: "Comparer hier", query: "Compare la situation d'aujourd'hui avec celle d'hier", priority: "primary" as const },
    ],
  };
}

type TemporalBucket = { count: number; severity: Record<string, number>; ids: string[] };

function last24hBucket(ctx: AiContext): TemporalBucket {
  const D = Date.now(); const cutoff = D - 24 * 3600 * 1000;
  const list = windowIncidents(ctx, (ts) => ts >= cutoff);
  const sev = sevCounts(list);
  return { count: list.length, severity: sev, ids: list.map((i) => i.id) };
}

/** Résumé des 24 dernières heures. */
function last24hSummary(_q: string, ctx: AiContext): AiAnswer {
  const l24 = last24hBucket(ctx);
  const rows = ctx.incidents
    .filter((i) => l24.ids.includes(i.id))
    .map(toAiRow)
    .sort((a, b) => (sevRank[b.sev] ?? 0) - (sevRank[a.sev] ?? 0));
  const today = todayBucket(ctx);
  const trend: "increasing" | "decreasing" | "stable" = today.count > l24.count * 0.8 ? "increasing" : today.count < l24.count * 0.5 ? "decreasing" : "stable";
  const deltaPct = l24.count ? Math.round(100 * (today.count - Math.max(1, Math.round(l24.count / 2))) / Math.max(1, l24.count)) : 0;
  const peak = pickPeak(ctx);
  const text =
    `🕒 **Résumé des 24 dernières heures** :\n` +
    `• Incidents déclarés : **${l24.count}**\n` +
    `• Répartition gravité — Critique ${l24.severity.critique ?? 0} · Élevé ${l24.severity.élevé ?? 0} · Moyen ${l24.severity.moyen ?? 0} · Faible ${l24.severity.faible ?? 0}\n` +
    `• Tendance vs. la période précédente : **${trend === "increasing" ? "⬆️ en hausse" : trend === "decreasing" ? "⬇️ en baisse" : "➡️ stable"}** (${deltaPct > 0 ? "+" : ""}${deltaPct}%)\n` +
    (peak ? `• Heure de pic d'activité : **${peak}**\n` : "") +
    (rows.length ? rows.slice(0, 3).map((r) => `  ▸ ${r.id} · ${r.titre} · ${r.region} · ${r.sev}`).join("\n") : "");
  return {
    intent: "last24h_summary",
    layer1: `fenêtre temporelle 24h · ${l24.count} incidents`,
    text,
    incidents: rows,
    cross: {
      temporal: { last24h: l24, today, trend, deltaPct, peakHour: peak ?? undefined },
    },
    suggestions: [
      { label: "Tendances", query: "Est-ce que le nombre d'incidents augmente ?", priority: "primary" as const },
      { label: "Pics activité", query: "Repère les pics d'activité" },
      { label: "Évolution inhabituelle", query: "Y a-t-il des évolutions inhabituelles ?" },
    ],
  };
}

function todayBucket(ctx: AiContext): TemporalBucket {
  const D = new Date(); const mid0 = new Date(D.getFullYear(), D.getMonth(), D.getDate(), 0, 0, 0).getTime();
  const list = windowIncidents(ctx, (ts) => ts >= mid0);
  return { count: list.length, severity: sevCounts(list), ids: list.map(i => i.id) };
}

function yesterdayBucket(ctx: AiContext): TemporalBucket {
  const D = new Date();
  const yStart = new Date(D.getFullYear(), D.getMonth(), D.getDate() - 1, 0, 0, 0).getTime();
  const yEnd = new Date(D.getFullYear(), D.getMonth(), D.getDate(), 0, 0, 0).getTime();
  const list = windowIncidents(ctx, (ts) => ts >= yStart && ts < yEnd);
  return { count: list.length, severity: sevCounts(list), ids: list.map(i => i.id) };
}

/** Aujourd'hui vs. hier */
function todayVsYesterday(_q: string, ctx: AiContext): AiAnswer {
  const T = todayBucket(ctx); const Y = yesterdayBucket(ctx);
  const delta = T.count - Y.count; const pct = Y.count ? Math.round(100 * delta / Y.count) : 0;
  const trend: "increasing" | "decreasing" | "stable" = delta > Math.max(1, Math.round(Y.count * 0.2)) ? "increasing" : delta < -Math.max(1, Math.round(Y.count * 0.2)) ? "decreasing" : "stable";
  const sevLine = (name: string, S: { severity: Record<string, number>; count: number }) =>
    `  ▸ ${name} : ${S.count} (C${S.severity.critique ?? 0} · É${S.severity.élevé ?? 0} · M${S.severity.moyen ?? 0} · F${S.severity.faible ?? 0})`;
  const text =
    `📊 **Comparaison aujourd'hui / hier** :\n${sevLine("Aujourd'hui", T)}\n${sevLine("Hier        ", Y)}\n` +
    `• Delta : **${delta > 0 ? "+" : ""}${delta}** (${pct > 0 ? "+" : ""}${pct}%) · Tendance : **${trend === "increasing" ? "⬆️ hausse" : trend === "decreasing" ? "⬇️ baisse" : "➡️ stable"}**\n` +
    (trend === "increasing" ? "• ⚠️ Vérifier les capacités d'accueil et disponibilités unités." :
     trend === "decreasing" ? "• ℹ️ Baisse : envisager rotation/maintien de capacités." :
     "• ℹ️ Situation stable, surveillance usuelle.");
  return {
    intent: "today_vs_yesterday",
    layer1: `comparaison temporelle aujourd'hui(${T.count}) vs hier(${Y.count}) → ${trend}`,
    text,
    cross: { temporal: { today: T, yesterday: Y, last24h: last24hBucket(ctx), trend, deltaPct: pct } },
    suggestions: [
      { label: "Tendances", query: "Quelle est l'évolution des incidents ?", priority: "primary" as const },
      { label: "Pics d'activité", query: "Identifier les pics d'activité" },
    ],
  };
}

/** Tendances générales : augmente/diminue, 24h vs 7j, stable. */
function trendIncidents(_q: string, ctx: AiContext): AiAnswer {
  const l24 = last24hBucket(ctx); const t = todayBucket(ctx); const y = yesterdayBucket(ctx);
  const baseCount = Math.max(1, Math.round((l24.count + y.count) / 2));
  const trend: "increasing" | "decreasing" | "stable" =
    t.count > baseCount * 1.4 ? "increasing" : t.count < baseCount * 0.6 ? "decreasing" : "stable";
  const pct = Math.round(100 * (t.count - baseCount) / baseCount);
  const unusual = Math.abs(pct) >= 50;
  const text =
    `📈 **Tendance générale des incidents** :\n` +
    `• Jour même (J) : ${t.count} · Veille (J-1) : ${y.count} · 24h glissant : ${l24.count}\n` +
    `• Tendance : **${trend === "increasing" ? "⬆️ AUGMENTATION" : trend === "decreasing" ? "⬇️ DIMINUTION" : "➡️ STABLE"}** · écart ${pct > 0 ? "+" : ""}${pct}%\n` +
    (unusual ? `• ⚠️ **Écart > 50% : évolution inhabituelle détectée** (à investiguer immédiatement).\n` : "") +
    `• Recommandation : ${trend === "increasing" ? "prévenir CODIS, monter le niveau ORSEC, réactif les unités de réserve." : trend === "decreasing" ? "situation en amélioration, rotation des équipages possible." : "vigilance normale."}`;
  return {
    intent: "trend_incidents",
    layer1: `analyse temporelle tendance ${trend} · écart ${pct}% · ${unusual ? "inhabituel" : "habituel"}`,
    text,
    cross: { temporal: { today: t, yesterday: y, last24h: l24, trend, deltaPct: pct, unusual } },
    suggestions: [
      { label: "Pics d'activité", query: "Repère les pics d'activité" },
      { label: "Évolution inhabituelle", query: "Y a-t-il des évolutions inhabituelles ?", priority: "primary" as const },
    ],
  };
}

function pickPeak(ctx: AiContext): string | null {
  const byHour = new Map<number, number>();
  for (const i of ctx.incidents) {
    const ts = incidentTs(ctx, i);
    if (!ts) continue;
    if (Date.now() - ts > 7 * 24 * 3600 * 1000) continue; // 7j fenêtre
    const h = new Date(ts).getHours();
    byHour.set(h, (byHour.get(h) ?? 0) + 1);
  }
  if (!byHour.size) return null;
  let best = 0; let bestH = -1;
  byHour.forEach((v, k) => { if (v > best) { best = v; bestH = k; } });
  return bestH < 0 ? null : `${String(bestH).padStart(2, "0")}:00 – ${String(bestH + 1).padStart(2, "0")}:00`;
}

/** Pics d'activité sur la semaine. */
function activityPeaks(_q: string, ctx: AiContext): AiAnswer {
  const byHour = new Map<number, number>();
  for (const i of ctx.incidents) {
    const ts = incidentTs(ctx, i);
    if (!ts || Date.now() - ts > 7 * 24 * 3600 * 1000) continue;
    const h = new Date(ts).getHours();
    byHour.set(h, (byHour.get(h) ?? 0) + 1);
  }
  const sorted = [...byHour.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const peak = pickPeak(ctx);
  const total = sorted.reduce((s, e) => s + e[1], 0);
  const text =
    `🔺 **Pics d'activité identifiés** (7 derniers jours) :\n` +
    (peak ? `• Pic principal : **${peak}**\n` : "") +
    (sorted.length
      ? sorted.map(([h, n]) => `  ▸ ${String(h).padStart(2, "0")}:00 — ${String(h + 1).padStart(2, "0")}:00 : ${n} incidents (${total ? Math.round(100 * n / total) : 0}%)`).join("\n")
      : "Pas assez d'historique pour établir des pics.");
  return {
    intent: "activity_peaks",
    layer1: `pics d'activité hebdomadaire · ${sorted.length} tranches identifiées`,
    text,
    cross: { temporal: { today: todayBucket(ctx), last24h: last24hBucket(ctx), peakHour: peak ?? undefined } },
    suggestions: [
      { label: "Tendances", query: "Évolution du nombre d'incidents ?" },
    ],
  };
}

/** Évolutions inhabituelles : pics, delta >= 50%. */
function unusualEvolution(_q: string, ctx: AiContext): AiAnswer {
  const t = todayBucket(ctx); const y = yesterdayBucket(ctx); const l24 = last24hBucket(ctx);
  const pct = y.count ? Math.round(100 * (t.count - y.count) / y.count) : 0;
  const sevSwing = (Object.keys(t.severity).some((k) => Math.abs((t.severity[k] ?? 0) - (y.severity[k] ?? 0)) >= 2));
  const unusual = Math.abs(pct) >= 50 || sevSwing;
  const text =
    `🧐 **Détection d'évolutions inhabituelles** :\n` +
    `• Nombre incidents J : ${t.count} vs J-1 : ${y.count} (écart ${pct > 0 ? "+" : ""}${pct}%)\n` +
    `• Gravité critique J : ${t.severity.critique ?? 0} vs J-1 : ${y.severity.critique ?? 0} · Élevé J : ${t.severity.élevé ?? 0} vs J-1 : ${y.severity.élevé ?? 0}\n` +
    (unusual
      ? `• ⚠️ **ANOMALIE DÉTECTÉE** : ${Math.abs(pct) >= 50 ? `volume J/J-1 écart ≥ 50% (${pct}%).` : ""}${sevSwing ? ` répartition gravité fortement modifiée.` : ""}\n  ▸ Action : escalader au CODIS ; réévaluer posture ORSEC.`
      : `• ✅ Pas d'évolution inhabituelle détectée — situation usuelle.`);
  return {
    intent: "unusual_evolution",
    layer1: `détection anomalies temporelles · ${unusual ? "ANOMALIE" : "normal"} · écart ${pct}%`,
    text,
    cross: { temporal: { today: t, yesterday: y, last24h: l24, deltaPct: pct, unusual } },
    suggestions: [
      { label: "Tendances", query: "Tendance incidents ?" },
      { label: "Pics d'activité", query: "Pics d'activité" },
    ],
  };
}

// --- GÉOGRAPHIQUE (nouveaux §6.22) ------------------------------------------

function buildZones(ctx: AiContext, rows?: AiContext["incidents"]): NonNullable<AiCrossBlock["zones"]> {
  const src = rows ?? ctx.incidents;
  const map = new Map<string, { nom: string; ids: string[]; worst: number; ll?: [number, number] }>();
  for (const i of src) {
    const key = norm(i.region ?? "Inconnue") || "inconnue";
    const ex = map.get(key);
    const label = (i.region && i.region !== "-" && i.region !== "—") ? i.region : "Zone non renseignée";
    const wr = sevRank[i.sev ?? "medium"] ?? 0;
    const coords = i.ll;
    if (!ex) map.set(key, { nom: label, ids: [i.id], worst: wr, ll: coords });
    else {
      ex.ids.push(i.id); if (wr > ex.worst) ex.worst = wr;
      if (!ex.ll && coords) ex.ll = coords;
    }
  }
  return [...map.values()]
    .sort((a, b) => b.ids.length - a.ids.length || b.worst - a.worst)
    .map((z) => ({
      nom: z.nom, count: z.ids.length,
      severity: z.worst >= 3 ? "critique" : z.worst === 2 ? "élevé" : z.worst === 1 ? "moyen" : "faible",
      ll: z.ll, ids: z.ids,
    }));
}

/** Zones les plus touchées (par nombre + pire gravité). */
function touchedZones(_q: string, ctx: AiContext): AiAnswer {
  const zones = buildZones(ctx);
  const top = zones.slice(0, 5);
  const zone = top[0];
  const text =
    `🗺️ **Zones les plus touchées actuellement** (${zones.length} zones documentées) :\n` +
    (top.length ? top.map((z, i) =>
      `  ${i + 1}. **${z.nom}** — ${z.count} incident(s) · gravité max **${z.severity}**`
    ).join("\n") : "Aucune zone documentée.");
  return {
    intent: "touched_zones",
    layer1: `agrégation géographique · ${zones.length} zones · top ${top.length}`,
    text,
    cross: {
      zones: top,
      mapFocus: zone?.ll ? { ll: zone.ll, zoom: zone.count >= 5 ? 10 : 9, label: zone.nom } : undefined,
    },
    suggestions: [
      { label: "Zone la plus risquée", query: "Quelle zone présente le plus grand niveau de risque ?", priority: "primary" as const },
      { label: "Concentration critiques", query: "Où se concentrent les incidents critiques ?" },
      ...(zone?.ll ? [{ label: `🗺️ Afficher ${zone.nom} sur la carte`, query: "afficher zone la plus touchee sur la carte", priority: "primary" as const }] : []),
    ],
  };
}

/** Incidents dans un rayon proche d'une ville (Casablanca, Rabat, etc.). */
function incidentsNearCity(q: string, ctx: AiContext): AiAnswer {
  const normQ = norm(q);
  const city =
    /pr[eè]s\s+de\s+([a-zàâçéèêëîïôûùüÿñæœ\s'-]+?)(?:\s|$|\?|!|,|\.)/.exec(q.toLowerCase())?.[1]?.trim() ??
    /autour\s+de\s+([a-zàâçéèêëîïôûùüÿñæœ\s'-]+?)(?:\s|$|\?|!|,|\.)/.exec(q.toLowerCase())?.[1]?.trim() ??
    /(?:a|à)\s+(casa|casablanca|rabat|marrakech|f[eè]s|tanger|agadir|mekn[eè]s|oujda|t[ée]touan|safi|kenitra|taza|nador|settat|beni mellal)\b/i.exec(normQ)?.[1] ??
    null;
  const CITY_COORDS: Record<string, [number, number]> = {
    casa: [-7.5898, 33.5731], casablanca: [-7.5898, 33.5731],
    rabat: [-6.8498, 34.0209],
    marrakech: [-8.0029, 31.6295], marrakech1: [-8.0029, 31.6295],
    fes: [-4.9808, 34.0181], "fès": [-4.9808, 34.0181],
    tanger: [-5.8038, 35.7595], tangier: [-5.8038, 35.7595],
    agadir: [-9.6013, 30.4278],
    meknes: [-5.5547, 33.8935], "meknès": [-5.5547, 33.8935],
    oujda: [-1.9124, 34.6803],
    tetouan: [-5.3696, 35.5814], "tétouan": [-5.3696, 35.5814],
    safi: [-9.2387, 32.2994],
    kenitra: [-6.5800, 34.2517],
    taza: [-4.0119, 34.2140],
    nador: [-2.9282, 35.1721],
    settat: [-7.6216, 32.9927],
    "beni mellal": [-6.3626, 32.3398],
  };
  const key = city ? Object.keys(CITY_COORDS).find((k) => norm(k) === norm(city)) : null;
  const center = (key ? CITY_COORDS[key] : null) ?? null;
  const rayonKm = 50;
  const rows = !center ? [] : ctx.incidents
    .map((i) => {
      const coords = i.ll;
      const dKm = coords ? haversineKm(center, coords) : Infinity;
      return { i, dKm };
    })
    .filter((x) => x.dKm <= rayonKm)
    .sort((a, b) => a.dKm - b.dKm);
  const title = city ? `à proximité de **${city[0].toUpperCase() + city.slice(1)}** (${rayonKm} km)` : "proximité d'une ville";
  const rowsAi = rows.map((x) => ({ ...toAiRow(x.i), lieu: (x.i.adresse ?? x.i.region ?? "") + (Number.isFinite(x.dKm) ? ` · ~${x.dKm.toFixed(1)} km` : "") }));
  const text =
    `📍 **Incidents ${title}** :\n` +
    (rowsAi.length
      ? `${rowsAi.length} incident(s) dans le rayon.\n` + rowsAi.slice(0, 5).map((r) => `  ▸ ${r.id} · ${r.titre} · ${r.lieu ?? r.region ?? ""} · gravité ${r.sev}`).join("\n")
      : `Aucun incident documenté dans ${rayonKm} km (ou coordonnées non renseignées).`);
  const mapFocus = center ? { ll: center as [number, number], zoom: rowsAi.length >= 5 ? 9 : 10, label: city ?? undefined } : undefined;
  return {
    intent: "incidents_near_city",
    layer1: `filtre géographique ${title} · ${rowsAi.length} incidents`,
    text,
    incidents: rowsAi,
    cross: { zones: center ? [{ nom: city ?? "cible", count: rowsAi.length, severity: "moyen", ll: center, ids: rowsAi.map(r => r.id) }] : buildZones(ctx, rows.map(x => x.i)).slice(0, 3), mapFocus },
    suggestions: [
      { label: "Zones les plus touchées", query: "Quelles sont les zones les plus touchées ?" },
      ...(mapFocus ? [{ label: `🗺️ Afficher ${city ?? "zone"} sur la carte`, query: "afficher cette zone sur la carte", priority: "primary" as const }] : []),
    ],
  };
}

/** Concentration d'incidents critiques/graves. */
function criticalConcentration(_q: string, ctx: AiContext): AiAnswer {
  const crits = ctx.incidents.filter((i) => (sevRank[i.sev ?? "medium"] ?? 0) >= 2);
  const zones = buildZones(ctx, crits).slice(0, 5);
  const top = zones[0];
  const text =
    `🎯 **Concentration des incidents critiques** (Élevé + Critique) :\n` +
    `• Nombre total incidents graves : **${crits.length}**\n` +
    (zones.length
      ? zones.map((z, idx) => `  ${idx + 1}. **${z.nom}** — ${z.count} incident(s) grave(s) · niveau max **${z.severity}**`).join("\n")
      : "Aucun incident grave documenté.") +
    (top ? `\n• Point chaud principal : **${top.nom}** — concentre ${top.count}/${crits.length || 1} soit ${Math.round(100 * top.count / Math.max(1, crits.length))}% des incidents graves.` : "");
  return {
    intent: "critical_concentration",
    layer1: `concentration géographique incidents graves · ${crits.length} cas · ${zones.length} foyers`,
    text,
    incidents: crits.map(toAiRow),
    cross: {
      zones,
      mapFocus: top?.ll ? { ll: top.ll, zoom: top.count >= 5 ? 10 : 9, label: top.nom } : undefined,
    },
    suggestions: [
      { label: "Intervention prioritaire", query: "Quels incidents nécessitent une intervention prioritaire ?", priority: "primary" as const },
      { label: "Zone la plus risquée", query: "Quelle zone présente le plus grand niveau de risque ?" },
      ...(top?.ll ? [{ label: `🗺️ Afficher foyer ${top.nom}`, query: "afficher foyer critique sur la carte", priority: "primary" as const }] : []),
    ],
  };
}

/** Zone la plus risquée (gravité pondérée × volume). */
function riskiestZone(_q: string, ctx: AiContext): AiAnswer {
  const all = buildZones(ctx);
  const scored = all.map((z) => ({ z, risk: z.count * ((z.severity === "critique" ? 8 : z.severity === "élevé" ? 4 : z.severity === "moyen" ? 2 : 1)) }));
  scored.sort((a, b) => b.risk - a.risk);
  const top = scored[0]; const allCrit = scored.reduce((s, x) => s + x.risk, 0);
  const text =
    `⚠️ **Zone présentant actuellement le plus grand niveau de risque** (score = volume × gravité) :\n` +
    (top
      ? `• **${top.z.nom}** — score de risque **${top.risk}** (${top.z.count} incident(s), gravité max **${top.z.severity}**) · ${allCrit ? Math.round(100 * top.risk / allCrit) : 0}% du risque national.\n` +
        `• Actions recommandées :\n  ▸ Vérifier disponibilités locales unités + hôpitaux\n  ▸ Prévenir CODIS / ORSEC zone\n  ▸ Consulter les incidents prioritaires`
      : "Pas assez de données pour établir une zone à risque.");
  return {
    intent: "riskiest_zone",
    layer1: top ? `zone la plus risquée : ${top.z.nom} · score ${top.risk}` : "zone risque : insuffisamment de données",
    text,
    incidents: top ? ctx.incidents.filter((i) => i.region && norm(i.region) === norm(top.z.nom)).map(toAiRow).slice(0, 5) : undefined,
    cross: {
      zones: scored.slice(0, 5).map((s) => s.z),
      mapFocus: top?.z.ll ? { ll: top.z.ll, zoom: 10, label: top.z.nom } : undefined,
    },
    suggestions: [
      { label: "Zones les plus touchées", query: "Zones les plus touchées ?" },
      { label: "Intervention prioritaire", query: "Quels incidents nécessitent une intervention prioritaire ?", priority: "primary" as const },
      ...(top?.z.ll ? [{ label: `🗺️ Afficher ${top.z.nom} sur la carte`, query: "afficher zone risque sur la carte", priority: "primary" as const }] : []),
      { label: "Prédictions IA de risques", query: "Quelles sont les prédictions de risques IA ?", priority: "primary" as const },
    ],
  };
}

// ============================================================================
// Module IA Prédictions Risques (RisquePanel ↔ Copilot, 100% réel)
// ============================================================================
function levelFr(l: RiskPrediction["level"]): string {
  return l === "eleve" ? "élevé" : l === "modere" ? "modéré" : l;
}
function severityZone(l: RiskPrediction["level"]): "critique" | "élevé" | "moyen" | "faible" {
  if (l === "critique") return "critique";
  if (l === "eleve") return "élevé";
  if (l === "modere") return "moyen";
  return "faible";
}

function riskPredictionAnswer(q: string, ctx: AiContext): AiAnswer {
  const preds = (ctx.riskPredictions ?? []).filter((p) => !p.dismissed);
  preds.sort((a, b) => b.score - a.score);
  const allCount = preds.length;
  const critique = preds.filter((p) => p.level === "critique").length;
  const eleve = preds.filter((p) => p.level === "eleve").length;
  const modere = preds.filter((p) => p.level === "modere").length;
  const faible = preds.filter((p) => p.level === "faible").length;
  const moy = allCount ? Math.round(preds.reduce((s, p) => s + p.score, 0) / allCount) : 0;

  // Top 6 risques (format markdown humain)
  const topRows = preds.slice(0, 6);
  const kind = (k: RiskPrediction["kind"]) =>
    k === "zone" ? "Zone" : k === "hopital" ? "Établissement" : k === "corridor" ? "Corridor" : "Incident";
  const lines: string[] = [];
  if (allCount === 0) {
    lines.push("Aucune estimation de dégradation significative détectée dans les données ARGOS pour le moment.");
  } else {
    lines.push("🔮 **Estimations IA · dégradations probables** :\n");
    lines.push(`• Score global moyen : **${moy}/100** — ${allCount} estimation(s)`);
    lines.push(`• Niveaux : ${critique} **critique** · ${eleve} **élevé** · ${modere} **modéré** · ${faible} **faible**\n`);
    lines.push("### Estimations prioritaires :");
    for (const p of topRows) {
      const items = p.factors.slice(0, 2).map((f) => f.label).join(" · ");
      lines.push(
        `${kind(p.kind)} · **${p.label}** — **${p.score}/100** · niveau **${levelFr(p.level)}** · horizon **${p.horizon}** · prob. **${Math.round(p.probability * 100)}%**${items ? ` · facteurs : ${items}` : ""}`,
      );
    }
  }

  return {
    intent: "risks_prediction",
    layer1: `prédictions IA risques · ${allCount} estimations · moyenne ${moy}/100`,
    text: lines.join("\n"),
    cross: {
      zones: topRows
        .filter((p) => !!p.ll)
        .map((p) => ({ nom: p.label, count: topRows.indexOf(p) + 1, severity: severityZone(p.level), ids: p.linkedIncidentIds ?? [], ll: p.ll })),
      mapFocus: topRows[0]?.ll ? { ll: topRows[0].ll, zoom: 9, label: `Foyer risque ${topRows[0].label}` } : undefined,
    },
    suggestions: [
      { label: "Foyers critiques (≥ 80)", query: "Quelles sont les prédictions critiques (≥ 80) ?" },
      { label: "Prédictions sur 24h", query: "Prédictions sur 24h" },
      { label: "Risques Rabat", query: "Risques à Rabat ?" },
      { label: "Voir panel dashboard", query: "Ouvre le tableau de bord des prédictions" },
      ...(topRows[0]?.ll
        ? [{ label: `🗺️ Afficher ${topRows[0].label} sur la carte`, query: "afficher le premier risque sur la carte", priority: "primary" as const }]
        : []),
    ],
  };
}

function riskZoneAnswer(q: string, ctx: AiContext): AiAnswer {
  const raw = (ctx.riskPredictions ?? []).filter((p) => !p.dismissed);
  const nq = norm(q);
  const tokens = nq.split(/[\s-]+/).filter((t) => t.length >= 3);
  const KNOWN_CITIES = [
    "Casablanca", "Rabat", "Marrakech", "Fès", "Tanger", "Agadir", "Meknès", "Oujda",
    "Tétouan", "Safi", "Kénitra", "Taza", "Nador", "Settat", "Beni Mellal",
    "Errachidia", "Ouarzazate", "Al Haouz", "Chichaoua", "Khouribga", "Sidi Slimane",
    "Kalaat M'Gouna", "Tinghir", "Boumalne Dades",
  ];
  const villeMatch = tokens.find((t) =>
    KNOWN_CITIES.some((name) => norm(name) === t || norm(name).includes(t) || t.includes(norm(name))),
  );
  let picked: RiskPrediction[] = [];
  let label = "zone demandée";
  // 1) Si on a trouvé une ville dans la question, filtrer par prédiction dont label contient la ville
  if (villeMatch) {
    label = villeMatch;
    picked = raw.filter((p) => norm(p.label).includes(norm(villeMatch)));
  }
  // 1bis) fallback tokens cherchent directement dans prédictions labels
  if (picked.length === 0) {
    const hit = tokens.find((t) => raw.some((p) => norm(p.label).includes(t)));
    if (hit) {
      label = hit;
      picked = raw.filter((p) => norm(p.label).includes(hit));
    }
  }
  // 2) Sinon : fallback vers la zone à score le plus élevé
  if (picked.length === 0) {
    const sorted = [...raw].sort((a, b) => b.score - a.score);
    picked = sorted.slice(0, 1);
    if (picked[0]) label = picked[0].label;
  }
  if (picked.length === 0) {
    return {
      intent: "risks_zone",
      layer1: `risque sur ${label} : aucune prédiction disponible`,
      text: `Aucune estimation IA de risque n'est actuellement documentée pour « ${label} » dans les données ARGOS.`,
    };
  }
  picked.sort((a, b) => b.score - a.score);
  const top = picked[0];
  const kind = (k: RiskPrediction["kind"]) =>
    k === "zone" ? "Zone" : k === "hopital" ? "Établissement" : k === "corridor" ? "Corridor" : "Incident";
  const lines: string[] = [];
  lines.push(`🔮 **Prédictions IA de risques sur ${label}** :\n`);
  for (const p of picked.slice(0, 4)) {
    const items = p.factors.slice(0, 3).map((f) => f.label).join(" · ");
    lines.push(`• ${kind(p.kind)} **${p.label}** : **${p.score}/100** · ${levelFr(p.level)} · horizon **${p.horizon}**${items ? ` · ${items}` : ""}`);
  }
  const tot = picked.reduce((s, p) => s + p.score, 0);
  const moy = Math.round(tot / Math.max(1, picked.length));
  lines.push(`\n• Score moyen zone **${label}** : **${moy}/100** · ${picked.length} estimation(s).`);

  // Incidents & hôpitaux liés
  const incIds = new Set<string>();
  const hosIds = new Set<string>();
  for (const p of picked) {
    (p.linkedIncidentIds ?? []).forEach((id) => incIds.add(id));
    (p.linkedHospitalIds ?? []).forEach((id) => hosIds.add(id));
  }
  const incs = ctx.incidents.filter((i) => incIds.has(i.id)).map(toAiRow);
  const hos = ctx.hospitals?.filter((h) => hosIds.has(h.id)).map((h) => hospitalRow(h)) ?? [];

  return {
    intent: "risks_zone",
    layer1: `risque sur ${label} · ${picked.length} estimations · moyenne ${moy}/100`,
    text: lines.join("\n"),
    incidents: incs.slice(0, 5),
    hospitals: hos.slice(0, 4),
    cross: {
      zones: picked.filter((p) => !!p.ll).map((p) => ({ nom: p.label, count: 1, severity: severityZone(p.level), ids: p.linkedIncidentIds ?? [], ll: p.ll })),
      mapFocus: top?.ll ? { ll: top.ll, zoom: 10, label: `Foyer risque · ${top.label}` } : undefined,
    },
    suggestions: [
      { label: "Voir toutes les prédictions IA", query: "Quelles sont les prédictions de risques IA ?", priority: "primary" as const },
      { label: "Incidents critiques zone", query: `Incidents critiques sur ${label}` },
      { label: "Saturation hôpitaux proches", query: `Saturation hôpitaux ${label}` },
      ...(top?.ll ? [{ label: `🗺️ Centrer carte sur ${label}`, query: `centrer carte sur ${label}`, priority: "primary" as const }] : []),
    ],
  };
}

// --- Routage --------------------------------------------------------------

/** Traduit une requête NL → requête Couche 1 déterministe + réponse par gabarit. */
export function interpret(q: string, ctx: AiContext): AiAnswer {
  const nq = norm(q);
  // Court-circuit si rien
  if (!q.trim()) return help(q, ctx);

  // salutation opérateur + "tu es qui ?" / "qui es-tu ?" / "présente toi" / "qui est tu" / "qui tu es"
  // ⚠️ DOIT ÊTRE AVANT les regex générales sinon fallback vers incident.
  // 🔥 Ajout : questions IDENTITÉ / PROVENANCE / CRÉATEUR ("qui t'a développé ?" "c'est quoi ARGOS ?" etc.)
  const identiteCue = /\b(qui\s+(t['’]a|te\s+)?(developp|d[eé]velopp|fais|fabriqu|cr[eé]|construi)|qui\s+est\s+ton\s+(cr[eé]ateur|developpeur|d[eé]veloppeur|auteur|p[èe]re|constructeur)|tu\s+viens\s+d['']o[uù]|quelle\s+est\s+ton\s+(origine|provenance)|c['']est\s+quoi\s+(argos|copilot|ce\s+logiciel|cette\s+plateforme|l['']assistant)|qu['']est\s+ce\s+qu[''](argos|il)|qui\s+a\s+fait\s+(argos|le\s+copilot)|tu\s+(es|est)\s+(fait|cr[eé]|developp|d[eé]velopp)|a\s+qui\s+appartiens[st]?|de\s+qui\s+viens[st]?|tu\s+sers\s+a\s+quoi|tu\s+fais\s+quoi\s+ici)\b/i;
  if (
    /^(bonjour|bonsoir|salut|hey|hello|coucou|bjr|cc|bon apres|bonne apres midi|good morning|good evening)\b|^bonjour[ !,]*$|^bonsoir[ !,]*$|^salut[ !,]*$/.test(nq) ||
    /\b(tu es qui|tu est qui|qui es tu|qui est tu|qui es-tu|qui est-tu|qui tu es|qui t'es|qui etes vous|qui êtes vous|qui est ce que tu es|c'est quoi ton nom|ton nom est quoi|tu t'appelles comment|ton prenom|ton prénom|tu es quoi|tu fais quoi|presente toi|présente toi|présentation|c'est qui|qui est toi|qui suis-je|qui suis je|qui est ce|présente|présente|presente)\b/i.test(nq) ||
    identiteCue.test(nq) ||
    (nq.length <= 120 && /tu es|tu est|qui\s+(est|es|sont|éta|êtes)\b|t['eê]s\s+qui|t['eê]s\s+quoi/i.test(nq) && /copilot|assistant|ia\b|ai\b|bot|robot|argos/.test(nq))
  ) {
    const h = new Date().getHours();
    // Si c'est une question IDENTITE (pas juste un bonjour), on précise 1 phrase + chips
    const justGreeting = /^(bonjour|bonsoir|salut|hey|hello|coucou|bjr|cc|bon apres|bonne apres midi|good morning|good evening)/.test(nq) || /^bonjour[ !,]*$|^bonsoir[ !,]*$|^salut[ !,]*$/.test(nq);
    const acc =
      identiteCue.test(nq)
        ? "Je suis le Copilot ARGOS, assistant opérationnel de la plateforme de gestion des incidents FAR/RM/ORSEC. Je synthétise les données de la plateforme en langage naturel. Que souhaites-tu consulter ?"
        : h < 12
          ? "Bonjour opérateur, comment puis-je t'aider ?"
          : h < 18
            ? "Bon après-midi opérateur, comment puis-je t'aider ?"
            : "Bonsoir opérateur, comment puis-je t'aider ?";
    const suggestionsIdentite = !justGreeting && identiteCue.test(nq)
      ? [
          { label: "Situation globale", query: "Situation globale opérationnelle", priority: "primary" as const },
          { label: "Incident le plus grave", query: "incident le plus grave" },
          { label: "SITREP", query: "SITREP incidents en cours" },
        ]
      : [
          { label: "Situation globale", query: "Situation globale opérationnelle", priority: "primary" as const },
          { label: "Situation hôpitaux", query: "situation des hôpitaux" },
          { label: "Détail INC-2607", query: "Détail INC-2607" },
          { label: "Analyse croisée INC-2607", query: "Analyse croisée INC-2607" },
          { label: "SITREP", query: "SITREP incidents en cours" },
        ];
    return {
      intent: "greeting",
      layer1: identiteCue.test(nq) ? "identité & provenance Copilot ARGOS" : "salutation opérateur",
      text: acc,
      suggestions: suggestionsIdentite,
    };
  }

  // phrases SOCIALES / POLITES (pas métier) : réponse COURTE + chips, AUCUNE donnée, AUCUN tableau.
  // Inclut les variantes sans espace : "cava"  "cava?"  "okmerci" (traitement compact)
  const socialThanks = /\b(merci|merci bien|merci beaucoup|thanks|thx|danke|gracias|tres bien|très bien|tres sympa|très sympa|tres cool|top|super|parfait|impecc|genial|génial|awesome|nice)\b/;
  const socialAck = /\b(d'accord|daccord|ok|okay|okey|oui|non|entendu|bien recu|bien reçu|recu|reçu|c'est noté|c est noté|cest noté|tres bien|ok merci|je vois|compris|je comprends|parle|parle-moi|parle moi|parle moi en francais|parle moi en français|alors|vas-y|vas y|go|on y va|on y est)\b/;
  const socialBye = /\b(au revoir|a plus|a\+|bye|byebye|a bientot|à bientôt|bonne soirée|bonne soiree|bonne journee|bonne journée|à plus|ciao|adieu|a la prochaine|a plus tard)\b/;
  // compact match : "cava", "cava?", "ça va", "ça va ?", "ça-va" (on retire espaces tirets ponctuations puis match)
  const compactSocial = (s: string) => s.replace(/[\s\-_?!.,;:'"]+/g, "").toLowerCase();
  const compactNq = compactSocial(nq);
  const socialCompact = compactNq === "cava" || compactNq === "çava" || compactNq === "sava" || compactNq === "okmerci" || compactNq === "ouiok";
  const socialHowRU = /(ça va|ca va|cava|tu vas bien|tu vas bien\s*\?|comment vas tu|comment vas-tu|comment ca va|comment ça va|comment cava|comment tu vas|tu vas|ca se passe|comment ca se passe|comment ça se passe|comment\s+ça\s+va|ca va\s*\?|ça va\s*\?|cava\s*\?)/i;
  if (
    socialThanks.test(nq) || socialAck.test(nq) || socialBye.test(nq) || socialHowRU.test(nq) || socialCompact
  ) {
    let rep = "";
    if (socialBye.test(nq)) rep = "À bientôt opérateur, reste prudent.";
    else if (socialThanks.test(nq) || /merci/.test(compactNq)) rep = "Avec plaisir. Sur quoi puis-je t'aider ?";
    else if (socialHowRU.test(nq) || /cava|çava|sava|ça\s*va|ca\s*va/i.test(compactNq)) rep = "Tout fonctionne opérateur, prêt. Et toi ? Sur quelle situation veux-tu des informations ?";
    else if (socialAck.test(nq) || socialCompact) rep = "Bien noté. Quelle information souhaites-tu ?";
    else rep = "Bien sûr, je t'écoute.";
    return {
      intent: "social",
      layer1: socialHowRU.test(nq) || /cava/.test(compactNq) ? "réponse sociale : comment ça va" : socialBye.test(nq) ? "réponse sociale : au revoir" : "réponse sociale",
      text: rep,
      suggestions: [
        { label: "Situation globale", query: "Situation globale opérationnelle", priority: "primary" as const },
        { label: "Situation hôpitaux", query: "situation des hôpitaux" },
        { label: "Incident le plus grave", query: "incident le plus grave" },
      ],
    };
  }
  if (nq.length <= 40 && /^(ca va|ça va|cava|ok|oui|non|bye|merci)$/i.test(nq.trim())) {
    return {
      intent: "social",
      layer1: "social court",
      text: "Bien sûr, sur quoi puis-je t'aider ?",
      suggestions: [{ label: "Situation globale", query: "Situation globale opérationnelle", priority: "primary" as const }],
    };
  }

  // aide
  if (/aide|help|comment|qu'est ce que tu peux|tu sais faire|que peux tu|que fais tu|comment ca marche/.test(nq)) return help(q, ctx);

  // Questions quantitatives (combien / nombre / total) — priorité haute
  // ⚠️ `\b` word boundary obligatoire : sinon on match "nombre" contient "on a" / "on" !
  // ⚠️ FIX 2026-08-11 : "nombre d'incidents" → apostrophe `d'` PAS matchée par d[eu].
  //    On utilise une regex PLUS SIMPLE : SI la phrase contient "combien|nombre|total|combien|on a"
  //    PUIS on match le lexique après (pas besoin de liaison exacte).
  // 🔥🔥 14/08/26 : AJOUT lexique "taux lits / lits disponibles / disponibilités lits" → direct hospitalsStatus
  const hasLitDispo = /(taux\s+de\s+)?(lits?|lit)\s*(disponibles?|disponibilit[ée]|libres?|occupe[és]|taux\s+d['’]?occupation?|taux\s+occupation)/i.test(nq);
  const hasQuant = /\b(combien|nombre|total|quel\s+nombre|on\s+a|dispose[\s-]+de|combien\s+y\s+a)\b/i.test(nq);
  if ((hasQuant && /(hopital|hospinet|sante|hopitaux|etablissement|rea|lits|chambre)/i.test(nq)) || hasLitDispo) return hospitalsStatus(q, ctx);
  if (hasQuant && /(unite|equipe|far|unites|bataillon|compagnie)/i.test(nq)) return unitsStatus(q, ctx);
  if (hasQuant && /(incident|evenement|alerte|operation|intervention|zone)/i.test(nq)) return incidentsList(q, ctx);
  // Si mot "combien" SEUL (sans lexique spécifique) → par défaut liste incidents (la question la plus fréquente)
  if (/\bcombien\b/i.test(nq) && !hasQuant /* guard si déjà traité au dessus */) return incidentsList(q, ctx);

  // 🔥 INTENTS TEMPORELS (priorité HAUTE avant global overview) §6.22
  // 👉 Aujourd'hui seulement
  if (/\b(aujourd['’]?hui|ce\s+jour|journ[ée]e\s+actuelle|ce\s+jour\s*m[êe]me)\b/i.test(nq) && /(incident|evenement|alerte|situatio|statist|nombre|total|declar|survenu|a\s+eu|eu\s+lieu|document|enregis)/i.test(nq)) return todayIncidents(q, ctx);
  if (/(incidents?\s+.*aujourd['’]?hui|aujourd['’]?hui.*incidents?)/i.test(nq)) return todayIncidents(q, ctx);
  // 👉 Dernières 24 heures / dernières 24h
  if (/(derni[èe]res?\s+(24|vingt[- ]?quatre)\s*(heures?|h)|24\s*h\s*(derni[èe]res?|glissant|precedentes?)|resume.*24\s*h|r[ée]sum[ée].*24\s*h|resume.*24\s*heure|r[ée]sum[ée].*24\s*heure)/i.test(nq)) return last24hSummary(q, ctx);
  if (/(resume|r[ée]sum[ée]|synth[èe]se|panorama|bilan).*(derni[èe]res?\s+24|24\s*h|24\s*heure)/i.test(nq)) return last24hSummary(q, ctx);
  if (/(resume|r[ée]sum[ée]).*(incidents?|evenements?|situations?).*(derni[èe]re|journ[ée]e).*(24|vingt)/i.test(nq)) return last24hSummary(q, ctx);
  // 👉 Aujourd'hui vs Hier (comparaison temporelle)
  if (/(compare|comparaison|rapport|diff[ée]rence|au\s+jourd['’]?hui\s+vs\s+hier|hier\s+vs\s+aujourd['’]?hui|aujourd['’]?hui\s+contre\s+hier|avant\s+hier|j\s+vs\s+j-1|j\s*\/\s*j-1)/i.test(nq)) return todayVsYesterday(q, ctx);
  if (/(au\s+jourd['’]?hui.*(compar|hier)|hier.*(compar|aujourd['’]?hui)|d[ée]j[àa]\s+hier|par\s+rapport\s+[àa]\s+hier)/i.test(nq)) return todayVsYesterday(q, ctx);
  // 👉 Tendance / évolution incidents (augmente/diminue)
  if (/(tendance|tendances|évolutions?|evolutions?|nombre\s+d['’]incidents?\s+(augmente|diminue|baisse|monte|augmentation|diminution)|est\s+ce\s+que\s+.*incidents?.*(augmente|diminue|baisse|mont[ée]))/i.test(nq)) return trendIncidents(q, ctx);
  if (/(incidents?.*(augmente|diminue|baisse|mont[ée]|hausse|chute))/i.test(nq)) return trendIncidents(q, ctx);
  // 👉 Pics d'activité
  if (/(pic|pics|pique|heures?\s+de\s+pointe|pics?\s+d['’]?activit[ée]s?|moments\s+chargés|périodes?\s+chargée|periode\s+charge)/i.test(nq)) return activityPeaks(q, ctx);
  // 👉 Évolutions inhabituelles / anomalies temporelles
  if (/(inhabituelle|inhabituels?|anomalie|anomalies?|d[ée]viation|[ée]cart\s+important|soulèvement|brutale|brusque|pic\s+anormal|situations?\s+inhabituelle|est\s+ce\s+qu['’]il\s+y\s+a.*anom)/i.test(nq)) return unusualEvolution(q, ctx);
  if (/(anomal|inhabituel|évolutions?\s+inhabitu|evolutions?\s+inhabitu|alarmant)/i.test(nq) && /(incident|evenement|activit|journ[ée]e|semaine)/i.test(nq)) return unusualEvolution(q, ctx);

  // 🔥 INTENTS GÉOGRAPHIQUES (avant global overview) §6.22
  // 👉 Zones les plus touchées
  if (/(zones?\s+(les\s+plus\s+|plus\s+|les\s+mieux\s+)?touchées?|touch[eé]es?\s+zones?|r[ée]gions?\s+(touchées?|impactées?|affectées?)|zones?\s+impactées?|zones?\s+affectées?|quelles\s+zones?\s+.*touch|quelles\s+r[ée]gions?\s+.*touch|zones?\s+d['’]?intérêt|hotspots?|points?\s+chauds)/i.test(nq)) return touchedZones(q, ctx);
  // 👉 Incidents PROCHES d'une ville (Casablanca / Rabat / ...)
  if (/(pr[eè]s\s+de|autour\s+de|aux\s+alentours?\s+d['’]e|aux\s+environs\s+d['’]e|proximit[ée]\s+d['’]e|(proche|voisine|avoisinante).*\s+de|(incidents?|evenements?|alertes?).*\s+(dans\s+la\s+r[ée]gion\s+de|à\s+c[ôo]té\s+de|(pr[eè]s|proche)\s+de))/i.test(nq) && /(casa|casablanca|rabat|marrakech|f[eè]s|tanger|agadir|mekn[eè]s|oujda|t[ée]touan|safi|kenitra|taza|nador|settat|beni\s+mellal|ville)/i.test(nq)) return incidentsNearCity(q, ctx);
  if (/(incidents?\s+(à|a)\s+(casa|casablanca|rabat|marrakech|f[eè]s|tanger|agadir|mekn[eè]s|oujda)|(casa|casablanca|rabat|marrakech).*(incidents?|evenements?))/i.test(nq)) return incidentsNearCity(q, ctx);
  // 👉 Concentration incidents CRITIQUES
  if (/(concentration|regroupement|amas|grappe|foyers?)\s+.*(critique|grave|important|critiques?|sév[èe]res?|élevés?|severes?)|o[uù]\s+(se\s+)?(concentre|regroupe)\s+(les\s+)?incidents?\s+(critiques?|graves?|prioritaires?)/i.test(nq)) return criticalConcentration(q, ctx);
  if (/(incidents?\s+critiques?|incidents?\s+graves?).*(o[uù]|région|zone|concentration|où\s+se\s+trouve(nt)?)/i.test(nq)) return criticalConcentration(q, ctx);
  // 👉 Zone avec PLUS GRAND RISQUE
  if (/(zones?\s+(la\s+plus\s+|plus\s+|le\s+plus\s+grand)\s+(risquée?|dangereuse?|risqu[eé]e|critique)|quel(le)?\s+zone\s+(présente|a|offre)\s+(le\s+plus\s+)?(risque|niveau\s+de\s+risque|danger))/i.test(nq)) return riskiestZone(q, ctx);
  if (/(risque|niveau\s+de\s+risque).*(zones?|r[ée]gions?)|quel(le)?\s+(r[ée]gion|zone).*(risque|plus\s+dangereuse)/i.test(nq)) return riskiestZone(q, ctx);

  // 🔥 INTENTS MODULE IA PREDICTIONS RISQUES (avant global overview, 100% réel)
  //     → "risques à Rabat" / "risques Marrakech" / "risque sur Casablanca"
  const riskCueCity =
    /(risques?|estimation|pr[eé]diction|alerte\s+risque|d[eé]gradation|score\s+risque).*\s+(à|a|de|sur|pour|dans)\s+(casa|casablanca|rabat|marrakech|f[eè]s|tanger|agadir|mekn[eè]s|oujda|t[ée]touan|safi|kenitra|taza|nador|settat|beni\s+mellal|t[aâ]louet|errachidia|ouarzazate)/i;
  const riskCityName =
    /^(risques?|estimation|pr[eé]diction)\s+(à|a|de|sur|pour)\s+(casa|casablanca|rabat|marrakech|f[eè]s|tanger|agadir|mekn[eè]s|oujda|t[ée]touan|safi|kenitra|taza|nador|settat|beni\s+mellal|errachidia|ouarzazate)/i;
  const riskAnyCity = /(casa|casablanca|rabat|marrakech|f[eè]s|tanger|agadir|mekn[eè]s|oujda|t[ée]touan|safi|kenitra|taza|nador|settat|beni\s+mellal|errachidia|ouarzazate).*(risques?|pr[eé]dictions?\s+(de\s+)?risques?|estimation)/i;
  if (riskCueCity.test(nq) || riskCityName.test(nq) || riskAnyCity.test(nq)) return riskZoneAnswer(q, ctx);
  //     → "prédictions IA risques" / "estimation de risques" / "risques" (sans ville)
  const riskGlobal =
    /(pr[eé]dictions?\s+(de\s+)?risques?|risques?\s+(ia|ia\s*predict|estim[ée]s?|sur\s+24h|sur\s+48h|dans\s+les?\s+prochaines?\s+heure|horizon|24\s*h|48\s*h))/i;
  const riskGlobal2 =
    /^(risques?|estimation\s+de\s+risques?|foyers\s+(critiques?|de\s+risque)|score\s+risque\s+global|probabilit[eé]\s+d['eé]gradation)$/i;
  const riskGlobal3 =
    /(quel(le)?s?\s+sont\s+les?\s+pr[eé]dictions?|quelles?\s+risques?\s+.*prochaines?\s+heure|d[eé]gradation\s+probables?|o[uù]\s+risque\s+d[eé]gradation)/i;
  if (riskGlobal.test(nq) || riskGlobal2.test(nq) || riskGlobal3.test(nq)) return riskPredictionAnswer(q, ctx);
  //     → Si question contient "risque" + "prédire"/"anticiper"/"estimer"/"prévision"
  if (/(pr[eé]dire|anticiper|estimer|pr[eé]voir|pr[eé]vision|anticipation).*(risque|d[eé]gradation|saturation|d[eé]bordement)/i.test(nq)) return riskPredictionAnswer(q, ctx);
  // 👉 Intervention PRIORITAIRE = incidents critiques/worstIncidents top5 priorité
  if (/(intervention\s+prioritaires?|actions?\s+prioritaires?|cas\s+prioritaires?|prioriser|urgents?\s+(de|à)\s+traiter|affecter\s+en\s+priorit[ée]|d[ée]ploiement\s+prioritaires?|quels\s+incidents?.*priorit|incidents?.*prioritaires?\s+intervention)/i.test(nq)) return worstIncidents(q, ctx, 3);

  // situation globale / vue d'ensemble / synthèse
  if (/vue globale|vue d'ensemble|situation globale|apercu general|synthese generale|etat des lieux|tableau de bord|resume general|panorama/.test(nq)) return globalOverview(q, ctx);

  // 🔥 PRIORITÉ MAX : INCIDENT LE PLUS GRAVE / PIRES INCIDENTS
  //    → Par POIDS sévérité HIGH > MEDIUM > LOW (pas proximité texte).
  //    → 2 regex : une mot-clé "incident" explicit, une phrase courte (<=80) avec adjectif pire/grave pour les questions contextuelles.
  const worstAdj = /(pire[s]?|le\s+plus\s+grave|plus\s+graves|critique[s]?|le\s+plus\s+dangereux|dangereux|le\s+plus\s+s[eé]v[èe]re|s[eé]v[èe]re\s+maximum|haut\s+niveau|niveau\s+max)/i;
  const incidentWord = /(incident|evenement|alerte|situation|cas)/i;
  if (worstAdj.test(nq) && incidentWord.test(nq)) {
    const topN: 1 | 3 = /(trois|3\s*incidents|top\s*3|les\s+plus\s+graves|pire[s]\s+incidents|3\s*premiers)/i.test(nq) ? 3 : 1;
    return worstIncidents(q, ctx, topN);
  }
  if (worstAdj.test(nq) && nq.length <= 100) {
    return worstIncidents(q, ctx, 1);
  }

  // SITREP / rapport de situation
  if (/sitrep|rapport de situation|compte[- ]rendu|brouillon/.test(nq)) return sitrep(q, ctx);

  // tendances
  if (/tendance|evolution|statistique|analyse.*incident|courbe|historique|evolution 30|trend/.test(nq)) return trends(q, ctx);

  // ORSEC
  if (/orsec|niveau orsec|plan orsec|organigramme|permanence|decision.*recent/.test(nq)) return orsecSummary(q, ctx);

  // bilan humain / casualties
  if (/bilan humain|victime|deces|blesse|disparu|mort|casualtie|rescousse|sauve/.test(nq)) return casualtiesSummary(q, ctx);

  // sismologie / séismes
  if (/seisme|sismique|seismologie|tremblement de terre|magnitude|quake|seismic|epicentre|profondeur/.test(nq)) return seismicStatus(q, ctx);

  // anomalies / retards
  if (/anomal|retard|ecart|deviation|alerte.*mouvement|mouvement.*retard|convoi.*retard/.test(nq)) return anomaly(q, ctx);

  // hôpitaux statut global
  if (/(etat|statut|saturation|occupation|capacite|disponibilite|liste|situation|bilan|vue|apercu|aperçu|panorama|inventaire).*(hopital|hospinet|sante|hopitaux|etablissement|rea|lits|chambre|liberte)/.test(nq) || /hospinet|reseau hospitalier|etat des hopitaux|situation des hopitaux|vue hopital|capacite hospitaliere|etablissements de sante|etablissements de santé/.test(nq)) return hospitalsStatus(q, ctx);

  // hôpitaux + proximité
  if (/(hopital|hospinet|sante|medecin|chu|hopitaux).*(proche|voisin|autour|distance|autour|rayon)/.test(nq) || /(proche|voisin|autour|distance).*(hopital|hospinet|sante|chu)/.test(nq)) return hospitalsNearest(q, ctx);
  const hasIncCue = resolveTarget(q, ctx.incidents);
  if (/hopital|hospinet|sante|etablissement sante/.test(nq) && hasIncCue) return hospitalsNearest(q, ctx);

  // unités posture globale
  if (/(posture|etat|statut|capacite|liste|disponibilite|readiness|preparation|situation|bilan|vue|apercu|panorama).*(unite|equipe|unite far|unites|far)/.test(nq) || /posture des unites|etat des unites|unites disponibles|toutes les unites|capacites des unites|situation des unites|bilan des unites/.test(nq)) return unitsStatus(q, ctx);

  // 🔥 PRIORITAIRE : ÉTAT GLOBAL STOCKS / RUPTURES / HORS SERVICE
  //    → Déclenche SUR LA REQUÊTE EXACTE utilisateur "état des stocks des équipements critiques
  //      (ruptures / HORS SERVICE)". Ne PAS passer en equipmentSearch (qui est une recherche
  //      par mot-clé et retournait 0 résultats sur la requête générique).
  if (
    /(etat|statut|situation|bilan|vue|apercu).*(stock|rupture|rupture.*stock|inventaire|equipement|materiel).*(critique|urgent|sensible|rupture|hors service|hs|sous seuil|disponibilite)/.test(nq) ||
    /stock.*(critique|rupture|hors service|hs|sous seuil|alerte|disponibilite|etat|statut)/.test(nq) ||
    /rupture.*(stock|equipement|materiel|critique|alerte)/.test(nq) ||
    /(hors service|\bh\s*s\b).*(equipement|stock|materiel)/.test(nq) ||
    /equipements?\s+critiques?\s+\(?\s*ruptures?\s*\/?\s*hors\s+service/.test(nq)
  ) return equipmentCriticalStatus(q, ctx);

  // équipements / inventaire / recherche par mot-clé (reste générique pour "cherche X", "citerne", etc.)
  if (/equipement|inventaire|stock|cherche|recherche|trouve|materiel|catalogue.*equip|piece|kit|groupe electrogene|tente|brancard/.test(nq)) return equipmentSearch(q, ctx);

  // analyse croisée / croisement / fiche complète / 360
  if (/analyse croise|croisement|fiche complete|360|vue complete|consolid|synthese.*incident/.test(nq) || (/croise|complet|global|detailled|detail complet|toutes les informations/.test(nq) && hasIncCue)) {
    return crossAnalysis(q, ctx);
  }

  // 🔥 ROUTEUR UNIVERSEL (fin de liste) :
  //    Si on est arrivé ici (aucune regex précise n'a matché) MAIS la requête contient
  //    un lexique DOMAINE EXPLICITE (hopital / unité / incident) → on route DIRECTEMENT
  //    vers la fonction STATUT correspondante (plutôt que le fallback "je n'ai pas compris").
  //    — Permet de matcher "sur les hopitaux", "les hopitaux", "unité FAR", "tous les incidents", etc.
  //    — On laisse passer SI et seulement SI le mot lexique apparaîssent (pas de faux positif).
  const universalHopital = /(hopital|hospinet|sante|santé|hopitaux|etablissement|etablissements|hopitaux|rea|lits|hospi)/i.test(nq);
  const universalUnite   = /(unite|equipe|unité|unités|équipe|far|bataillon|compagnie|unites)/i.test(nq);
  const universalIncident = /(incident|incidents|evenement|alerte|operation|intervention)/i.test(nq);
  if (universalHopital) return hospitalsStatus(q, ctx);
  if (universalUnite && !universalIncident) return unitsStatus(q, ctx); // évitons "unite d'incident"
  if (universalIncident) return incidentsList(q, ctx);

  // Attributs d'incident (pré-déclarés car utilisés dans l'if juste après)
  const incidentAttrCue = /(statut|status|s[eé]v[ée]rit[ée]|gravit[ée]|niveau|localis|position|coordon|lieu|ville|r[eé]gion|description|d[eé]tail|informations?|t[iy]tre|nom|type|cat[eé]gorie|commentaire|note|historique|d[eé]clench[ée]|d[eé]but|date|horaire|creation|cr[ée]|maj)/i;
  const pronounsCue = /(quel\s+est|quelle\s+est|quels\s+sont|quelles\s+sont|c['e]st\s+quoi|ou\s+est|o[uù]\s+se\s+trouve|donne[\s-]moi|montre|affiche|liste|indique|peux[\s-]tu\s+me\s+dire|dis[\s-]moi|r[eé]sum[eé]|synth[ée]se)/i;
  const possessiveCue = /(son\s+statut|sa\s+(s[eé]v|s[eé]vé|grav)|sa\s+localis|ses\s+d[eé]tails|son\s+titre|son\s+type|sa\s+r[eé]gion|o[uù]\s+il\s+est|comment\s+il\s+(est|va)|est[- ]ce\s+qu['i]l\s+est)/i;

  // détail incident / attributs d'incident
  if (
    /detail|informations.*incident|fiche.*incident|qu'est ce que.*incident|en dire plus|en savoir plus/.test(nq) ||
    (hasIncCue && /incident|evenement|operation|alerte|zone|region/.test(nq) && !/unite|equipe|mobilis|dispatch/.test(nq)) ||
    (ctx.currentIncidentId && (incidentAttrCue.test(q) || pronounsCue.test(q) || possessiveCue.test(q))) ||
    (hasIncCue && (incidentAttrCue.test(q) || possessiveCue.test(q)))
  ) {
    const sub = classifyIncSubIntent(q);
    return incidentConcise(q, ctx, sub);
  }
  if (hasIncCue && (nq.length < 25 || /^inc[- ]?\d+$/i.test(q.trim()))) {
    const sub = classifyIncSubIntent(q);
    return incidentConcise(q, ctx, sub);
  }

  // liste incidents (par défaut si pas d'autre cue mais parle d'incidents)
  if (/liste.*incident|tous.*incident|combien.*incident|quel.*incident|incident.*ouverte|incident.*ferme|incident.*haut|incident.*critique|incident.*region|par region/.test(nq)) return incidentsList(q, ctx);

  // reachability (unités pour un lieu avec capacité/délai)
  if (/unite|equipe|atteindre|rejoindre|mobilis|envoyer|dispatch|proche|capable|peut|peuvent|assistance.*unite|soutien|renfort|helico|medevac|evasan/.test(nq)) return reachability(q, ctx);

  // Fallback 1 : si la question contient un incident mais n'est pas catégorisée
  if (hasIncCue) return incidentDetails(q, ctx);

  // Fallback 2 : on tente une recherche d'équipement (mot-clés)
  const words = q.trim().split(/\s+/).filter((w) => w.length >= 4);
  if (words.length && ctx.equipment.some((e) => words.some((w) => norm(e.desig).includes(norm(w)) || norm(e.cat).includes(norm(w))))) {
    return equipmentSearch(q, ctx);
  }

  // Fallback 3 (dernier) : intention non reconnue.
  // → TEXTE AFFICHÉ COURT (1 phrase + chips) MAIS ON PASSE L'ENSEMBLE DES DONNÉES (globalOverview struct) AU LLM POUR QU'IL PUISSE RÉPONDRE CONTEXTUALISÉ MÊME HORS RÉGEX.
  const overview = globalOverview(q, ctx);
  return {
    intent: "unknown",
    layer1: "interprétation non reconnue — contexte globalOverview transmis au LLM",
    text: "Je n'ai pas compris exactement ta requête. Reformule avec un mot-clé comme « incidents » / « hôpitaux » / « unités » / « situation globale » ou bien sélectionne une suggestion ci-dessous.",
    units: overview.units,
    incidents: overview.incidents,
    hospitals: overview.hospitals,
    quakes: overview.quakes,
    topEquip: overview.topEquip,
    stats: overview.stats,
    cross: undefined,
    suggestions: [
      { label: "Situation globale", query: "Situation globale opérationnelle", priority: "primary" as const },
      { label: "Situation hôpitaux", query: "situation des hôpitaux" },
      { label: "Combien d'incidents", query: "combien d'incidents en cours" },
      { label: "Détail INC-2607", query: "Détail INC-2607" },
      { label: "Analyse croisée INC-2607", query: "Analyse croisée INC-2607" },
      { label: "SITREP", query: "SITREP incidents en cours" },
    ],
  };
}

/** Message utilisateur transmis au LLM : requête + résultat Couche 1 à reformuler. */
export function buildLlmUserMessage(query: string, answer: AiAnswer): string {
  // 🚨 CRITIQUE 13/08/26 : Qwen2.5:14b (modelfile Ollama) a n_ctx_train=32768 SEULEMENT.
  // Requesting num_ctx > 32768 → Ollama WARN "too large for model" et FORCE -c 32768.
  // TOUT DOIT RENTRER DANS 32 768 tokens (system prompt + historique + user msg + assistant answer).
  // RÈGLE DE SÉCURITÉ ABSOLUE : 1 message user (celui-ci) ≤ ~5 000 tokens.
  //
  // 🔥🔥 14/08/26 : Augmentation ciblée des quotas LLM_MAX_ROWS :
  //         - LLM_MAX_ROWS_HOPITAUX = 200 (tous les 113 hôpitaux transmis pour répondre « taux lits disponibles »)
  //         - LLM_MAX_ROWS_INCIDENTS = 60 (tous les incidents OUVERTS)
  //         - LLM_MAX_ROWS_UNITES = 40 (toutes les unités FAR/RM)
  //         - LLM_MAX_ROWS_EQUIP = 30 (top équipements)
  //         - LLM_MAX_ROWS = 6 (quotidien généraliste default : croisements, seismes etc.)
  // → JSON transmis est tronqué dynamiquement si > 12 000 caractères (GARANTIE ~4 000 tokens).
  const LLM_MAX_ROWS = 6;
  const LLM_MAX_ROWS_HOPITAUX = 200;
  const LLM_MAX_ROWS_INCIDENTS = 60;
  const LLM_MAX_ROWS_UNITES = 40;
  const LLM_MAX_ROWS_EQUIP = 30;
  const MAX_SUMMARY_CHARS = 600;
  const MAX_JSON_CHARS = 12000; // ~4 000 tokens max pour le JSON data → garantit rentrer dans 32K ctx total.
  const data: Record<string, unknown> = {};
  // 🚨 13/08/26 FUITE ÉCHO JSON: ne JAMAIS transmettre data.intention=data.indice_moteur.
  //    - greetings/"unknown" font echo ```json {intention:greeting}``` dans la réponse (mistral 7B miroir)
  //    - la reformulation n'a PAS besoin de "intention" détectée par la Couche 1
  //    - indice_moteur est DEJA present dans `summaryText` (## RÉSUMÉ MOTEUR DÉTERMINISTE)
  // if (answer.intent) data.intention = answer.intent;
  // if (answer.layer1) data.indice_moteur = answer.layer1;

  if (answer.units?.length) data.unites = answer.units.slice(0, LLM_MAX_ROWS_UNITES).map((u) => ({
    id: u.id, nom: u.nom, type: u.type ?? "—", ville: u.ville, dispo: u.dispo,
    readiness_pct: u.readiness ?? null, capacites: u.caps ?? [], score: u.score ?? null, ETA_min: u.etaMin,
  }));

  if (answer.incidents?.length) data.incidents = answer.incidents.slice(0, LLM_MAX_ROWS_INCIDENTS).map((i: AiIncidentRow) => ({
    id: i.id, titre: i.titre, region: i.region, severite: i.sev, statut: i.st,
    declare: i.declared ?? i.time, type: i.type, lieu: i.lieu,
    bilan_humain: i.casualties ? {
      deces: i.casualties.dead, blesses: i.casualties.injured,
      disparus: i.casualties.missing, secourus: i.casualties.rescued ?? 0,
    } : undefined,
  }));

  if (answer.hospitals?.length) data.hopitaux = answer.hospitals.slice(0, LLM_MAX_ROWS_HOPITAUX).map((h: AiHospitalRow) => ({
    nom: h.nom ?? h.name ?? "Établissement", ville: h.ville, type: h.kind ?? "—",
    lits: h.lits, occupation_pct: h.occPct,
    occupation_rea_pct: h.icuPct ?? null,
    rea: h.rea, rea_libres: Math.max(0, h.rea - Math.round(h.rea * (h.icuPct ?? 0) / 100)),
    lits_disponibles: Math.max(0, h.lits - Math.round(h.lits * (h.occPct ?? 0) / 100)),
    distance_km: h.distKm ?? null,
  }));

  if (answer.stats) data.statistiques = answer.stats;
  if (answer.topEquip?.length) data.equipements = answer.topEquip.slice(0, LLM_MAX_ROWS_EQUIP).map((e) => ({
    reference: e.id, designation: e.desig, categorie: e.cat, stock: e.stock, etat: e.cond,
    seuil_alerte: e.seuil, unite: e.unit,
  }));
  if (answer.quakes?.length) data.seismes = answer.quakes.slice(0, LLM_MAX_ROWS);
  if (answer.cross) {
    const croppedCross: Partial<AiCrossBlock> = {};
    if (answer.cross.incident) croppedCross.incident = answer.cross.incident;
    if (answer.cross.recommendedUnits?.length) croppedCross.recommendedUnits = answer.cross.recommendedUnits.slice(0, LLM_MAX_ROWS);
    if (answer.cross.hospitals?.length) croppedCross.hospitals = answer.cross.hospitals.slice(0, LLM_MAX_ROWS_HOPITAUX);
    if (answer.cross.unitEquipment?.length) croppedCross.unitEquipment = answer.cross.unitEquipment.slice(0, LLM_MAX_ROWS).map(ue => ({ unitName: ue.unitName, equipment: ue.equipment?.slice(0, 2) ?? [] }));
    if (answer.cross.quakes?.length) croppedCross.quakes = answer.cross.quakes.slice(0, LLM_MAX_ROWS);
    if (answer.cross.zones?.length) croppedCross.zones = answer.cross.zones.slice(0, 3).map(z => ({ nom: z.nom, count: z.count, severity: z.severity, ll: z.ll, ids: z.ids }));
    if (answer.cross.mapFocus) croppedCross.mapFocus = answer.cross.mapFocus;
    data.analyse_croisee = croppedCross;
  }

  // Module prédictions risques (réel, 100% data ARGOS) — top 3 seulement (tokens limit)
  // On transmet uniquement via `ctxNotes` français naturel, JAMAIS dans data → pas d'écho JSON.
  const riskCtx: RiskPrediction[] | undefined = (answer as unknown as { _riskCtx?: RiskPrediction[] })?._riskCtx;
  const riskTop = riskCtx ? riskCtx.filter(p => !p.dismissed).sort((a, b) => b.score - a.score).slice(0, 3) : [];

  // Version simplifiée (résumé markdown) pour aider Qwen même s'il parse mal le JSON
  // 🔥 TRONQUÉ 600 CARACTÈRES MAX (answer.text faisait 40000 caractères avant fix → overflow)
  // 🔥🔥 13/08/26: cleanFinalText → SUPPRIME phrases vides "Aucune donnée complémentaire / Aucun autre incident..."
  //       AVANT summaryClean (filtre CSV) et AVANT le troncage (on enlève des caractères inutiles).
  const summaryRaw = cleanFinalText(answer.text ?? "");
  const summaryClean = summaryRaw
    .split(/\r?\n/)
    .filter((line) => {
      // Supprimer lignes TABLEAU CSV brut (ÉTABLISSEMENTS / UNITÉS / INCIDENTS en header en MAJUSCULES,
      // puis lignes avec 2+ tabs ou pipes) — évite l'écho par le LLM des 8 hôpitaux.
      const stripped = line.trim();
      if (!stripped) return true;
      if (/^[A-ZÉÈÊÀÂÔÛÇ\s]{4,}(?:\t| {2,}|$)/.test(stripped)) return false;
      if (/[A-Z][A-ZÉÈÊÀÂÔÛÇ\s]+\t/.test(stripped) && stripped.split(/\t/).length >= 3) return false;
      if (stripped.startsWith("---") && stripped.replace(/-/g, "").trim() === "") return false;
      return true;
    })
    .join("\n");
  const summaryText = summaryClean.length > MAX_SUMMARY_CHARS
    ? summaryClean.slice(0, MAX_SUMMARY_CHARS) + "\n[…résumé tronqué pour contexte 32K…]"
    : summaryClean;

  // Notes contextuelles EN FRANÇAIS NATUREL (pas dans JSON → pas de fuite de noms de champs)
  const ctxNotes: string[] = [];
  if (answer.hospitals?.length) ctxNotes.push(`${answer.hospitals.length} établissements de santé au total, ${Math.min(LLM_MAX_ROWS_HOPITAUX, answer.hospitals.length)} détaillé(s) dans JSON (tous transmis sauf si >200).`);
  if (answer.incidents?.length) ctxNotes.push(`${answer.incidents.length} incidents au total, ${Math.min(LLM_MAX_ROWS_INCIDENTS, answer.incidents.length)} détaillé(s).`);
  if (answer.units?.length) ctxNotes.push(`${answer.units.length} unités au total, ${Math.min(LLM_MAX_ROWS_UNITES, answer.units.length)} détaillée(s).`);
  if (answer.topEquip?.length) ctxNotes.push(`${answer.topEquip.length} références équipement au total, ${Math.min(LLM_MAX_ROWS_EQUIP, answer.topEquip.length)} détaillée(s).`);
  if (riskTop.length) {
    const items = riskTop.map((p, i) => `${i + 1}. ${p.label} · score ${p.score}/100 · ${p.level === "eleve" ? "élevé" : p.level === "modere" ? "modéré" : p.level} · horizon ${p.horizon}`).join(" ; ");
    ctxNotes.push(`Prédictions risques · ${riskTop.length} estimation(s) prioritaires : ${items}.`);
  }

  // Garantie token : si le JSON data dépasse MAX_JSON_CHARS ~12 000 (~4 000 tokens), on tronque
  // progressivement hopitaux/incidents/unites/equipements jusqu'à rentrer.
  let jsonStr = JSON.stringify(data);
  const tryCrop = <T extends unknown[]>(key: string, keepN: number) => {
    const arr = (data as Record<string, unknown[]>)[key];
    if (!Array.isArray(arr) || arr.length <= keepN) return;
    (data as Record<string, unknown[]>)[key] = arr.slice(0, keepN);
    jsonStr = JSON.stringify(data);
  };
  // Boucle de réduction (→ dans le pire cas on retombe sur quotas LLM_MAX_ROWS basiques)
  const cropSteps: [string, number][] = [
    ["equipements", Math.max(6, Math.floor(LLM_MAX_ROWS_EQUIP / 2))],
    ["unites", Math.max(6, Math.floor(LLM_MAX_ROWS_UNITES / 2))],
    ["incidents", Math.max(6, Math.floor(LLM_MAX_ROWS_INCIDENTS / 2))],
    ["hopitaux", Math.max(20, Math.floor(LLM_MAX_ROWS_HOPITAUX / 4))],
    ["incidents", 8],
    ["unites", 6],
    ["equipements", 4],
    ["hopitaux", 8],
  ];
  let stepIdx = 0;
  while (jsonStr.length > MAX_JSON_CHARS && stepIdx < cropSteps.length) {
    tryCrop(cropSteps[stepIdx][0], cropSteps[stepIdx][1]);
    stepIdx += 1;
  }

  const lines: string[] = [];
  lines.push("## QUESTION OPÉRATEUR");
  lines.push(`« ${query} »`);
  lines.push("");
  if (ctxNotes.length > 0) {
    lines.push("## CONTEXTE GLOBAL");
    lines.push(ctxNotes.join(" "));
    lines.push("");
  }
  lines.push("## DONNÉES STRUCTURÉES DÉTAILLÉES (seulement celles-ci — AUCUNE invention autorisée)");
  lines.push("```json");
  // `jsonStr` porte déjà exactement cette sérialisation : la boucle de
  // troncature ci-dessus le réaffecte à chaque palier. Re-sérialiser ~12 000
  // caractères ici serait un travail synchrone de plus sur le thread principal,
  // juste avant l'appel réseau — donc directement dans la latence perçue.
  lines.push(jsonStr);
  lines.push("```");
  lines.push("");
  lines.push("## RÉSUMÉ MOTEUR DÉTERMINISTE (tu peux réutiliser, reformuler)");
  lines.push(summaryText || "(vide)");
  lines.push("");
  lines.push("## TA RÉPONSE MAINTENANT (français, concis, factuel, markdown autorisé, titres ###, listes à puces, **gras** pour chiffres clés, 1 tableau Markdown structuré si tu dois comparer PLUSIEURS hôpitaux/incidents. Si des données sont DANS le JSON ci-dessus, tu les utilises TOUTES. PAS de blocs code, PAS de JSON dans ta réponse.)");
  lines.push("");

  return lines.join("\n");
}
