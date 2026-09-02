// ============================================================================
// ARGOS — générateurs de détail déterministes
// Le prototype fabrique les effectifs par unité / services par hôpital à partir
// d'un calcul sur l'index, si bien qu'une unité affiche toujours les mêmes
// lignes. Reproduit ici pour que les écrans de détail collent à l'export au
// pixel près, jusqu'à ce qu'une vraie API le remplace.
// ============================================================================

import type { Dict } from "@/lib/i18n/translations";
import type { BadgeType } from "@/components/ui/Badge";
import type { DashStats, FieldHospital, Hospital, HospitalKind, HospitalServiceKey, Incident, IncidentType, Unit } from "@/lib/types";
import { MED_GRADES, MED_GRADES_CIV, MED_SPECS, POOLS } from "@/lib/data/seed";
import { occBarClass, persStatut } from "@/lib/helpers";
import { fieldKind, hospKind } from "@/lib/hospitals";

// ============================================================================
// Services hospitaliers · source unique de résolution
// ============================================================================
// 1) Si l'hôpital a `services[]` saisis (nouveau flux AddHospital) → utilisés tels quels
// 2) Sinon → fallback dérivation statistique (rétrocompat. hôpitaux créés avant)
// Les clés sont triées dans un ordre stable : REA / Chirurgie / Médecine / Urgences / Pédiatrie.

export const SVC_ORDER: HospitalServiceKey[] = ["rea", "chirurgie", "medecine", "urgences", "pediatrie"];
const SVC_FALLBACK_NAMES: Record<HospitalServiceKey, string> = {
  rea: "Réanimation",
  chirurgie: "Chirurgie",
  medecine: "Médecine interne",
  urgences: "Urgences",
  pediatrie: "Pédiatrie",
};
const SVC_SHARES: Record<HospitalServiceKey, number> = {
  rea: 0.09,
  chirurgie: 0.28,
  medecine: 0.32,
  urgences: 0.18,
  pediatrie: 0.14,
};
const SVC_OCC_PERT: Record<HospitalServiceKey, number> = {
  rea: 1.0,
  chirurgie: 1.05,
  medecine: 0.95,
  urgences: 1.1,
  pediatrie: 0.8,
};

export interface ResolvedHospitalService {
  key: HospitalServiceKey;
  name: string;
  total: number;
  occ: number;
  free: number;
  pct: number;
  source: "stored" | "derived";
}

/**
 * Résout les 5 services d'un hôpital :
 *  · PRIORITÉ 1 : `h.services[]` saisis manuellement → retournés en `source: "stored"`
 *  · PRIORITÉ 2 : dérivation statistique depuis `h.lits` / `h.occ` / `h.rea` / `h.reaOcc` → `source: "derived"`
 * REA est toujours pris depuis h.rea/h.reaOcc si pas de valeur stockée (jamais inventé partagé).
 */
export function resolveHospitalServices(h: Hospital): ResolvedHospitalService[] {
  const globalRatio = h.lits > 0 ? h.occ / h.lits : 0;
  return SVC_ORDER.map((key): ResolvedHospitalService => {
    // 1) stocké ?
    const stored = (h.services ?? []).find((s) => s.key === key);
    if (stored && stored.total >= 0) {
      const total = Math.max(0, stored.total);
      const occ = Math.max(0, Math.min(total, stored.occ));
      const pct = total > 0 ? Math.round((occ / total) * 100) : 0;
      return {
        key,
        name: stored.name || SVC_FALLBACK_NAMES[key],
        total,
        occ,
        free: Math.max(0, total - occ),
        pct,
        source: "stored",
      };
    }

    // 2) fallback dérivation
    if (key === "rea") {
      const total = Math.max(0, h.rea ?? 0);
      const occ = Math.max(0, Math.min(total, h.reaOcc ?? 0));
      const pct = total > 0 ? Math.round((occ / total) * 100) : 0;
      return {
        key,
        name: SVC_FALLBACK_NAMES[key],
        total,
        occ,
        free: Math.max(0, total - occ),
        pct,
        source: "derived",
      };
    }
    const share = SVC_SHARES[key];
    const total = Math.max(0, Math.round(h.lits * share));
    const r = Math.min(1, globalRatio * SVC_OCC_PERT[key]);
    const occ = Math.max(0, Math.min(total, Math.round(total * r)));
    const pct = total > 0 ? Math.round((occ / total) * 100) : 0;
    return {
      key,
      name: SVC_FALLBACK_NAMES[key],
      total,
      occ,
      free: Math.max(0, total - occ),
      pct,
      source: "derived",
    };
  });
}

/**
 * Index déterministe dérivé de l'identifiant (ex. « U3 » → 2), pour reproduire à
 * l'identique les rosters de détail sans dépendre d'un tableau local d'entités.
 */
function idIndex(id: string): number {
  const n = parseInt(id.replace(/\D/g, ""), 10);
  if (!Number.isNaN(n) && n > 0) return n - 1;
  return [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 6;
}

export interface PersonRow {
  grade: string;
  nom: string;
  fonction: string;
  stType: BadgeType;
  stLabel: string;
}
export interface EquipRow {
  desig: string;
  cat: string;
  qty: string;
  etat: string;
  maint: boolean;
}
export interface VehRow {
  type: string;
  plate: string;
  assign: string;
  etat: string;
  maint: boolean;
}

export function unitDetail(unit: Unit) {
  const idx = idIndex(unit.id);

  const pers: PersonRow[] = Array.from({ length: 6 }, (_, j) => {
    const st = persStatut(idx + j);
    const grade = POOLS.grades[(idx + j) % 6];
    return {
      grade,
      nom: grade.startsWith("C") ? POOLS.names[(idx * 2 + j) % 12] : POOLS.names[(idx * 3 + j) % 12],
      fonction: POOLS.fonctions[(idx + j) % 6],
      stType: st.type,
      stLabel: st.label,
    };
  });

  const equip: EquipRow[] = POOLS.equip.map((e, j) => {
    const maint = (idx + j) % 4 === 1;
    return { desig: e[0], cat: e[1], qty: String((((idx + 1) * 7 + j * 3) % 18) + 2), etat: maint ? "Maintenance" : "Opérationnel", maint };
  });

  const vehs: VehRow[] = POOLS.vehs.map((v, j) => {
    const maint = (idx + j) % 5 === 2;
    return {
      type: v,
      plate: `FAR-${2140 + idx * 61 + j * 17}`,
      assign: unit.dispo === "deployed" && j % 2 === 0 ? "Zone Al Haouz" : unit.ville,
      etat: maint ? "Maintenance" : "Opérationnel",
      maint,
    };
  });

  return { pers, equip, vehs };
}

export interface StaffRow {
  grade: string;
  nom: string;
  spec: string;
  stType: BadgeType;
  stLabel: string;
}
export interface BedService {
  name: string;
  total: string;
  occ: string;
  pct: string;
  pctNum: number;
  barCls: string;
}
export interface HospVehRow {
  type: string;
  qty: string;
  assign: string;
  etat: string;
  maint: boolean;
}
export interface FieldCard {
  nom: string;
  /** Catégorie (campagne militaire / campagne civile) pour le symbole. */
  kind: HospitalKind;
  cap: string;
  depuis: string;
  pct: string;
  pctNum: number;
  barCls: string;
  badgeType: BadgeType;
  badgeLabel: string;
}

export function hospitalDetail(h: Hospital, fieldHosps: FieldHospital[], t: Dict) {
  const idx = idIndex(h.id);

  // Le vocabulaire des grades suit le réseau : grades militaires pour le
  // service de santé militaire, qualifications hospitalières pour le civil.
  const grades = hospKind(h) === "mil" ? MED_GRADES : MED_GRADES_CIV;
  const staffRows: StaffRow[] = Array.from({ length: 6 }, (_, j) => {
    const st: [string, BadgeType][] = [["Garde", "medium"], ["Disponible", "active"], ["Repos", "on_hold"]];
    const s = st[(idx + j) % 3];
    return { grade: grades[(idx + j) % 6], nom: POOLS.names[(idx * 5 + j * 2) % 12], spec: MED_SPECS[(idx * 2 + j) % 6], stType: s[1], stLabel: s[0] };
  });

  // Services : utilise ceux saisis si renseignés, sinon dérivation.
  const resolved = resolveHospitalServices(h);
  const beds: BedService[] = resolved.map((r): BedService => {
    const name = r.key === "rea" ? t.icu : r.name;
    return {
      name,
      total: String(r.total),
      occ: String(r.occ),
      pct: `${r.pct} %`,
      pctNum: r.pct,
      barCls: occBarClass(r.pct),
    };
  });

  const vehRows: HospVehRow[] = [
    { type: "Ambulance médicalisée", qty: String(h.amb), assign: h.ville, etat: "Opérationnel", maint: false },
    { type: "VAB sanitaire", qty: String(Math.max(2, Math.round(h.amb / 3))), assign: idx === 1 ? "Zone Al Haouz" : h.ville, etat: "Opérationnel", maint: false },
    { type: "Hélicoptère médicalisé", qty: String(h.heli), assign: idx === 1 ? "Rotations EVASAN" : h.ville, etat: idx === 3 ? "Maintenance" : "Opérationnel", maint: idx === 3 },
  ];

  const fields: FieldCard[] = fieldHosps
    .filter((f) => f.hid === h.id)
    .map((f) => {
      const pct = Math.round((f.occ / f.cap) * 100);
      return {
        nom: f.nom,
        kind: fieldKind(f),
        cap: String(f.cap),
        depuis: f.depuis,
        pct: `${pct} %`,
        pctNum: pct,
        barCls: occBarClass(pct),
        badgeType: f.statut === "op" ? "active" : "on_hold",
        badgeLabel: f.statut === "op" ? t.op_ok : t.op_partial,
      };
    });

  return { staffRows, beds, vehRows, fields };
}

// ============================================================================
// Classification sémantique des types d'incident pour l'affichage bilan
// humain (4 catégories : trauma classique / épidémie / NRBC / mixte inconnu)
// ============================================================================
// Un même type peut avoir des alias historiques :
//   CBRN ↔ NRBC ↔ chemical ↔ industrial (tous = HAZMAT)
//   epidemic ↔ pandemie / maladie (tous = BIOLOGIQUE)
// ============================================================================

export function isEpidemicType(type: string | null | undefined): boolean {
  if (!type) return false;
  const t = String(type).toLowerCase();
  return (
    t === "epidemic" ||
    t.includes("epidemi") ||
    t.includes("epidem") ||
    t === "pandemic" ||
    t === "outbreak" ||
    t.includes("maladie") ||
    t.includes("chamber") === false && (t.includes("cholera") || t === "foyer")
  );
}

export function isHazmatType(type: string | null | undefined): boolean {
  if (!type) return false;
  const t = String(type).toLowerCase();
  if (["nrbc", "nrbcc", "nrb", "cbrn", "cbrnc", "chemical", "industrial", "chimique", "radiologique", "nucleaire", "biologique_risk", "toxic", "toxique"].includes(t)) return true;
  if (t.includes("nrbc") || t.includes("cbrn")) return true;
  if (t.includes("chim") && !t.includes("chirurg")) return true;
  if (t.includes("industriel") || t.includes("industrial")) return true;
  if (t.includes("radiol") || t.includes("nucle") || t.includes("toxique") || t.includes("toxic")) return true;
  if (t.includes("gaz") && (t.includes("tox") || t.includes("indust") || t.includes("cbrn") || t.includes("nrbc"))) return true;
  return false;
}

export function casualtyKind(incType: string | null | undefined): "trauma" | "epidemic" | "hazmat" {
  if (isEpidemicType(incType)) return "epidemic";
  if (isHazmatType(incType)) return "hazmat";
  return "trauma";
}

// ============================================================================
// Palette sémantique · types d'incident → couleur hex
// Source unique (UI Bilan humain, bloc Incidents, modales, SA Panel)
// ============================================================================
export const INCIDENT_TYPE_COLORS: Record<IncidentType | string, string> = {
  earthquake: "#F87171",
  flood: "#3B82F6",
  wildfire: "#F59E0B",
  landslide: "#CA8A04",
  epidemic: "#EC4899",
  industrial: "#A855F7",
  nrbc: "#A855F7",
  cbrn: "#A855F7",
  chemical: "#A855F7",
};

export function incidentColor(type: string): string {
  return INCIDENT_TYPE_COLORS[type] ?? "#4B5563";
}

// ============================================================================
// Bilan humain · dimensions sémantiques par type d'incident
// ============================================================================
// - trauma (séisme/inondation/feu/accident routier…) : injured = blessés
// - epidemic                               : infected (injured alias retro)
// - hazmat (nrbc / industrial / chimique) : contaminated + exposed
//                                            (injured alias retro contaminated)
// ============================================================================

/** Une dimension bilan humain avec sa couleur hex. */
export interface CasualtyDim {
  key: "dead" | "injured" | "missing" | "rescued" | "infected" | "exposed" | "contaminated";
  label: string;
  value: number;
  color: {
    /** ex: "text-pink-600 dark:text-pink-400" */
    text: string;
    /** ex: "bg-pink-500/10" */
    bg: string;
    /** ex: "border-t-pink-500/50" */
    br: string;
    /** hex (pour bg inline chips) */
    hex: string;
  };
}

/** Une ligne agrégée PAR TYPE d'incident (pour la colonne par type). */
export interface CasualtyPerType {
  type: string;
  dead: number;
  injured: number;
  missing: number;
  infected: number;
  exposed: number;
  contaminated: number;
  rescued: number;
  /** Σ toutes dimensions victimaires */
  total: number;
}

/** Totaux bilan humain + 4 KPIs dynamiques pour la tuile casualties. */
export interface CasualtyAggregate {
  byType: CasualtyPerType[];
  topImpact: Array<{ incident: Incident; impact: number }>;
  totals: {
    dead: number; injured: number; missing: number; rescued: number;
    infected: number; exposed: number; contaminated: number;
  };
  kpis: CasualtyDim[];
  flags: { hasEpidemic: boolean; hasNrb: boolean; hasTrauma: boolean };
}

/**
 * Agrège les victimes des incidents + DashStats vers une structure
 * sémantique unique (1 appel useMemo côté UI).
 *
 * @param incidents Liste des incidents du store.
 * @param dashStats Stats globales API (champs casualties optionnels).
 * @param topLimit Nombre max d'incidents dans topImpact.
 * @param perTypeLimit Nombre max de types dans byType.
 */
export function aggregateCasualties(
  incidents: Incident[],
  dashStats: DashStats | null | undefined,
  topLimit = 4,
  perTypeLimit = 6,): CasualtyAggregate {
  const byType = new Map<string, CasualtyPerType>();
  const totals = { dead: 0, injured: 0, missing: 0, infected: 0, exposed: 0, contaminated: 0, rescued: 0 };
  const topImpact: Array<{ incident: Incident; impact: number }> = [];

  for (const inc of incidents) {
    const c = inc.casualties;
    const d = c?.dead ?? 0;
    const miss = c?.missing ?? 0;
    const resc = c?.rescued ?? 0;
    const injuredRaw = c?.injured ?? 0;
    const kind = casualtyKind(inc.type); // trauma | epidemic | hazmat

    // — Alias rétro-compat : injured → infect / contam / exposé
    // Pour ÉPIDÉMIE : infecté (injured si champ infecté absent)
    const infected =
      c?.infected ??
      (kind === "epidemic" && injuredRaw > 0
        ? injuredRaw
        : 0);
    // Pour HAZMAT (NRBC / industriel / chimique) : contaminé (injured si absent)
    // → exposed aussi (fallback exposé si contaminé absent mais injured là)
    const contaminated =
      c?.contaminated ??
      (kind === "hazmat" && injuredRaw > 0
        ? injuredRaw
        : 0);
    const exposed =
      c?.exposed ??
      (kind === "hazmat" && contaminated === 0 && injuredRaw > 0
        ? injuredRaw
        : 0);
    // Semantic injured (la dim VICTIME PRINCIPALE pour l'UI)
    const semanticInjured =
      kind === "epidemic"
        ? infected
        : kind === "hazmat"
          ? contaminated > 0
            ? contaminated
            : exposed
          : injuredRaw;

    const impact = d + semanticInjured + miss + infected + exposed + contaminated;

    totals.dead += d;
    totals.injured += injuredRaw; // blessés "brut" stats trauma
    totals.missing += miss;
    totals.infected += infected;
    totals.exposed += exposed;
    totals.contaminated += contaminated;
    totals.rescued += resc;

    if (impact > 0) topImpact.push({ incident: inc, impact });

    const cur = byType.get(inc.type) ?? {
      type: inc.type,
      dead: 0, injured: 0, missing: 0, infected: 0, exposed: 0, contaminated: 0, rescued: 0, total: 0,
    };
    cur.dead += d; cur.injured += injuredRaw; cur.missing += miss;
    cur.infected += infected; cur.exposed += exposed; cur.contaminated += contaminated;
    cur.rescued += resc; cur.total += impact;
    byType.set(inc.type, cur);
  }

  const sortedTypes = [...byType.values()].sort((a, b) => b.total - a.total).slice(0, perTypeLimit);
  const sortedTop = [...topImpact].sort((a, b) => b.impact - a.impact).slice(0, topLimit);

  // Fusion DashStats.casualties dans totaux (valeurs globales API ≥ local incident)
  const fromDash = dashStats?.casualties;
  const aggTotals = {
    dead: Math.max(totals.dead, fromDash?.dead ?? 0),
    injured: Math.max(totals.injured, fromDash?.injured ?? 0),
    missing: Math.max(totals.missing, fromDash?.missing ?? 0),
    rescued: fromDash?.rescued ?? (dashStats ? 0 : totals.rescued),
    infected: totals.infected + (fromDash?.infected ?? 0),
    exposed: totals.exposed + (fromDash?.exposed ?? 0),
    contaminated: totals.contaminated + (fromDash?.contaminated ?? 0),
  };

  const hasEpi =
    aggTotals.infected > 0 || incidents.some((i) => casualtyKind(i.type) === "epidemic");
  const hasNrb =
    aggTotals.contaminated > 0 ||
    aggTotals.exposed > 0 ||
    incidents.some((i) => casualtyKind(i.type) === "hazmat");
  const hasTrauma = aggTotals.injured > 0 && !hasEpi && !hasNrb;
  const flags = { hasEpidemic: hasEpi, hasNrb: hasNrb, hasTrauma };

  // Candidates sémantiques (hors décès, triées par priorité)
  const candidates: CasualtyDim[] = [];
  const pushDim = (
    key: CasualtyDim["key"],
    label: string,
    value: number,
    text: string,
    bg: string,
    br: string,
    hex: string,
  ) => candidates.push({ key, label, value, color: { text, bg, br, hex } });

  if (hasEpi) pushDim("infected", "Infectés", aggTotals.infected, "text-pink-600 dark:text-pink-400", "bg-pink-500/10", "border-t-pink-500/50", "#EC4899");
  if (hasNrb) pushDim("contaminated", "Contaminés", aggTotals.contaminated, "text-purple-600 dark:text-purple-400", "bg-purple-500/10", "border-t-purple-500/50", "#A855F7");
  if (hasNrb) pushDim("exposed", "Exposés", aggTotals.exposed, "text-indigo-600 dark:text-indigo-400", "bg-indigo-500/10", "border-t-indigo-500/50", "#6366F1");
  if (aggTotals.injured > 0 || !hasEpi) {
    const label = "Blessés";
    pushDim("injured", label, aggTotals.injured, "text-or-500", "bg-or-500/10", "border-t-or-500/50", "#F59E0B");
  }
  pushDim("missing", "Disparus", aggTotals.missing, "text-gray-600 dark:text-rdia-300", "bg-gray-500/10", "border-t-gray-400/50", "#64748B");
  pushDim("rescued", "Secourus", aggTotals.rescued, "text-green-600 dark:text-green-400", "bg-green-500/10", "border-t-green-500/50", "#10B981");

  // Toujours 1er KPI = Décès
  const deadKpi: CasualtyDim = {
    key: "dead", label: "Décès", value: aggTotals.dead,
    color: { text: "text-danger-500", bg: "bg-danger-500/10", br: "border-t-danger-500/50", hex: "#EF4444" },
  };
  const selected = candidates.filter((c) => c.value > 0).slice(0, 3);
  const fallbacks: CasualtyDim[] = candidates; // fallback pool
  for (const fb of fallbacks) {
    if (selected.length >= 3) break;
    if (!selected.some((s) => s.key === fb.key)) selected.push(fb);
  }
  const kpis = [deadKpi, ...selected.slice(0, 3)];

  return {
    byType: sortedTypes,
    topImpact: sortedTop,
    totals: aggTotals,
    kpis,
    flags,
  };
}

/**
 * Retourne la dimension PRINCIPALE + chips détails sémantiques pour un type
 * d'incident (utilisée dans les lignes « par type » de la tuile casualties).
 */
export function semanticChipsForType(
  r: CasualtyPerType,
): { main?: { label: string; v: number; hex: string }; secondary: Array<{ label: string; v: number; hex: string }> } {
  const secondary: Array<{ label: string; v: number; hex: string }> = [];
  if (r.dead > 0) secondary.push({ label: "Décès", v: r.dead, hex: "#EF4444" });

  let main: { label: string; v: number; hex: string } | undefined;
  const kind = casualtyKind(r.type);

  if (kind === "epidemic") {
    if (r.infected > 0) main = { label: "Infectés", v: r.infected, hex: "#EC4899" };
    if (r.injured > 0) secondary.push({ label: "Blessés", v: r.injured, hex: "#F59E0B" });
    if (r.exposed > 0) secondary.push({ label: "Exposés", v: r.exposed, hex: "#6366F1" });
  } else if (kind === "hazmat") {
    if (r.contaminated > 0) main = { label: "Contaminés", v: r.contaminated, hex: "#A855F7" };
    else if (r.exposed > 0) main = { label: "Exposés", v: r.exposed, hex: "#6366F1" };
    if (r.injured > 0 && (!main || main.v !== r.injured)) {
      secondary.push({ label: "Blessés", v: r.injured, hex: "#F59E0B" });
    }
    if (r.exposed > 0 && r.contaminated > 0) {
      // exposé déjà en main → doublon évité ci-dessus
    }
  } else {
    if (r.injured > 0) {
      if (!main) main = { label: "Blessés", v: r.injured, hex: "#F59E0B" };
      else secondary.push({ label: "Blessés", v: r.injured, hex: "#F59E0B" });
    }
  }

  if (r.missing > 0) secondary.push({ label: "Disparus", v: r.missing, hex: "#64748B" });
  return { main, secondary };
}

