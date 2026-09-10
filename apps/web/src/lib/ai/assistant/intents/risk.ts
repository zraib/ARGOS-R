// ============================================================================
// ARGOS — assistant IA · Intentions « risques » : zones, concentrations, prédictions.
//
// Extrait de l'ancien `assistant.ts` (2 782 lignes) lors de la refactorisation :
// même code, découpé par responsabilité pour être lisible, testable et
// modifiable sans relire le tout. Voir `index.ts` pour la surface publique.
// ============================================================================

import { norm, sevRank } from "../labels";
import { hospitalRow, toAiRow } from "../rows";
import type { AiAnswer, AiContext, AiCrossBlock } from "../types";
import type { RiskPrediction } from "@/lib/ai/risk/types";

// --- GÉOGRAPHIQUE (nouveaux §6.22) ------------------------------------------

export function buildZones(ctx: AiContext, rows?: AiContext["incidents"]): NonNullable<AiCrossBlock["zones"]> {
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
export function touchedZones(_q: string, ctx: AiContext): AiAnswer {
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
    ],
  };
}

/** Concentration d'incidents critiques/graves. */
export function criticalConcentration(_q: string, ctx: AiContext): AiAnswer {
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
    ],
  };
}

/** Zone la plus risquée (gravité pondérée × volume). */
export function riskiestZone(_q: string, ctx: AiContext): AiAnswer {
  const all = buildZones(ctx);
  const scored = all.map((z) => ({ z, risk: z.count * ((z.severity === "critique" ? 8 : z.severity === "élevé" ? 4 : z.severity === "moyen" ? 2 : 1)) }));
  scored.sort((a, b) => b.risk - a.risk);
  const top = scored[0]; const allCrit = scored.reduce((s, x) => s + x.risk, 0);
  const text =
    `⚠️ **Zone présentant actuellement le plus grand niveau de risque** (score = volume × gravité) :\n` +
    (top
      ? `• **${top.z.nom}** — score de risque **${top.risk}** (${top.z.count} incident(s), gravité max **${top.z.severity}**) · ${allCrit ? Math.round(100 * top.risk / allCrit) : 0}% du risque national.\n` +
        `• Indicateurs : volume ${top.z.count}, gravité pondérée ${top.risk}, part du risque national ${allCrit ? Math.round(100 * top.risk / allCrit) : 0}%.`
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


export function riskPredictionAnswer(_q: string, ctx: AiContext): AiAnswer {
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
    lines.push("Aucune estimation de dégradation significative détectée dans les données IRIS pour le moment.");
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
    ],
  };
}


export function riskZoneAnswer(q: string, ctx: AiContext): AiAnswer {
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
      text: `Aucune estimation IA de risque n'est actuellement documentée pour « ${label} » dans les données IRIS.`,
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
    ],
  };
}

// --- Routage --------------------------------------------------------------
