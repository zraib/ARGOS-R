// ============================================================================
// ARGOS — assistant IA · Intentions « hôpitaux » : état, plus proches, accessibilité.
//
// Extrait de l'ancien `assistant.ts` (2 782 lignes) lors de la refactorisation :
// même code, découpé par responsabilité pour être lisible, testable et
// modifiable sans relire le tout. Voir `index.ts` pour la surface publique.
// ============================================================================

import { resolveTarget } from "../enrich";
import { parseCapability, parseEquipCategory, parseThreshold } from "./equipment";
import { DISPO_LABEL, INCIDENT_PLACE, UNIT_CODE, norm } from "../labels";
import { hospitalRow, incidentRow } from "../rows";
import type { AiAnswer, AiContext, AiHospitalRow, AiUnitResult } from "../types";
import { etaMinutes, UNIT_CAPS, CAP_LABELS } from "@/lib/reco";
import type { Hospital } from "@/lib/types";
import { suggestionsForIncident, suggestionsGeneric, withValidIncident } from "./guard";

// --- Intentions : existentes (gardées) ------------------------------------

export function reachability(q: string, ctx: AiContext): AiAnswer {
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


// Mots à retirer avant de chercher un nom de ville : les mots-outils de la
// question et le vocabulaire hospitalier. Les LIMITES DE MOTS sont
// indispensables : sans elles, l'alternative « a » (et « de », « du », « les »)
// mangeait les lettres à l'intérieur des noms — « casablanca » devenait
// « c s bl nc » et aucune ville n'était plus reconnue.
const MOTS_OUTILS = /\b(liste|etat|statut|bilan|situation|vue|apercu|panorama|tous|tout|ensemble|capacite|saturation|occupation|disponibilite|les|des|du|de|la|le|l|a|au|aux|pour|sur|dans|quelle|quel|quels|quelles|combien|y|il)\b/g;
const MOTS_SANTE = /\b(hopital|hopitaux|hospinet|hospi|etablissement|etablissements|sante|chu|chr|chp|clinique|cliniques|rea|lit|lits)\b/g;

/**
 * Extrait une ville d'une question « hôpitaux de X ». D'abord contre les villes
 * RÉELLEMENT présentes dans le catalogue des hôpitaux (exact, puis la plus
 * longue qui correspond — évite Fès ⊂ Safi), sinon une liste de villes usuelles.
 * Retourne `null` dès que rien d'exploitable ne reste : la question porte alors
 * sur le réseau entier.
 */
export function extractHospitalCityFromQuery(q: string, hospitals: Hospital[]): { villeNorm: string; villeDisplay: string } | null {
  const stripped = norm(q)
    .replace(/[?!.,;:'"()]/g, " ")
    .replace(MOTS_SANTE, " ")
    .replace(MOTS_OUTILS, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Sous trois caractères, on ne devine pas une ville.
  if (stripped.length < 3) return null;
  const compact = stripped.replace(/[\s-]/g, "");

  let best: { villeNorm: string; villeDisplay: string; score: number } | null = null;
  const vues = new Set<string>();
  for (const h of hospitals) {
    const vRaw = (h.ville || "").trim();
    if (!vRaw) continue;
    const v = norm(vRaw);
    if (!v || vues.has(v)) continue;
    vues.add(v);
    const vCompact = v.replace(/[\s-]/g, "");
    let score = 0;
    if (stripped === v || stripped === v.replace(/-/g, " ")) score = 1000 + v.length;
    else if (compact === vCompact) score = 950 + v.length;
    else if (new RegExp(`(^| )${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(stripped)) score = 800 + v.length;
    else if (v.includes(stripped)) score = 700 + stripped.length;
    else if (vCompact.includes(compact) || compact.includes(vCompact)) score = 300 + v.length;
    if (score > 0 && (!best || score > best.score)) best = { villeNorm: v, villeDisplay: vRaw, score };
  }
  if (best) return { villeNorm: best.villeNorm, villeDisplay: best.villeDisplay };

  // Repli : villes usuelles, si le catalogue des hôpitaux est vide ou muet.
  const SEED: [RegExp, string][] = [
    [/(^| )casa(blanca)?( |$)/, "Casablanca"], [/(^| )rabat( |$)/, "Rabat"], [/(^| )marrakech( |$)/, "Marrakech"],
    [/(^| )fe[sz]( |$)/, "Fès"], [/(^| )tanger( |$)/, "Tanger"], [/(^| )agadir( |$)/, "Agadir"], [/(^| )meknes( |$)/, "Meknès"],
    [/(^| )oujda( |$)/, "Oujda"], [/(^| )tetouan( |$)/, "Tétouan"], [/(^| )safi( |$)/, "Safi"], [/(^| )kenitra( |$)/, "Kénitra"],
    [/(^| )nador( |$)/, "Nador"], [/(^| )beni ?mellal( |$)/, "Béni Mellal"], [/(^| )errachidia( |$)/, "Errachidia"],
    [/(^| )ouarzazate( |$)/, "Ouarzazate"], [/(^| )temara( |$)/, "Témara"], [/(^| )mohammedia( |$)/, "Mohammedia"],
    [/(^| )taza( |$)/, "Taza"], [/(^| )settat( |$)/, "Settat"], [/(^| )taroudant( |$)/, "Taroudant"],
    [/(^| )al ?hoceima( |$)/, "Al Hoceïma"], [/(^| )sale( |$)/, "Salé"], [/(^| )guercif( |$)/, "Guercif"],
    [/(^| )berkane( |$)/, "Berkane"], [/(^| )tiznit( |$)/, "Tiznit"], [/(^| )essaouira( |$)/, "Essaouira"],
    [/(^| )chefchaouen( |$)/, "Chefchaouen"], [/(^| )larache( |$)/, "Larache"], [/(^| )laayoune( |$)/, "Laâyoune"],
    [/(^| )dakhla( |$)/, "Dakhla"],
  ];
  for (const [re, name] of SEED) if (re.test(stripped)) return { villeNorm: norm(name), villeDisplay: name };
  return null;
}


export function hospitalsStatus(q: string, ctx: AiContext): AiAnswer {
  // Une ville dans la question → seulement ses établissements.
  const hospitals = ctx.hospitals ?? [];
  const cityMatch = extractHospitalCityFromQuery(q, hospitals);
  if (cityMatch) return hospitalsByCity(q, ctx, cityMatch);
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
    suggestions: suggestionsGeneric({
      national: ["Hôpitaux de Marrakech", "Hôpitaux les plus proches d'Al Haouz"],
      primary: { label: "Posture globale hôpitaux", query: "Posture globale hôpitaux ?" },
    }),
    analytics: ctx.analytics ?? null,
  };
}

/**
 * « Hôpitaux de Marrakech », « CHU de Casablanca », « liste hôpitaux de Fès » :
 * SEULEMENT les établissements de la ville demandée (ville normalisée exacte,
 * repli sous-chaîne si aucun exact). Jamais la liste entière.
 */
export function hospitalsByCity(q: string, ctx: AiContext, cityOverride?: { villeNorm: string; villeDisplay: string }): AiAnswer {
  const hospitals = ctx.hospitals ?? [];
  const city = cityOverride ?? extractHospitalCityFromQuery(q, hospitals);
  if (!city) return hospitalsStatus("", ctx);
  const { villeNorm, villeDisplay } = city;
  const exact = hospitals.filter((h) => norm(h.ville || "") === villeNorm);
  let rows = exact.map((h) => hospitalRow(h));
  if (!rows.length) {
    const fuzzy = hospitals.filter((h) => norm(h.ville || "").includes(villeNorm) || villeNorm.includes(norm(h.ville || "")));
    rows = fuzzy.map((h) => hospitalRow(h));
  }
  rows.sort((a, b) => b.occPct - a.occPct);

  const avg = (arr: AiHospitalRow[]) => arr.length ? Math.round(arr.reduce((a, h) => a + h.occPct, 0) / arr.length) : 0;
  const avgRea = (arr: AiHospitalRow[]) => arr.length ? Math.round(arr.reduce((a, h) => a + h.icuPct, 0) / arr.length) : 0;
  const saturated = rows.filter((h) => h.occPct >= 90 || h.icuPct >= 95);
  const mil = rows.filter((h) => h.kind === "mil");
  const civ = rows.filter((h) => h.kind?.startsWith("civ"));
  const litsTot = rows.reduce((s, h) => s + h.lits, 0);
  const litsOcc = rows.reduce((s, h) => s + Math.round(h.lits * h.occPct / 100), 0);
  const litsDispo = Math.max(0, litsTot - litsOcc);
  const reaTot = rows.reduce((s, h) => s + h.rea, 0);
  const reaOcc = rows.reduce((s, h) => s + Math.round(h.rea * h.icuPct / 100), 0);
  const reaDispo = Math.max(0, reaTot - reaOcc);

  const lines: string[] = [];
  if (!rows.length) {
    lines.push(`❌ Aucun établissement hospitalier répertorié à **${villeDisplay}** dans le catalogue IRIS à l'instant T.`);
    lines.push("Les hôpitaux sont classés par ville officielle (champ ville normalisé). Vérifie éventuellement une ville voisine.");
  } else {
    lines.push(`HÔPITAUX DE **${villeDisplay}** · ${rows.length} établissement(s) · ${litsTot.toLocaleString("fr-FR")} lits au total · **${litsDispo.toLocaleString("fr-FR")} lits disponibles** (${litsTot ? Math.round(litsDispo * 100 / litsTot) : 0}% marge) · REA totale : ${reaTot} · REA libres **${reaDispo}**`);
    if (mil.length) lines.push(`Militaire (${mil.length}) : occ. moyenne ${avg(mil)}% · REA moyenne ${avgRea(mil)}%`);
    if (civ.length) lines.push(`Civil (${civ.length}) : occ. moyenne ${avg(civ)}% · REA moyenne ${avgRea(civ)}%`);
    if (saturated.length) {
      lines.push(`Établissements sous tension (≥90% occupation lits ou ≥95% REA) : ${saturated.length}`);
      lines.push(...saturated.map((h) => `  ⚠ ${h.nom} · occ ${h.occPct}% · REA ${h.icuPct}% · lits libres ${Math.max(0, h.lits - Math.round(h.occPct * h.lits / 100))} · REA libres ${Math.max(0, h.rea - Math.round(h.icuPct * h.rea / 100))}`));
    } else {
      lines.push("Aucun établissement sous tension dans cette ville.");
    }
    lines.push(`ÉTABLISSEMENTS DE **${villeDisplay.toUpperCase()}** (du PLUS saturé au MOINS saturé — chaque établissement transmis dans JSON pour réponse détaillée) :`);
    lines.push(...rows.map((h) => `  • ${h.nom} · Type : ${h.kind === "mil" ? "Militaire" : h.kind?.startsWith("civ") ? "Civil" : h.kind || "—"} · occ ${h.occPct}% (${Math.max(0, h.lits - Math.round(h.occPct * h.lits / 100))} lits libres sur ${h.lits}) · REA ${h.icuPct}% (${Math.max(0, h.rea - Math.round(h.icuPct * h.rea / 100))} REA libres sur ${h.rea})`));
  }
  return {
    intent: "hospitals_by_city",
    layer1: `hôpitaux de ${villeDisplay} : établissements ciblés, occupation lits/REA, sous-tension locale`,
    text: lines.join("\n"),
    hospitals: rows.slice(0, Math.max(50, rows.length)),
    stats: rows.length ? {
      totalHospitals: rows.length,
      totalLits: litsTot,
      litsDisponibles: litsDispo,
      occMoyennePct: avg(rows),
      totalRea: reaTot,
      reaDisponibles: reaDispo,
      etablissementsSousTension: saturated.length,
    } : undefined,
    suggestions: [`Situation globale hôpitaux ${villeDisplay}`, "État du réseau hospitalier national", "Hôpitaux les plus proches d'un incident"],
    analytics: ctx.analytics ?? null,
  };
}


export function hospitalsNearest(q: string, ctx: AiContext): AiAnswer {
  return withValidIncident(q, ctx, "hospitals_nearest", (target) => {
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
      suggestions: suggestionsForIncident(target, ["Situation globale"]),
    };
  });
}
