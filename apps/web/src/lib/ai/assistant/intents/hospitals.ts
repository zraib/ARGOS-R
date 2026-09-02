// ============================================================================
// ARGOS — assistant IA · Intentions « hôpitaux » : état, plus proches, accessibilité.
//
// Extrait de l'ancien `assistant.ts` (2 782 lignes) lors de la refactorisation :
// même code, découpé par responsabilité pour être lisible, testable et
// modifiable sans relire le tout. Voir `index.ts` pour la surface publique.
// ============================================================================

import { resolveTarget } from "../enrich";
import { parseCapability, parseEquipCategory, parseThreshold } from "./equipment";
import { DISPO_LABEL, INCIDENT_PLACE, UNIT_CODE } from "../labels";
import { hospitalRow, incidentRow } from "../rows";
import type { AiAnswer, AiContext, AiHospitalRow, AiUnitResult } from "../types";
import { etaMinutes, UNIT_CAPS, CAP_LABELS } from "@/lib/reco";

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


export function hospitalsStatus(_q: string, ctx: AiContext): AiAnswer {
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
    analytics: ctx.analytics ?? null,
  };
}


export function hospitalsNearest(q: string, ctx: AiContext): AiAnswer {
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
