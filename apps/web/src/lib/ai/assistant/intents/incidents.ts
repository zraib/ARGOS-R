// ============================================================================
// ARGOS — assistant IA · Intentions « incidents » : liste, détail, SITREP, anomalies, bilan humain.
//
// Extrait de l'ancien `assistant.ts` (2 782 lignes) lors de la refactorisation :
// même code, découpé par responsabilité pour être lisible, testable et
// modifiable sans relire le tout. Voir `index.ts` pour la surface publique.
// ============================================================================

import { resolveTarget } from "../enrich";
import { buildZones } from "./risk";
import { CITY_COORDS, DISPO_LABEL, INCIDENT_PLACE, SEV_LABEL, ST_LABEL, norm } from "../labels";
import { incidentRow, toAiRow } from "../rows";
import type { AiAnswer, AiContext, AiSuggestion, AiUnitResult, IncSubIntent } from "../types";
import { CAP_LABELS, recommend, needFromIncident, haversineKm } from "@/lib/reco";

export function sitrep(_q: string, ctx: AiContext): AiAnswer {
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


export function anomaly(_q: string, ctx: AiContext): AiAnswer {
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
export function worstIncidents(_q: string, ctx: AiContext, topN: 1 | 3 = 1): AiAnswer {
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

/**
 * Réponse CONCISE par attribut d'incident.
 * Utilisée COMME CONTEXTE / FALLBACK : le LLM Qwen reçoit ces données et reformule.
 */
export function incidentConcise(q: string, ctx: AiContext, kind: IncSubIntent): AiAnswer {
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


export function incidentDetails(q: string, ctx: AiContext): AiAnswer {
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


export function incidentsList(q: string, ctx: AiContext): AiAnswer {
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


export function casualtiesSummary(q: string, ctx: AiContext): AiAnswer {
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
    analytics: ctx.analytics ?? null,
  };
}

/** Incidents dans un rayon proche d'une ville (Casablanca, Rabat, etc.). */
export function incidentsNearCity(q: string, ctx: AiContext): AiAnswer {
  const normQ = norm(q);
  const city =
    /pr[eè]s\s+de\s+([a-zàâçéèêëîïôûùüÿñæœ\s'-]+?)(?:\s|$|\?|!|,|\.)/.exec(q.toLowerCase())?.[1]?.trim() ??
    /autour\s+de\s+([a-zàâçéèêëîïôûùüÿñæœ\s'-]+?)(?:\s|$|\?|!|,|\.)/.exec(q.toLowerCase())?.[1]?.trim() ??
    /(?:a|à)\s+(casa|casablanca|rabat|marrakech|f[eè]s|tanger|agadir|mekn[eè]s|oujda|t[ée]touan|safi|kenitra|taza|nador|settat|beni mellal)\b/i.exec(normQ)?.[1] ??
    null;
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
    ],
  };
}
