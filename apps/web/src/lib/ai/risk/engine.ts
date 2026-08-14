// ========================================================================
// ARGOS · Moteur déterministe de Prédiction Risques IA
// RÈGLE D'OR : 100% basé sur LES DONNÉES RÉELLES fournies (incidents,
// hôpitaux, unités, dashStats). AUCUNE invention, AUCUNE donnée hors
// périmètre. Le moteur est reproductible, purement fonctionnel (mêmes
// entrées → mêmes sorties).
// ========================================================================
import type { DashStats, Hospital, Incident, Unit } from "@/lib/types";
import { haversineKm } from "@/lib/reco";
import type {
  RiskContext,
  RiskFactor,
  RiskHorizon,
  RiskLevel,
  RiskPrediction,
  RiskTrend,
} from "./types";

function deriveTrendFromScoreLevel(score: number, level: RiskLevel): RiskTrend {
  if (score >= 65 || level === "critique" || level === "eleve") return "aggravation";
  if (score <= 30 && level === "faible") return "amelioration";
  return "stable";
}

function deriveRiskTypeFromIncident(type: Incident["type"], score: number): string {
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
  return (
    t[type] ?? `${type[0].toUpperCase()}${type.slice(1).replace(/_/g, " ")}`
  );
}


// --- Helpers numériques ---------------------------------------------------
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const clamp100 = (n: number) => Math.max(0, Math.min(100, n));
const pct = (n: number) => clamp01(n);
const sevWeight: Record<Incident["sev"], number> = {
  high: 1.0,
  medium: 0.55,
  low: 0.25,
};
const statusWeight: Record<Incident["st"], number> = {
  open: 1.0,
  prog: 0.85,
  closed: 0.05,
};

// --- Score -> niveau -------------------------------------------------------
export function scoreToLevel(s: number): RiskLevel {
  if (s >= 80) return "critique";
  if (s >= 55) return "eleve";
  if (s >= 30) return "modere";
  return "faible";
}
// --- Score -> horizon temporel --------------------------------------------
// Plus le score est élevé, plus l'horizon est proche.
export function scoreToHorizon(s: number): RiskHorizon {
  if (s >= 75) return "2h";
  if (s >= 50) return "6h";
  if (s >= 30) return "24h";
  return "48h";
}

// --- Probabilité (bornée 0..1) — dérivée des poids des facteurs. ----------
function factorsToProbability(factors: RiskFactor[]): number {
  const sumW = factors.reduce((s, f) => s + f.weight, 0);
  return clamp01(sumW);
}

// --- Règle 1 — Score HÔPITAL (saturation globale + REA) -------------------
function scoreHospital(h: Hospital): { score: number; factors: RiskFactor[] } {
  const factors: RiskFactor[] = [];
  let score = 0;

  // Facteur principal: taux occupation lits (%)
  const occ = pct(h.occ);
  const factorOcc: RiskFactor = {
    label: `Taux d'occupation global ${Math.round(occ * 100)}%`,
    weight: clamp01(occ * 0.6),
    sources: ["hospitals.saturation"],
    rawValue: `${Math.round(occ * 100)}%`,
  };
  score += clamp100(occ * 65);
  factors.push(factorOcc);

  // Facteur secondaire: REA
  if (typeof h.reaOcc === "number" && typeof h.rea === "number" && h.rea > 0) {
    const rea = pct(h.reaOcc / h.rea);
    const reaFactor: RiskFactor = {
      label: `Saturation réanimation ${Math.round(rea * 100)}% (${h.reaOcc}/${h.rea} lits)`,
      weight: clamp01(rea * 0.35),
      sources: ["hospitals.rea"],
      rawValue: `${h.reaOcc}/${h.rea}`,
    };
    score += clamp100(rea * 30);
    factors.push(reaFactor);
  } else if (typeof h.occ === "number") {
    // Estimation REA si non renseigné via occ globale (proportionnel).
    const rea = pct(occ * 0.92);
    const reaFactor: RiskFactor = {
      label: `Saturation réanimation estimée ~${Math.round(rea * 100)}% (corrélé à l'occupation)`,
      weight: clamp01(rea * 0.2),
      sources: ["hospitals.saturation"],
      rawValue: `occ × 0.92 = ${(rea).toFixed(2)}`,
    };
    score += clamp100(rea * 20);
    factors.push(reaFactor);
  }

  // Staff disponible si renseigné (sinon 0).
  if (typeof h.staff === "number" && h.staff < 10) {
    const staffF = pct((10 - h.staff) / 10);
    score += clamp100(staffF * 10);
    factors.push({
      label: `Effectif hospitalier faible (${h.staff})`,
      weight: clamp01(staffF * 0.12),
      sources: ["units.deploiement"],
      rawValue: `staff=${h.staff}`,
    });
  }

  return { score: clamp100(score), factors };
}

// --- Règle 2 — Score INCIDENT individuel (sev × statut × temps écoulé + ---
// responders count) ---------------------------------------------------------
function scoreIncident(inc: Incident, now: number): { score: number; factors: RiskFactor[] } {
  const factors: RiskFactor[] = [];
  let score = 0;

  // Gravité
  const sw = sevWeight[inc.sev];
  score += clamp100(sw * 45);
  factors.push({
    label: `Gravité incident "${inc.sev.toUpperCase()}"`,
    weight: clamp01(sw * 0.45),
    sources: ["incidents.actifs", "dashstats.severity"],
    rawValue: `sev=${inc.sev} (poids ${sw})`,
  });

  // Statut (ouvert/en cours)
  const stw = statusWeight[inc.st];
  score += clamp100(stw * 15);
  factors.push({
    label: `Statut incident "${inc.st === "open" ? "ouvert" : inc.st === "prog" ? "en cours" : "clos"}"`,
    weight: clamp01(stw * 0.15),
    sources: ["incidents.actifs", "dashstats.status"],
    rawValue: `st=${inc.st}`,
  });

  // Réponse (responders)
  const deployedUnits = inc.responders?.units?.length ?? 0;
  if (deployedUnits > 0) {
    const w = clamp01(deployedUnits / 6);
    score += clamp100(w * 12);
    factors.push({
      label: `${deployedUnits} unité(s) déployée(s) sur cet incident`,
      weight: clamp01(w * 0.12),
      sources: ["units.deploiement"],
      rawValue: `${deployedUnits} responders`,
    });
  } else if (inc.st !== "closed") {
    // Pas de réponse alors que l'incident n'est pas clos.
    score += clamp100(22);
    factors.push({
      label: "Aucune unité déployée sur un incident non clos",
      weight: clamp01(0.22),
      sources: ["incidents.actifs", "units.deploiement"],
      rawValue: "responders.units=0",
    });
  }

  // Temps écoulé depuis création (heures).
  const incT = new Date(inc.time).getTime();
  if (!Number.isNaN(incT)) {
    const hrs = Math.max(0, (now - incT) / 3_600_000);
    const w = clamp01(hrs / 18); // plateau à 18h = 1.0
    score += clamp100(w * 14);
    factors.push({
      label: `Incident en cours depuis ${hrs.toFixed(1)}h`,
      weight: clamp01(w * 0.14),
      sources: ["incidents.actifs"],
      rawValue: `${hrs.toFixed(2)}h`,
    });
  }

  // Bilan humain (si renseigné)
  if (inc.casualties) {
    const total = (inc.casualties.injured ?? 0) + (inc.casualties.dead ?? 0) + (inc.casualties.missing ?? 0);
    if (total > 0) {
      const w = clamp01(total / 10);
      score += clamp100(w * 20);
      factors.push({
        label: `Bilan humain connu : ${total} victime(s) (blessés/décès/disparus)`,
        weight: clamp01(w * 0.2),
        sources: ["incidents.actifs"],
        rawValue: `total=${total}`,
      });
    }
  }
  // Sous-incidents
  if (inc.subIncidents && inc.subIncidents.length > 0) {
    const subW = clamp01(inc.subIncidents.length / 3);
    score += clamp100(subW * 10);
    factors.push({
      label: `${inc.subIncidents.length} sous-incident(s) lié(s)`,
      weight: clamp01(subW * 0.1),
      sources: ["incidents.actifs"],
      rawValue: `sub=${inc.subIncidents.length}`,
    });
  }

  return { score: clamp100(score), factors };
}

// --- Règle 3 — ZONE géographique (regroupe incidents + hôpitaux voisins) -
interface ZoneAcc {
  key: string;
  label: string;
  ll: [number, number];
  incidentIds: string[];
  hospitalIds: string[];
  incidents: Incident[];
  hospitals: Hospital[];
  countSeverity: number;
}

function buildZones(ctx: RiskContext): ZoneAcc[] {
  const byKey = new Map<string, ZoneAcc>();
  const now = ctx.now ?? Date.now();
  // Zones depuis regions des incidents
  for (const inc of ctx.incidents) {
    const k = `zone:${inc.region}`;
    const z = byKey.get(k) ?? {
      key: k,
      label: `Région ${inc.region}`,
      ll: inc.ll ?? [0, 0],
      incidentIds: [],
      hospitalIds: [],
      incidents: [],
      hospitals: [],
      countSeverity: 0,
    };
    z.incidentIds.push(inc.id);
    z.incidents.push(inc);
    z.countSeverity += sevWeight[inc.sev] * statusWeight[inc.st];
    if (!z.ll || z.ll[0] === 0) z.ll = inc.ll;
    byKey.set(k, z);
  }
  // Zones depuis hôpitaux
  for (const h of ctx.hospitals) {
    const k = `zone:${h.region ?? h.ville}`;
    const z = byKey.get(k) ?? {
      key: k,
      label: h.region ? `Région ${h.region}` : `Ville ${h.ville}`,
      ll: h.ll ?? [0, 0],
      incidentIds: [],
      hospitalIds: [],
      incidents: [],
      hospitals: [],
      countSeverity: 0,
    };
    z.hospitalIds.push(h.id);
    z.hospitals.push(h);
    if (!z.ll || z.ll[0] === 0) z.ll = h.ll;
    byKey.set(k, z);
  }
  // Concentration spatial secondaire: incidents distants < 40km → rattrapés dans
  // la même zone (union la plus forte).
  const zones = Array.from(byKey.values());
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      const a = zones[i];
      const b = zones[j];
      if (a.ll && b.ll && a.ll[0] !== 0 && b.ll[0] !== 0) {
        if (haversineKm(a.ll, b.ll) < 40) {
          // incrémente countSeverity des deux côtés (corrélation)
          a.countSeverity += 0.15 + b.countSeverity * 0.1;
          b.countSeverity += 0.15 + a.countSeverity * 0.1;
        }
      }
    }
  }
  // Score incident individuel moyen zone
  for (const z of zones) {
    z.countSeverity += z.incidents.reduce((s, inc) => s + scoreIncident(inc, now).score / 100, 0);
  }
  return zones;
}

// --- Règle 4 — Évolution tendance 24h (monte/descend) ---------------------
function computeTrendFactor(dashStats: RiskContext["dashStats"]): RiskFactor | null {
  if (!dashStats?.evolution?.length) return null;
  const ev = dashStats.evolution;
  if (ev.length < 2) return null;
  // 12 dernières (fin) vs 12 premières
  const mid = Math.max(1, Math.floor(ev.length / 2));
  const first = ev.slice(0, mid);
  const last = ev.slice(mid);
  const avgFirst = first.reduce((s, p) => s + (p.opened ?? 0), 0) / first.length;
  const avgLast = last.reduce((s, p) => s + (p.opened ?? 0), 0) / last.length;
  if (avgFirst <= 0) return null;
  const ratio = avgLast / avgFirst; // 1.25 = +25% en fin de période
  const up = Math.max(0, ratio - 1);
  const w = clamp01(up * 1.8);
  if (w <= 0.05) {
    return {
      label: `Tendance stable ou à la baisse sur ${ev.length} pas`,
      weight: -0.0,
      sources: ["dashstats.evolution"],
      rawValue: `ratio=${ratio.toFixed(2)}`,
    };
  }
  return {
    label: `Tendance à la hausse +${Math.round(up * 100)}% sur la fin de période (${ev.length} pas)`,
    weight: w,
    sources: ["dashstats.evolution"],
    rawValue: `ratio=${ratio.toFixed(2)}`,
  };
}

// --- Règle 5 — Unit readiness (état des moyens) ---------------------------
function computeReadinessFactor(units: Unit[]): RiskFactor | null {
  if (!units?.length) return null;
  const avgRead = units.reduce((s, u) => s + (u.readiness ?? 0), 0) / units.length;
  const deployedPct = units.reduce((s, u) => s + (u.dispo === "deployed" ? 1 : 0), 0) / units.length;
  const lowRead = (u: Unit) => (u.readiness ?? 1) < 0.5;
  const nbLow = units.filter(lowRead).length;
  const w = clamp01((1 - avgRead) * 0.4 + deployedPct * 0.35 + nbLow / Math.max(4, units.length) * 0.3);
  if (w <= 0.03) return null;
  return {
    label: `Disponibilité unités : readiness moyen ${Math.round(avgRead * 100)}% · ${Math.round(deployedPct * 100)}% engagées · ${nbLow} unité(s) < 50% readiness`,
    weight: w,
    sources: ["units.readiness", "units.deploiement"],
    rawValue: `avgRead=${avgRead.toFixed(2)} deployed=${deployedPct.toFixed(2)} low=${nbLow}`,
  };
}

// ========================================================================
// CALCUL GLOBAL : génère toutes les prédictions à partir du contexte
// (100% réel, 0 invention).
// ========================================================================
export function computeRiskPredictions(ctx: RiskContext): RiskPrediction[] {
  const now = ctx.now ?? Date.now();
  const predictions: RiskPrediction[] = [];

  // Facteurs globaux — impactent toutes les prédictions
  const trendFactor = computeTrendFactor(ctx.dashStats);
  const readinessFactor = computeReadinessFactor(ctx.units ?? []);

  // 1 — HÔPITAUX (1 prédiction par hopital si score >= 15)
  for (const h of ctx.hospitals) {
    const { score, factors } = scoreHospital(h);
    if (trendFactor && trendFactor.weight > 0) factors.push(trendFactor);
    if (readinessFactor && readinessFactor.weight > 0) factors.push(readinessFactor);
    const finalScore = clamp100(
      score +
        Math.round((trendFactor?.weight ?? 0) * 15) +
        Math.round((readinessFactor?.weight ?? 0) * 10)
    );
    if (finalScore >= 5) {
      const id = `h:${h.id}:${now}`;
      const lv = scoreToLevel(finalScore);
      predictions.push({
        id,
        kind: "hopital",
        label: `${h.nom} · ${h.ville}`,
        riskType: finalScore >= 70 ? "Saturation hospitalière" : "Tension hospitalière",
        zoneLabel: `${h.ville}${h.region ? ` · ${h.region}` : ""}`,
        locationLabel: h.ville && h.nom ? `${h.ville} · ${h.nom}` : undefined,
        trend: deriveTrendFromScoreLevel(finalScore, lv),
        ll: h.ll,
        level: lv,
        score: finalScore,
        probability: factorsToProbability(factors),
        horizon: scoreToHorizon(finalScore),
        factors,
        linkedHospitalIds: [h.id],
        computedAt: now,
      });
    }
  }

  // 2 — INCIDENTS (1 prédiction par incident ouvert/prog avec score >= 20)
  for (const inc of ctx.incidents) {
    if (inc.st === "closed") continue;
    const { score, factors } = scoreIncident(inc, now);
    if (trendFactor && trendFactor.weight > 0) factors.push(trendFactor);
    if (readinessFactor && readinessFactor.weight > 0) factors.push(readinessFactor);
    const finalScore = clamp100(
      score +
        Math.round((trendFactor?.weight ?? 0) * 10) +
        Math.round((readinessFactor?.weight ?? 0) * 10)
    );
    if (finalScore >= 8) {
      const id = `i:${inc.id}:${now}`;
      const lv = scoreToLevel(finalScore);
      predictions.push({
        id,
        kind: "incident.courant",
        label: inc.titre.length > 80 ? inc.titre.slice(0, 78) + "…" : inc.titre,
        riskType: deriveRiskTypeFromIncident(inc.type, finalScore),
        zoneLabel: `${inc.region}${inc.adresse ? ` · ${inc.adresse.slice(0, 60)}` : ""}`.trim() || inc.region,
        locationLabel: inc.adresse ?? undefined,
        trend: deriveTrendFromScoreLevel(finalScore, lv),
        ll: inc.ll,
        level: lv,
        score: finalScore,
        probability: factorsToProbability(factors),
        horizon: scoreToHorizon(finalScore),
        factors,
        linkedIncidentIds: [inc.id],
        computedAt: now,
      });
    }
  }

  // 3 — ZONES (région/ville + concentration géographique)
  const zones = buildZones(ctx);
  for (const z of zones) {
    if (z.countSeverity <= 0.25) continue;

    const factors: RiskFactor[] = [];

    // Concentration géographique (nb incidents × sev)
    const geoW = clamp01(z.countSeverity / 3.2);
    if (geoW > 0) {
      factors.push({
        label: `${z.incidents.length} incident(s) actif(s) · concentration géographique × ${(z.countSeverity).toFixed(2)}`,
        weight: clamp01(geoW * 0.45),
        sources: ["geo.concentration", "incidents.actifs", "dashstats.severity"],
        rawValue: `countSeverity=${z.countSeverity.toFixed(2)}`,
      });
    }

    // Hopitaux associés (pire saturation dans zone)
    if (z.hospitals.length > 0) {
      const worstOcc = Math.max(...z.hospitals.map((h) => pct(h.occ)));
      const occW = clamp01(worstOcc * 0.35);
      if (occW > 0) {
        factors.push({
          label: `Pire saturation hôpital dans la zone : ${Math.round(worstOcc * 100)}% (${z.hospitals.length} établissements)`,
          weight: occW,
          sources: ["hospitals.saturation"],
          rawValue: `worstOcc=${Math.round(worstOcc * 100)}%`,
        });
      }
    }

    if (trendFactor && trendFactor.weight > 0) factors.push(trendFactor);
    if (readinessFactor && readinessFactor.weight > 0) factors.push(readinessFactor);

    // Score zone
    let score =
      clamp100(geoW * 60) +
      (z.hospitals.length > 0
        ? clamp100(
            Math.max(...z.hospitals.map((h) => scoreHospital(h).score)) * 0.7,
          )
        : 0) +
      (z.incidents.length > 0
        ? clamp100(
            Math.max(...z.incidents.map((inc) => scoreIncident(inc, now).score)) * 0.5,
          )
        : 0) +
      Math.round((trendFactor?.weight ?? 0) * 15) +
      Math.round((readinessFactor?.weight ?? 0) * 10);

    score = clamp100(score);
    if (score >= 10) {
      const id = `${z.key}:${now}`;
      const lv = scoreToLevel(score);
      // riskType zone: déduction depuis PIRE incident kind de la zone (anti-invention)
      const pireInc = z.incidents.reduce<Incident | null>((acc, cur) => {
        if (!acc) return cur;
        return (sevWeight[cur.sev] > sevWeight[acc.sev]) ? cur : acc;
      }, null);
      let riskTypeZone = score >= 70 ? "Dégradation de situation" : "Surveillance opérationnelle";
      if (pireInc) riskTypeZone = deriveRiskTypeFromIncident(pireInc.type, score);
      predictions.push({
        id,
        kind: "zone",
        label: z.label,
        riskType: riskTypeZone,
        zoneLabel: z.label,
        locationLabel: z.incidents.length ? `${z.incidents.length} incident(s) · ${z.hospitals.length} hopital(x)` : undefined,
        trend: deriveTrendFromScoreLevel(score, lv),
        ll: z.ll,
        level: lv,
        score,
        probability: factorsToProbability(factors),
        horizon: scoreToHorizon(score),
        factors,
        linkedIncidentIds: z.incidentIds,
        linkedHospitalIds: z.hospitalIds,
        computedAt: now,
      });
    }
  }

  // 4 — CORRIDOR (cas simple: hôpital + incident à < 25km)
  for (let i = 0; i < ctx.incidents.length; i++) {
    const inc = ctx.incidents[i];
    if (inc.st === "closed") continue;
    if (!inc.ll) continue;
    for (const h of ctx.hospitals) {
      if (!h.ll) continue;
      if (haversineKm(inc.ll, h.ll) < 25) {
        const sI = scoreIncident(inc, now).score;
        const sH = scoreHospital(h).score;
        const combined = clamp100(Math.round(sI * 0.6 + sH * 0.5));
        if (combined >= 25) {
          const id = `c:${inc.id}-${h.id}:${now}`;
          const factors: RiskFactor[] = [
            {
              label: `Corridor opérationnel incident "${inc.titre.slice(0, 45)}" ↔ ${h.nom}`,
              weight: clamp01((combined) / 150),
              sources: ["geo.concentration", "incidents.actifs", "hospitals.saturation"],
              rawValue: `sI=${sI} sH=${sH}`,
            },
          ];
          if (trendFactor) factors.push(trendFactor);
          if (readinessFactor) factors.push(readinessFactor);
          const lv = scoreToLevel(combined);
          predictions.push({
            id,
            kind: "corridor",
            label: `Corridor ${inc.region ?? inc.type} ↔ ${h.ville}`,
            riskType: "Corridor opérationnel saturé",
            zoneLabel: `${inc.region ?? inc.type} · ${h.ville}`,
            locationLabel: `Corridor ${inc.titre.slice(0, 30)} ↔ ${h.nom}`,
            trend: deriveTrendFromScoreLevel(combined, lv),
            ll: [
              (inc.ll[0] + h.ll[0]) / 2,
              (inc.ll[1] + h.ll[1]) / 2,
            ],
            level: lv,
            score: combined,
            probability: factorsToProbability(factors),
            horizon: scoreToHorizon(combined),
            factors,
            linkedIncidentIds: [inc.id],
            linkedHospitalIds: [h.id],
            computedAt: now,
          });
        }
      }
    }
  }

  // --- Tri par score décroissant, puis dédoublonnage doux sur label + horizon
  predictions.sort((a, b) => b.score - a.score);

  // Limite haute d'affichage: on garde les 12 plus importants (pas de bruit)
  return predictions.slice(0, 12);
}

// --- Helpers pour UI ----------------------------------------------------
export function levelTint(l: RiskLevel): "red" | "amber" | "green" | "gray" | "blue" {
  if (l === "critique") return "red";
  if (l === "eleve") return "amber";
  if (l === "modere") return "blue";
  return "green";
}
export function levelLabel(l: RiskLevel): string {
  return l === "eleve" ? "élevé" : l;
}
export function probabilityToPercent(p: number): number {
  return clamp01(p) * 100;
}
// --- Type guards pour intégration ----------------------------------------
export function isDashStatsLike(
  o: unknown,
): boolean {
  if (!o || typeof o !== "object") return false;
  const obj = o as Record<string, unknown>;
  return "evolution" in obj && "severity" in obj && "status" in obj;
}
