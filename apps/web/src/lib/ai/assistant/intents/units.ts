// ============================================================================
// ARGOS — assistant IA · Intentions « unités » : état et potentiel mobilisable.
//
// Extrait de l'ancien `assistant.ts` (2 782 lignes) lors de la refactorisation :
// même code, découpé par responsabilité pour être lisible, testable et
// modifiable sans relire le tout. Voir `index.ts` pour la surface publique.
// ============================================================================

import {
  CITY_COORDS, COND_LABEL, DISPO_LABEL, norm,
  platformRegionGroups, resolveCityCoords, resolveIncidentRegion, resolveUnitId,
  type RegionGroup,
} from "../labels";
import type { AiAnswer, AiContext } from "../types";
import { etaMinutes, UNIT_CAPS, CAP_LABELS, type Capability, haversineKm } from "@/lib/reco";
import type { Incident } from "@/lib/types";
import { suggestionsForIncident, suggestionsGeneric, withValidIncident } from "./guard";

export function unitsStatus(_q: string, ctx: AiContext): AiAnswer {
  const us = ctx.units;
  const uReady = us.filter((u) => u.dispo === "ready");
  const uDep = us.filter((u) => u.dispo === "deployed");
  const uStd = us.filter((u) => u.dispo === "standby");
  const avgR = us.length ? Math.round(us.reduce((a, u) => a + u.readiness, 0) / us.length) : 0;
  const lowR = us.filter((u) => u.readiness < 70);
  const byRegion = new Map<string, number>();
  us.forEach((u) => byRegion.set(u.ville, (byRegion.get(u.ville) ?? 0) + 1));
  const lines = [
    `POSTURE DES UNITÉS · ${us.length} unités référencées`,
    `Prêtes : ${uReady.length} · Déployées : ${uDep.length} · En attente : ${uStd.length} · Readiness moyenne : ${avgR}%`,
    lowR.length ? `Unités sous-readiness (<70%) : ${lowR.length}` : "Toutes les unités ≥70% readiness.",
    ...lowR.map((u) => `  • ${u.nom} (${u.ville}) · readiness ${u.readiness}% · statut ${DISPO_LABEL[u.dispo]}`),
    `Répartition par ville :`,
    ...[...byRegion.entries()].sort((a, b) => b[1] - a[1]).map(([v, n]) => `  • ${v} : ${n} unité(s)`),
    `Détail des unités (readiness décroissant) :`,
    ...[...us].sort((a, b) => b.readiness - a.readiness).map((u) => {
      const caps = UNIT_CAPS[u.id]?.map((c) => CAP_LABELS[c]).join(", ") || "—";
      return `  • ${u.id} ${u.nom} (${u.ville}) · ${DISPO_LABEL[u.dispo]} · readiness ${u.readiness}% · eff. ${u.eff} · ${caps}`;
    }),
  ];
  return {
    intent: "units_status",
    layer1: "posture unités : dispo × readiness × répartition géographique × capacités",
    text: lines.join("\n"),
    units: [...us].sort((a, b) => b.readiness - a.readiness).map((u) => ({
      id: u.id, nom: u.nom, ville: u.ville, etaMin: u.readiness, caps: (UNIT_CAPS[u.id] ?? []).map((c) => CAP_LABELS[c]), dispo: DISPO_LABEL[u.dispo], within: true,
    })),
    stats: { unitsReady: uReady.length, unitsDeployed: uDep.length, avgReadiness: avgR },
  };
}

/**
 * Centre géographique de « potentiel mobilisable ».
 *   1. Incident cible (ll > region > titre).
 *   2. Mots-clés de la requête : DYNAMIQUE resolveCityCoords(ctx).
 *   3. Villes référencées dans unités (catalogue).
 *   4. Groupe régional : DYNAMIQUE platformRegionGroups(ctx), seed fallback SEULEMENT SI catalogue vide.
 */
function detectMobilityCenter(q: string, ctx: AiContext, inc?: Incident): { ville: string; center: [number, number] } | null {
  const nq = norm(q);
  const cityKeys = Object.keys(CITY_COORDS).sort((a, b) => b.length - a.length);
  if (inc) {
    const ville = resolveIncidentRegion(inc.id, inc);
    if (inc.ll?.length === 2) return { ville, center: inc.ll };
    const resolved = resolveCityCoords(inc.region ?? inc.titre, ctx);
    if (resolved) return { ville, center: resolved.center };
    const keyC = cityKeys.find((k) => norm(inc.region ?? "").includes(norm(k)) || norm(inc.titre).includes(norm(k)));
    if (keyC) return { ville, center: CITY_COORDS[keyC] };
  }

  // 2 — DYNAMIQUE : villes connues de la plateforme (resolveCityCoords = unités d'abord, puis hôpitaux, puis incidents, seed en dernier).
  const fromQuery = resolveCityCoords(nq, ctx);
  if (fromQuery) return { ville: fromQuery.ville, center: fromQuery.center };

  // 3 — Catalogue des unités : match sur le nom de ville (compatible avec les noms ajoutés dans la BDD)
  const candidateVilles = Array.from(new Set(ctx.units.map((u) => u.ville))).sort((a, b) => b.length - a.length);
  for (const v of candidateVilles) {
    if (nq.includes(norm(v))) {
      const found = ctx.units.find((u) => u.ville === v);
      if (found) return { ville: v, center: found.ll };
    }
  }

  // 4 — DYNAMIQUE : groupes régionaux depuis la plateforme. Seed fallback seulement si catalogue vide.
  const regionGroup = /region\s+(de\s+)?(\w[\w\s-]*\w|\w)/i.exec(q);
  const regionRaw = regionGroup ? regionGroup[2].trim().toLowerCase() : "";
  const regionHints: RegionGroup[] = platformRegionGroups(ctx);
  for (const g of regionHints) {
    const name = g.name;
    const members = g.members;
    const nameMatch = regionRaw && (regionRaw === norm(name).replace(/-/g, " ") || regionRaw === norm(name));
    const memberMatch = members.some((m) => nq.includes(norm(m)));
    if (nameMatch || memberMatch) {
      const unitsInGroup = ctx.units.filter((u) => members.some((m) => norm(u.ville).includes(norm(m))));
      if (unitsInGroup.length) {
        const lats = unitsInGroup.map((u) => u.ll[1]);
        const lons = unitsInGroup.map((u) => u.ll[0]);
        return { ville: name, center: [lons.reduce((a, b) => a + b, 0) / lons.length, lats.reduce((a, b) => a + b, 0) / lats.length] };
      }
    }
  }
  return null;
}

/** La réponse « périmètre » pour un centre donné : unités dans le rayon, capacités, équipements liés. */
function computeMobilityPerimeter(ctx: AiContext, center: [number, number], ville: string, rayonKm: number, inc?: Incident): AiAnswer {
  const withDist = ctx.units
    .map((u) => ({ unit: u, dKm: haversineKm(center, u.ll), etaMin: etaMinutes(center, u.ll) }))
    .filter((x) => x.dKm <= rayonKm)
    .sort((a, b) => {
      // Prêtes d'abord, puis readiness décroissant, puis distance croissante.
      const rank = (d: string) => (d === "ready" ? 0 : d === "standby" ? 1 : 2);
      const r = rank(a.unit.dispo) - rank(b.unit.dispo);
      if (r !== 0) return r;
      if (a.unit.readiness !== b.unit.readiness) return b.unit.readiness - a.unit.readiness;
      return a.dKm - b.dKm;
    });
  const total = ctx.units.length;
  const nbP = withDist.length;
  const nbReady = withDist.filter((x) => x.unit.dispo === "ready").length;
  const nbDep = withDist.filter((x) => x.unit.dispo === "deployed").length;
  const avgR = nbP ? Math.round(withDist.reduce((s, x) => s + x.unit.readiness, 0) / nbP) : 0;
  const avgEta = nbP ? Math.round(withDist.reduce((s, x) => s + x.etaMin, 0) / nbP) : 0;
  const capCounts = new Map<Capability, number>();
  withDist.forEach((x) => {
    (UNIT_CAPS[x.unit.id] ?? [] as Capability[]).forEach((c) => capCounts.set(c, (capCounts.get(c) ?? 0) + 1));
  });
  const capLines = [...capCounts.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `  • ${CAP_LABELS[c]} : ${n} unité(s)`);
  const topUnitIds = new Set(withDist.filter((x) => x.unit.dispo === "ready").slice(0, 5).map((x) => x.unit.id));
  const topEquip = ctx.equipment.filter((e) => {
    // DYNAMIQUE : resolveUnitId → catalogue d'abord, UNIT_CODE (seed) seulement fallback.
    const uid = resolveUnitId(e.unit, ctx);
    return uid ? topUnitIds.has(uid) : false;
  }).slice(0, 8);
  const titleVille = ville ? ville[0].toUpperCase() + ville.slice(1) : "zone cible";
  const lines = [
    inc
      ? `POTENTIEL MOBILISABLE POUR **${inc.id} · ${inc.titre}** (${inc.region}) · ${titleVille} · rayon ${rayonKm} km`
      : `POTENTIEL MOBILISABLE — ${titleVille} · rayon ${rayonKm} km`,
    `${nbP}/${total} unités dans le périmètre · ${nbReady} prêtes immédiatement · ${nbDep} déjà déployées · ${nbP - nbReady - nbDep} en attente`,
    `Readiness moyenne ${avgR}% · Temps d'arrivée moyen (centre géo) : ${avgEta} min`,
    capLines.length ? `Capacités couvertes dans le périmètre :` : "Aucune capacité détectée.",
    ...capLines,
    withDist.length ? `TOP ${Math.min(8, withDist.length)} unités (prêtes/standby + readiness + proximité) :` : "Aucune unité documentée dans ce périmètre.",
    ...withDist.slice(0, 8).map((x, i) => {
      const caps = (UNIT_CAPS[x.unit.id] ?? []).map((c) => CAP_LABELS[c]).join(" / ") || "—";
      return `${String(i + 1).padStart(2, " ")}. ${x.unit.id} ${x.unit.nom} (${x.unit.ville}) — ${x.dKm.toFixed(1)} km · ETA ${x.etaMin} min · statut ${DISPO_LABEL[x.unit.dispo]} · readiness ${x.unit.readiness}% · eff. ${x.unit.eff} · ${caps}`;
    }),
  ];
  const mapFocus = { ll: center, zoom: rayonKm <= 30 ? 10 : rayonKm <= 80 ? 9 : 8, label: ville };
  return {
    intent: "mobilizable_potential",
    layer1: inc
      ? `potentiel mobilisable incident ${inc.id} ${inc.region} rayon ${rayonKm} km · ${nbP} unités · avg readiness ${avgR}%`
      : `potentiel mobilisable ${titleVille} rayon ${rayonKm} km · ${nbP} unités · avg readiness ${avgR}% · avg ETA ${avgEta} min`,
    text: lines.join("\n"),
    units: withDist.map((x) => ({
      id: x.unit.id, nom: x.unit.nom, ville: x.unit.ville, etaMin: x.etaMin, caps: (UNIT_CAPS[x.unit.id] ?? []).map((c) => CAP_LABELS[c]),
      dispo: DISPO_LABEL[x.unit.dispo], within: x.dKm <= rayonKm, readiness: x.unit.readiness,
    })),
    topEquip: topEquip.map((e) => ({ id: e.id, desig: e.desig, cat: e.cat, stock: e.stock, cond: COND_LABEL[e.cond], unit: e.unit, seuil: e.threshold })),
    stats: {
      unitsReady: nbReady, unitsDeployed: nbDep, avgReadiness: avgR,
      items: [
        { key: "périmètre", label: `Périmètre`, value: `${rayonKm} km autour de ${titleVille}`, level: Math.min(1, rayonKm / 150) },
        { key: "nb_potentiel", label: `Unités dans périmètre`, value: `${nbP}/${total}`, level: Math.min(1, nbP / Math.max(1, total)) },
        { key: "nb_pretes", label: `Prêtes immédiatement`, value: `${nbReady}`, level: Math.min(1, nbReady / 6) },
        { key: "eta_moyen", label: `ETA moyen centre`, value: `${avgEta} min`, level: 1 - Math.min(1, avgEta / 120) },
        { key: "capacites", label: `Capacités couvertes`, value: capLines.length ? String(capLines.length) : "0", level: Math.min(1, capLines.length / 7) },
      ],
    },
    cross: { zones: [{ nom: ville, count: nbP, severity: nbReady >= 5 ? "moyen" : nbReady >= 2 ? "élevé" : "critique", ll: center, ids: withDist.map((x) => x.unit.id) }], mapFocus },
    suggestions: inc
      ? suggestionsForIncident(inc, ["Potentiel mobilisable national", "Posture globale unités FAR"])
      : suggestionsGeneric({
          national: ["Potentiel mobilisable national", "Posture globale des unités FAR", "Croise un incident + unités"],
          primary: { label: `Potentiel ${titleVille}`, query: `Potentiel mobilisable autour de ${ville}` },
        }),
  };
}

/** Repli national (prêtes + en attente) quand aucun centre géographique n'est résolu. */
function mobilizableFallbackNational(ctx: AiContext, inc?: Incident): AiAnswer {
  const uReady = ctx.units.filter((u) => u.dispo === "ready" || u.dispo === "standby");
  const totalReady = uReady.filter((u) => u.dispo === "ready").length;
  const avgR = uReady.length ? Math.round(uReady.reduce((a, u) => a + u.readiness, 0) / uReady.length) : 0;
  const units = uReady.sort((a, b) => b.readiness - a.readiness).map((u) => ({
    id: u.id, nom: u.nom, ville: u.ville, etaMin: u.readiness, caps: (UNIT_CAPS[u.id] ?? []).map((c) => CAP_LABELS[c]), dispo: DISPO_LABEL[u.dispo], within: true,
  }));
  if (inc) {
    return {
      intent: "mobilizable_potential",
      layer1: `potentiel mobilisable incident ${inc.id} — centre géo non résolu → repli national prêtes/standby`,
      text: [
        `⚠️ Centre géographique non résolu pour **${inc.id} · ${inc.titre}** (${inc.region}). Potentiel mobilisable NATIONAL ci-dessous ; « 50 km autour de Marrakech » donne un périmètre précis.`,
        `Unités mobilisables (prêtes + en attente) : ${uReady.length}/${ctx.units.length} · readiness moyenne ${avgR}%`,
      ].join("\n"),
      units,
      suggestions: suggestionsForIncident(inc, ["Potentiel mobilisable national", "Posture globale unités FAR"]),
      analytics: ctx.analytics ?? null,
    };
  }
  return {
    intent: "mobilizable_potential",
    layer1: "potentiel mobilisable — centre non résolu → potentiel national (prêtes / standby)",
    text: [
      `POTENTIEL MOBILISABLE — NATIONAL (requête sans zone cible explicite)`,
      `Unités mobilisables (prêtes + en attente) : ${uReady.length}/${ctx.units.length} · dont ${totalReady} prêtes immédiatement · readiness moyenne ${avgR}%`,
      `Astuces pour préciser : « 60 km autour de Casablanca » · « potentiel Rabat » · « mobilisable dans la région de Marrakech ».`,
    ].join("\n"),
    units,
    stats: { unitsReady: totalReady, avgReadiness: avgR },
    suggestions: suggestionsGeneric({
      national: ["Posture globale des unités FAR", "Potentiel Casablanca", "Croise un incident + unités"],
      primary: "Potentiel mobilisable Marrakech 50 km",
    }),
  };
}

/**
 * Potentiel mobilisable dans un périmètre (région / ville ou rayon km) — avec
 * ou sans incident cible ; un identifiant inconnu reçoit la réponse négative.
 */
export function mobilizablePotential(q: string, ctx: AiContext): AiAnswer {
  const rayonMatch = q.match(/(\d+)\s*(?:km|kilom[èe]tres?)/i);
  const rayonKm = rayonMatch ? parseInt(rayonMatch[1], 10) : 50;
  return withValidIncident(q, ctx, "mobilizable_potential", (inc) => {
    const geo = detectMobilityCenter(q, ctx, inc);
    return geo ? computeMobilityPerimeter(ctx, geo.center, geo.ville, rayonKm, inc) : mobilizableFallbackNational(ctx, inc);
  }, () => {
    const geo = detectMobilityCenter(q, ctx);
    return geo ? computeMobilityPerimeter(ctx, geo.center, geo.ville, rayonKm) : mobilizableFallbackNational(ctx);
  });
}
