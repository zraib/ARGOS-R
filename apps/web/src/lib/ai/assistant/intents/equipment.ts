// ============================================================================
// ARGOS — assistant IA · Intentions « équipements » : recherche, seuils, ruptures.
//
// Extrait de l'ancien `assistant.ts` (2 782 lignes) lors de la refactorisation :
// même code, découpé par responsabilité pour être lisible, testable et
// modifiable sans relire le tout. Voir `index.ts` pour la surface publique.
// ============================================================================

import { COND_LABEL, norm } from "../labels";
import type { AiAnswer, AiContext } from "../types";
import { type Capability } from "@/lib/reco";

/**
 * Vue STOCKS CRITIQUES / ÉTAT DES ÉQUIPEMENTS (ruptures, HS, sous seuil).
 * Déclenchée quand l'utilisateur demande l'état global des stocks / ruptures
 * (pas une recherche par mot-clé). → retourne 100% réel depuis ctx.equipment.
 */
export function equipmentCriticalStatus(_q: string, ctx: AiContext): AiAnswer {
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
    intent: "equipment_critical_status",
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


export function parseThreshold(q: string): number | null {
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


export function parseEquipCategory(q: string): string | null {
  const nq = norm(q);
  if (/electrogene|generateur|courant|eclairage|energie/.test(nq)) return "Énergie";
  if (/tente|campement|abri/.test(nq)) return "Campement";
  if (/brancard|medical/.test(nq)) return "Médical";
  return null;
}


export function parseCapability(q: string): Capability | null {
  const nq = norm(q);
  for (const [re, cap] of CAP_KEYWORDS) if (re.test(nq)) return cap;
  return null;
}


export function equipmentSearch(q: string, ctx: AiContext): AiAnswer {
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
