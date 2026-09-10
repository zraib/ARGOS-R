// ============================================================================
// ARGOS — assistant IA · Fenêtres temporelles, tendances et pics d'activité (calculs purs sur les incidents).
//
// Extrait de l'ancien `assistant.ts` (2 782 lignes) lors de la refactorisation :
// même code, découpé par responsabilité pour être lisible, testable et
// modifiable sans relire le tout. Voir `index.ts` pour la surface publique.
// ============================================================================

import { sevLabel, sevRank } from "./labels";
import { toAiRow } from "./rows";
import type { AiAnswer, AiAnswerStats, AiContext, TemporalBucket } from "./types";

export function trends(_q: string, ctx: AiContext): AiAnswer {
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
    analytics: ctx.analytics ?? null,
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


function sevCounts(rows: { sev?: string }[]): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, r) => {
    const l = sevLabel(r.sev ?? "moyen");
    acc[l] = (acc[l] ?? 0) + 1;
    return acc;
  }, {});
}

/** Heure de déclaration en millis, depuis champ time (ISO) ou HH:MM + today. */
function incidentTs(_ctx: AiContext, inc: AiContext["incidents"][number]): number {
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

/** Incidents survenus AUJOURD'HUI (minuit → maintenant). */
export function todayIncidents(_q: string, ctx: AiContext): AiAnswer {
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


function last24hBucket(ctx: AiContext): TemporalBucket {
  const D = Date.now(); const cutoff = D - 24 * 3600 * 1000;
  const list = windowIncidents(ctx, (ts) => ts >= cutoff);
  const sev = sevCounts(list);
  return { count: list.length, severity: sev, ids: list.map((i) => i.id) };
}

/** Résumé des 24 dernières heures. */
export function last24hSummary(_q: string, ctx: AiContext): AiAnswer {
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
export function todayVsYesterday(_q: string, ctx: AiContext): AiAnswer {
  const T = todayBucket(ctx); const Y = yesterdayBucket(ctx);
  const delta = T.count - Y.count; const pct = Y.count ? Math.round(100 * delta / Y.count) : 0;
  const trend: "increasing" | "decreasing" | "stable" = delta > Math.max(1, Math.round(Y.count * 0.2)) ? "increasing" : delta < -Math.max(1, Math.round(Y.count * 0.2)) ? "decreasing" : "stable";
  const sevLine = (name: string, S: { severity: Record<string, number>; count: number }) =>
    `  ▸ ${name} : ${S.count} (C${S.severity.critique ?? 0} · É${S.severity.élevé ?? 0} · M${S.severity.moyen ?? 0} · F${S.severity.faible ?? 0})`;
  const text =
    `📊 **Comparaison aujourd'hui / hier** :\n${sevLine("Aujourd'hui", T)}\n${sevLine("Hier        ", Y)}\n` +
    `• Delta : **${delta > 0 ? "+" : ""}${delta}** (${pct > 0 ? "+" : ""}${pct}%) · Tendance : **${trend === "increasing" ? "⬆️ hausse" : trend === "decreasing" ? "⬇️ baisse" : "➡️ stable"}**\n` +
    (trend === "increasing" ? "• ⚠️ Hausse du volume d'incidents (plus de nouveaux cas que J-1)." :
     trend === "decreasing" ? "• ℹ️ Baisse du volume d'incidents (moins de nouveaux cas que J-1)." :
     "• ℹ️ Volume d'incidents stable.") +
    "\n• Indicateurs bruts du référentiel temporel IRIS, sans interprétation opérationnelle.";
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
export function trendIncidents(_q: string, ctx: AiContext): AiAnswer {
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
    (unusual ? `• ⚠️ **Écart > 50% : évolution inhabituelle détectée** (indicateur brut).\n` : "") +
    `• Indicateur temporel (24 h glissantes et J-1) · données référentielles IRIS, sans interprétation opérationnelle.`;
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
export function activityPeaks(_q: string, ctx: AiContext): AiAnswer {
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
export function unusualEvolution(_q: string, ctx: AiContext): AiAnswer {
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
