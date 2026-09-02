// ============================================================================
// ARGOS — statistiques de commandement et analytique, calculées sur un
// INSTANTANÉ du domaine.
//
// Fonctions pures : elles ne lisent que ce qu'on leur donne et n'écrivent
// rien. Sorties du service pour être testées avec des données construites à
// la main, et pour que le service garde la seule responsabilité de l'état.
// ============================================================================

import { ORSEC_BOARD, ROSTER, TRIAGE_ZONES, type EquipItem } from "@/modules/domain/catalog.data";
import type { Hospital, Incident, Unit } from "@/modules/domain/domain.types";

/** Ce que les calculs ont besoin de voir du domaine. */
export interface DomainSnapshot {
  incidents: Incident[];
  units: Unit[];
  hospitals: Hospital[];
  equipment: EquipItem[];
}

/**
 * Vue globale pour le commandement : évolution des déclarations sur 30 jours,
 * répartition par gravité, bilan humain (source unique : tableau ORSEC),
 * saturation hospitalière et posture des unités. Série d'évolution
 * déterministe (pseudo-aléatoire seedé) + comptes réels du registre.
 */
export function computeStats(snap: DomainSnapshot) {
  // Série 30 jours déterministe : même graphe à chaque appel (pas de flicker).
  const evolution: { d: string; opened: number; closed: number }[] = [];
  const today = new Date();
  let seed = 42;
  const rnd = () => {
    // LCG simple — suffisant pour une série de démonstration stable.
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 29; i >= 0; i--) {
    const day = new Date(today.getTime() - i * 86400000);
    const label = `${String(day.getDate()).padStart(2, "0")}/${String(day.getMonth() + 1).padStart(2, "0")}`;
    // Fond de bruit 0–3, pic sismique sur les 4 derniers jours (scénario Al Haouz).
    const base = Math.floor(rnd() * 3);
    const spike = i <= 3 ? Math.floor(rnd() * 5) + 3 : 0;
    const opened = base + spike + (i === 0 ? snap.incidents.filter((x) => x.st !== "closed").length % 3 : 0);
    const closed = Math.max(0, Math.floor((base + spike) * (0.4 + rnd() * 0.3)));
    evolution.push({ d: label, opened, closed });
  }

  const severity = {
    high: snap.incidents.filter((i) => i.sev === "high").length,
    medium: snap.incidents.filter((i) => i.sev === "medium").length,
    low: snap.incidents.filter((i) => i.sev === "low").length,
  };

  const status = {
    open: snap.incidents.filter((i) => i.st === "open").length,
    prog: snap.incidents.filter((i) => i.st === "prog").length,
    closed: snap.incidents.filter((i) => i.st === "closed").length,
  };

  // Saturation hospitalière : réseau militaire en tête (chaîne de
  // commandement), puis le réseau civil trié par taux d'occupation
  // décroissant — les établissements les plus tendus remontent en premier.
  const hospitals = snap.hospitals
    .map((h) => ({
      id: h.id,
      nom: h.nom,
      ville: h.ville,
      kind: h.kind ?? "civ",
      occPct: Math.round((h.occ / h.lits) * 100),
      icuPct: h.rea > 0 ? Math.round((h.reaOcc / h.rea) * 100) : 0,
    }))
    .sort((a, b) => {
      const ma = a.kind === "mil" ? 0 : 1;
      const mb = b.kind === "mil" ? 0 : 1;
      return ma !== mb ? ma - mb : b.occPct - a.occPct;
    });

  const units = {
    total: snap.units.length,
    deployed: snap.units.filter((u) => u.dispo === "deployed").length,
    ready: snap.units.filter((u) => u.dispo === "ready").length,
    avgReadiness: Math.round(snap.units.reduce((s, u) => s + u.readiness, 0) / Math.max(1, snap.units.length)),
  };

  return { evolution, severity, status, casualties: ORSEC_BOARD.casualties, hospitals, units };
}

export function computeAnalyticsOf(snap: DomainSnapshot) {
  const pct = (num: number, den: number) => (den === 0 ? 0 : Math.round((num / den) * 100));

  // ---- KPIs ------------------------------------------------------------
  const totalIncidents = snap.incidents.length;
  const closedInc = snap.incidents.filter((i) => i.st === "closed").length;
  const closedRate = totalIncidents === 0 ? 0 : Math.round((closedInc / totalIncidents) * 100);

  // Personnel déployé vs total — COMPTÉ sur le roster, pas figé.
  // Les deux constantes précédentes (87 / 38) annonçaient venir du seed alors
  // qu'il compte 14 entrées : elles auraient dérivé en silence au premier
  // ajout de personnel, dans une fonction dont tout l'intérêt est de ne rien
  // inventer.
  const rosterTotal = ROSTER.length;
  const rosterDeployed = ROSTER.filter((p) => p.av === "deployed").length;
  const personnelPct = pct(rosterDeployed, rosterTotal);

  // Véhicules : ARGOS ne tient pas d'état d'engagement du parc roulant. Ce
  // taux est donc une ESTIMATION à partir du parc d'ambulances et des unités
  // déployées, pas une mesure — les coefficients ci-dessous sont des
  // hypothèses de cadrage, à remplacer par un vrai suivi de parc.
  const AMB_ENGAGED_RATIO = 0.72;   // part d'ambulances supposée engagée
  const VEH_PER_DEPLOYED_UNIT = 3;  // véhicules par unité déployée
  const FLEET_MULTIPLIER = 1.8;     // parc total estimé / parc d'ambulances
  const totalAmb = snap.hospitals.reduce((s, h) => s + (h.amb ?? 0), 0);
  const vehDeployedEst = Math.min(
    100,
    Math.round(totalAmb * AMB_ENGAGED_RATIO) + snap.units.filter((u) => u.dispo === "deployed").length * VEH_PER_DEPLOYED_UNIT,
  );
  const vehPct = Math.min(100, Math.round((vehDeployedEst / Math.max(1, totalAmb * FLEET_MULTIPLIER)) * 100));

  // Équipements = part stock OK vs seuil + cond === repair
  const eqOk = snap.equipment.filter((e) => e.stock >= e.threshold && e.cond === "ok").length;
  const eqPct = pct(eqOk, snap.equipment.length);

  // Hôpitaux = moyenne des taux d'occupation (réseau MIL prioritaires + top 6)
  // IMPORTANT: l'id hôpital est gardé dans `satByH` car plusieurs établissements
  // peuvent porter le même nom (« Hôpital Mohammed V » existe dans plusieurs
  // villes). On préfixe le label par `[id]` pour l'unicité React keys, ET on
  // ajoute systématiquement ` · Ville` pour lever l'ambiguïté nom + ville.
  const satByH = snap.hospitals
    .filter((h) => (h.kind ?? "civ") === "mil" || h.occ > 0)
    .map((h) => ({
      id: h.id,
      nom: h.nom,
      ville: h.ville,
      sat: pct(h.occ, h.lits),
    }))
    .sort((a, b) => b.sat - a.sat)
    .slice(0, 6);
  const hospPct = satByH.length === 0
    ? 0
    : Math.round(satByH.reduce((s, x) => s + x.sat, 0) / satByH.length);

  // KPI global utilisation moyens · pondération (Personnel 30% / Véhicules 25% / Équipements 20% / Hôpitaux 25%)
  const util = Math.round(personnelPct * 0.3 + vehPct * 0.25 + eqPct * 0.2 + hospPct * 0.25);

  // KPI réponse moyenne · composition 4 segments (alert->départ, départ->surSite, tri->évac, évac->admission)
  // Basé sur la gravité moyenne des incidents ouverts + dispo unités
  const sevWeight = snap.incidents.reduce((s, i) => s + (i.sev === "high" ? 1.4 : i.sev === "medium" ? 1 : 0.7), 0) / Math.max(1, totalIncidents);
  const deployBoost = 1 - (snap.units.filter((u) => u.dispo === "deployed").length / Math.max(1, snap.units.length)) * 0.2;
  const avgResponse = Math.max(12, Math.round((10 + 18 + 15 + 22) * sevWeight * deployBoost));
  const evacAdmit = Math.max(20, Math.round(28 * sevWeight * deployBoost));

  // ---- Graphique G1 · responseTimes (4 segments) ----------------------
  const segAlertDep = Math.max(4, Math.round(8 * sevWeight));
  const segDepSite = Math.max(10, Math.round(22 * sevWeight * deployBoost));
  const segTriEvac = Math.max(8, Math.round(17 * sevWeight));
  const segEvacAdm = Math.max(18, evacAdmit);

  const responseTimes = [
    { label: "Alerte→départ", value: segAlertDep, couleur: "#C9A84C" },
    { label: "Départ→sur site", value: segDepSite, couleur: "#3B82F6" },
    { label: "Tri→évac", value: segTriEvac, couleur: "#F59E0B" },
    { label: "Évac→admission", value: segEvacAdm, couleur: "#EF4444" },
  ];

  // ---- Graphique G2 · incidentTrend 7 jours ----------------------------
  // Basé sur `stats().evolution` (30j) tronqué aux 7 derniers jours ; `opened`
  // injecte aussi le compte réel d'incidents st==open/prog pour J0
  const today = new Date();
  const lbl7 = (d: Date) => {
    const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
    if (diff === 0) return "Auj.";
    if (diff === 1) return "J-1";
    return `J-${diff}`;
  };
  const trend7 = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(today.getTime() - (6 - i) * 86400000);
    const sev = 6 - i <= 3 ? 1.6 : 1;
    const base = Math.max(1, Math.round((((6 - i) * 1.1) % 4) + 1) * sev);
    // J0 = incidents actuellement ouverts + récents (plancher minimum de la tendance)
    const opened = i === 6 ? Math.max(base, snap.incidents.filter((x) => x.st !== "closed").length) : base;
    return {
      label: lbl7(day),
      value: opened,
      couleur: opened >= 5 ? "#EF4444" : "#C9A84C",
    };
  });

  // ---- Graphique G3 · triageOutcomes -----------------------------------
  // Agrégat TRIAGE_ZONES (seed statique) — vivra quand DomainService exposera les triages
  const triRed = TRIAGE_ZONES.reduce((s, z) => s + (z.red ?? 0), 0);
  const triYel = TRIAGE_ZONES.reduce((s, z) => s + (z.yellow ?? 0), 0);
  const triGre = TRIAGE_ZONES.reduce((s, z) => s + (z.green ?? 0), 0);
  const triBla = TRIAGE_ZONES.reduce((s, z) => s + (z.black ?? 0), 0);
  const triageOutcomes = [
    { label: "Rouge", value: triRed, couleur: "#EF4444" },
    { label: "Jaune", value: triYel, couleur: "#F59E0B" },
    { label: "Vert", value: triGre, couleur: "#10B981" },
    { label: "Noir", value: triBla, couleur: "#6B7280" },
  ];

  // ---- Graphique G4 · resourceUtil (4 axes) ----------------------------
  const resourceUtil = [
    { label: "Personnel", value: personnelPct, couleur: "#C9A84C" },
    { label: "Véhicules", value: vehPct, couleur: "#3B82F6" },
    { label: "Équipements", value: eqPct, couleur: "#10B981" },
    { label: "Hôpitaux", value: hospPct, couleur: "#EF4444" },
  ];

  // ---- Graphique G5 · hospitalSat (top 6 par saturation) ---------------
  // Palette adaptative : >90 rouge, >75 orange, >60 jaune, reste vert/bleu
  // Label = [id] Nom · Ville · SANS TRONCATURE (affichage texte intégral dans
  // la légende, avec word-wrap côté front). Priorité au contenu complet.
  // L'ajout systématique de la ville évite l'ambiguïté Hôpital Mohammed V qui
  // existe dans plusieurs villes marocaines (Casablanca, Rabat, Fès…).
  const hospitalSat = satByH.map((h) => ({
    label: `[${h.id}] ${h.nom} · ${h.ville}`,
    value: h.sat,
    couleur: h.sat >= 90 ? "#EF4444" : h.sat >= 75 ? "#F59E0B" : h.sat >= 60 ? "#C9A84C" : h.sat >= 40 ? "#3B82F6" : "#10B981",
  }));

  // ---- G6 · severityDist calculé côté FRONT aujourd'hui (donné ici aussi
  // en backup si le front veut s'y référer). On garde le schéma identique
  // à Analytics (pas de champ supplémentaire) pour rester compatible.

  return {
    kpis: {
      avgResponse,
      evacAdmit,
      closedRate,
      util,
    },
    responseTimes,
    incidentTrend: trend7,
    resourceUtil,
    hospitalSat,
    triageOutcomes,
  };
}
