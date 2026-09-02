// ============================================================================
// ARGOS — assistant IA · Instantané opérationnel transmis au modèle à CHAQUE
// question, calculé en temps réel depuis le contexte (magasin → AiContext).
//
// C'est la seule source d'agrégats (totaux, moyennes, répartitions) que le
// modèle a le droit d'utiliser : sans lui, il reprenait des chiffres de
// phrases anciennes de la Couche 1 plutôt que de lire les données. Tout est
// typé sur le domaine (pas de lecture « au cas où » de champs inexistants).
// ============================================================================

import { aggregateCasualties, filterActiveIncidents } from "@/lib/derive";
import type { AiContext } from "./types";

interface CasualtyPerTypeLight {
  type: string;
  deces: number;
  blesses: number;
  infectes: number;
  contamines: number;
  exposes: number;
  disparus: number;
  secourus: number;
  total: number;
}

function countBy<T>(items: T[], key: (item: T) => string, limit: number): { nom: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const it of items) {
    const k = key(it).trim() || "—";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([nom, count]) => ({ nom, count }));
}

/** L'instantané : incidents (bilan humain à 7 dimensions), hôpitaux, unités, équipements, ORSEC. */
export function buildOperationalSnapshot(ctx: AiContext): Record<string, unknown> {
  const incidents = ctx.incidents ?? [];
  const hospitals = ctx.hospitals ?? [];
  const units = ctx.units ?? [];
  const equipment = ctx.equipment ?? [];
  const ouverts = filterActiveIncidents(incidents);

  // Bilan humain — le MÊME agrégateur que le tableau de bord et la page
  // incidents : chaque dimension reste explicite (contaminés ≠ blessés).
  const agg = aggregateCasualties(incidents, ctx.dashStats ?? null, 0, 10);
  const t = agg.totals;
  const parType: CasualtyPerTypeLight[] = agg.byType.map((r) => ({
    type: r.type, deces: r.dead, blesses: r.injured, infectes: r.infected, contamines: r.contaminated,
    exposes: r.exposed, disparus: r.missing, secourus: r.rescued, total: r.total,
  }));

  // Hôpitaux : répartition par tension d'occupation.
  let confortables = 0, enTension = 0, satures = 0, sommeOcc = 0, echantillons = 0, litsTot = 0, reaTot = 0;
  for (const h of hospitals) {
    litsTot += h.lits;
    reaTot += h.rea;
    const pct = h.lits > 0 ? Math.round((h.occ / h.lits) * 100) : 0;
    if (pct > 0) { sommeOcc += pct; echantillons += 1; }
    if (pct >= 92) satures += 1;
    else if (pct >= 75) enTension += 1;
    else confortables += 1;
  }

  // Unités : prêtes ou en attente, déployées, readiness moyenne.
  const pretes = units.filter((u) => u.dispo === "ready" || u.dispo === "standby").length;
  const deployees = units.filter((u) => u.dispo === "deployed").length;
  const readiness = units.length ? Math.round(units.reduce((s, u) => s + u.readiness, 0) / units.length) : null;

  // Équipements : références sous le seuil ou hors service.
  const ruptures = equipment.filter((e) => (e.threshold > 0 && e.stock <= e.threshold) || e.cond === "oos").length;

  const o = ctx.orsec;
  return {
    horodatage_utc: new Date().toISOString(),
    incidents: {
      total_catalogues: incidents.length,
      en_cours_ouverts: ouverts.length,
      fermes_archives: Math.max(0, incidents.length - ouverts.length),
      regions_impactees: countBy(ouverts, (i) => i.region, 12),
      types_incidents: countBy(ouverts, (i) => i.type, 12),
      bilan_humain_global: {
        deces: t.dead, blesses: t.injured, infectes: t.infected, contamines: t.contaminated,
        exposes: t.exposed, disparus: t.missing, secourus: t.rescued,
        total_victimes_reference: t.dead + t.injured + t.infected + t.contaminated + t.exposed + t.missing,
        semantique_par_categorie: {
          trauma_classique: { total: t.injured, label: "Blessés (traumatismes : incendies, inondations, accidents, séismes…)", presente: agg.flags.hasTrauma },
          epidemie_biologique: { total: t.infected, label: "Infectés (épidémies, foyers de maladie)", presente: agg.flags.hasEpidemic },
          nrbc_chimique_hazmat: { contamines: t.contaminated, exposes: t.exposed, label: "Contaminés + Exposés (NRBC, chimique, industriel)", presente: agg.flags.hasNrb },
        },
      },
      bilan_humain_par_type_incident: parType,
    },
    hopitaux: {
      total_etablissements: hospitals.length,
      par_type: countBy(hospitals, (h) => h.kind ?? "—", 8),
      confortables_pct_inf_75: confortables,
      en_tension_pct_75_a_91: enTension,
      satures_pct_sup_92: satures,
      taux_occupation_moyen_pct: echantillons ? Math.round((sommeOcc / echantillons) * 10) / 10 : null,
      lits_total: litsTot,
      lits_rea_total: reaTot,
    },
    unites: {
      total_unites: units.length,
      par_ville: countBy(units, (u) => u.ville, 10),
      pretes_ou_disponibles: pretes,
      deployees_ou_engagees: deployees,
      readiness_moyen_pct: readiness,
    },
    equipements: {
      total_references: equipment.length,
      par_categorie: countBy(equipment, (e) => e.cat, 10),
      references_en_rupture_ou_hs: ruptures,
    },
    orsec: o
      ? {
          niveau_plan: o.planLevel,
          active_le: o.activatedAt,
          casualties: { deces: o.casualties.dead, blesses: o.casualties.injured, disparus: o.casualties.missing, secourus: o.casualties.rescued },
          moyens: { unites_engagees: o.units.engaged, unites_disponibles: o.units.available, personnels_engages: o.personnel.engaged, vehicules_engages: o.vehicles.engaged },
          charge_hospitaliere_pct: o.hospitalLoad,
          abris_actifs: o.sheltersActive,
        }
      : null,
    intentions_possibles_depuis_catalogue: [
      "situation globale / synthèse multi-domaines",
      "liste / détail / statut / gravité / localisation des incidents",
      "bilan humain global ou par incident",
      "état des hôpitaux, lits disponibles, hôpitaux d'une ville, hôpital le plus proche",
      "posture des unités, potentiel mobilisable, classement des unités pour un incident",
      "analytique et KPI (tendance 7 j, temps de réponse, saturation, triage, utilisation des moyens)",
      "tendance 24 h / aujourd'hui vs hier / pics d'activité",
      "zones impactées / concentration critique",
      "inventaire des équipements / ruptures critiques",
      "ORSEC : niveau, moyens, victimes",
      "analyse croisée pour un incident (unités + hôpitaux + équipements)",
    ],
  };
}
