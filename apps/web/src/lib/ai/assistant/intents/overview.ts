// ============================================================================
// ARGOS — assistant IA · Intentions transverses : vue globale, analyse croisée, ORSEC, aide.
//
// Extrait de l'ancien `assistant.ts` (2 782 lignes) lors de la refactorisation :
// même code, découpé par responsabilité pour être lisible, testable et
// modifiable sans relire le tout. Voir `index.ts` pour la surface publique.
// ============================================================================

import { COND_LABEL, DISPO_LABEL, INCIDENT_PLACE, SEV_LABEL, ST_LABEL, UNIT_CODE } from "../labels";
import { hospitalRow, incidentRow } from "../rows";
import type { AiAnswer, AiContext, AiCrossUnitEquip, AiCrossUnitRec, AiIncidentRow } from "../types";
import { CAP_LABELS, recommend, needFromIncident, haversineKm } from "@/lib/reco";
import { suggestionsForIncident, withValidIncident } from "./guard";

export function globalOverview(_q: string, ctx: AiContext): AiAnswer {
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
    analytics: ctx.analytics ?? null,
  };
}


export function crossAnalysis(q: string, ctx: AiContext): AiAnswer {
  return withValidIncident(q, ctx, "cross_analysis", (target) => {
    const place = INCIDENT_PLACE[target.id] ?? target.region;
    const hospitals = ctx.hospitals ?? [];
    const quakes = ctx.quakes ?? [];
    const unitRecs = recommend(needFromIncident(target), ctx.units).filter((r) => !r.excluded).slice(0, 4);
    const hops = hospitals.map((h) => hospitalRow(h, target.ll)).sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999)).slice(0, 4);
    const topUnitIds = new Set(unitRecs.map((r) => r.unit.id));
    const inv = ctx.equipment.filter((e) => {
      const uid = UNIT_CODE[e.unit];
      return uid ? topUnitIds.has(uid) : false;
    }).slice(0, 6);
    const nearQuakes = quakes.filter((qk) => haversineKm([qk.lon, qk.lat], target.ll) < 100).slice(0, 3);

    // Bloc structuré « cross » : décomposition du score et inventaire par unité.
    const incRow: AiIncidentRow & { lieu?: string; coords?: [number, number] } = { ...incidentRow(target), lieu: place, coords: target.ll };
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
      `➤ UNITÉS CLASSÉES ARGOS (score brut, sans préconisation d'engagement) :`,
      ...unitRecs.map((r, i) => {
        const occ = r.breakdown;
        return `  ${i + 1}. ${r.unit.nom} · score ${r.score}/100 (t${occ.travel}/c${occ.capability}/r${occ.readiness}/d${occ.availability}) · ETA ${r.etaMin} min · ${r.matchedCaps.map((c) => CAP_LABELS[c]).join("+") || "—"}`;
      }),
      ``,
      `➤ HÔPITAUX LES PLUS PROCHES :`,
      ...hops.map((h) => `  • ${h.nom} (${h.ville}) · ${h.distanceKm} km / ${h.etaMin} min · occ ${h.occPct}% · REA ${h.icuPct}% · lits libres ${Math.max(0, h.lits - Math.round(h.occPct * h.lits / 100))}`),
      ``,
      inv.length ? `➤ INVENTAIRE lié aux unités du classement ARGOS (score + proximité) :` : "➤ Aucun équipement rattaché aux unités de ce classement.",
      ...inv.map((e) => `  • ${e.desig} · stock ${e.stock}/${e.threshold} · unité ${e.unit} · état ${COND_LABEL[e.cond]}`),
      ``,
      nearQuakes.length ? `➤ CONTEXTE SISMIQUE (<100 km) :` : "➤ Aucun séisme significatif dans un rayon de 100 km.",
      ...nearQuakes.map((qk) => `  • M${qk.mag.toFixed(1)} · ${qk.region} · profondeur ${qk.depth} km · ${new Date(qk.time).toLocaleString("fr-FR", { hour12: false })}`),
    ];
    return {
      intent: "cross_analysis",
      layer1: `cross-data ${target.id} : unités classées × hôpitaux proches × inventaire unités × séismes <100 km`,
      text: lines.join("\n"),
      incidents: [incidentRow(target)],
      units: unitRecs.map((r) => ({ id: r.unit.id, nom: r.unit.nom, ville: r.unit.ville, etaMin: r.etaMin, caps: r.matchedCaps.map((c) => CAP_LABELS[c]), dispo: DISPO_LABEL[r.unit.dispo], within: true })),
      hospitals: hops,
      topEquip: inv.map((e) => ({ id: e.id, desig: e.desig, cat: e.cat, stock: e.stock, cond: COND_LABEL[e.cond], unit: e.unit, seuil: e.threshold })),
      quakes: nearQuakes.map((qk) => ({ id: qk.id, region: qk.region, mag: qk.mag, depth: qk.depth, time: qk.time })),
      cross: { incident: incRow, recommendedUnits, hospitals: hops, unitEquipment, quakes: nearQuakes },
      suggestions: suggestionsForIncident(target, ["Hôpitaux sous tension dans la région", "Rédige le SITREP"]),
    };
  });
}


export function orsecSummary(_q: string, ctx: AiContext): AiAnswer {
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


export function help(_q: string, _ctx: AiContext): AiAnswer {
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
