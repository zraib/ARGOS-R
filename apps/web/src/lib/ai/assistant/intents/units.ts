// ============================================================================
// ARGOS — assistant IA · Intentions « unités » : état et potentiel mobilisable.
//
// Extrait de l'ancien `assistant.ts` (2 782 lignes) lors de la refactorisation :
// même code, découpé par responsabilité pour être lisible, testable et
// modifiable sans relire le tout. Voir `index.ts` pour la surface publique.
// ============================================================================

import { CITY_COORDS, COND_LABEL, DISPO_LABEL, UNIT_CODE, norm } from "../labels";
import type { AiAnswer, AiContext } from "../types";
import { etaMinutes, UNIT_CAPS, CAP_LABELS, type Capability, haversineKm } from "@/lib/reco";

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
 * Potentiel mobilisable dans un périmètre (région / ville ou rayon km).
 * - Détecte la ville cible via CITY_COORDS ou un libellé dans les champs ville des unités.
 * - Accepte un rayon explicite (ex: "60 km", "dans un rayon de 100 km") sinon défaut 50 km.
 * - Agrège : unités prêtes, readiness moyenne, capacités couvertes, équipements liés, ETA moyen.
 * - Tri : readiness décroissant puis distance croissante.
 */
export function mobilizablePotential(q: string, ctx: AiContext): AiAnswer {
  const nq = norm(q);
  // 1) Détection du rayon en km
  const rayonMatch = q.match(/(\d+)\s*(?:km|kilom[èe]tres?)/i);
  const rayonKm = rayonMatch ? parseInt(rayonMatch[1], 10) : 50;
  // 2) Détection ville / région
  const cityKeys = Object.keys(CITY_COORDS).sort((a, b) => b.length - a.length);
  let ville: string | null = null;
  let center: [number, number] | null = null;
  for (const k of cityKeys) {
    if (nq.includes(norm(k))) {
      ville = k;
      center = CITY_COORDS[k] as [number, number];
      break;
    }
  }
  if (!center) {
    // Pas de coordonnée connue → on essaie de trouver une ville depuis le libellé exact de unit.ville
    const candidateVilles = Array.from(new Set(ctx.units.map((u) => u.ville))).sort((a, b) => b.length - a.length);
    for (const v of candidateVilles) {
      if (nq.includes(norm(v))) {
        ville = v;
        const found = ctx.units.find((u) => u.ville === v);
        center = found ? found.ll : null;
        break;
      }
    }
  }
  // 3) Cas : requête par région (pas de ville détectée, mais un groupe de villes)
  if (!center) {
    const regionGroup = /region\s+(de\s+)?(\w[\w\s-]*\w|\w)/i.exec(q);
    const regionRaw = regionGroup ? regionGroup[2].trim().toLowerCase() : "";
    const regionHints = [
      ["rabat-salé", "rabat", "salé", "temara", "skhirate"],
      ["casablanca-settat", "casa", "casablanca", "settat", "mohammedia", "bouskoura"],
      ["marrakech-safi", "marrakech", "safi", "el kelaa des sraghna"],
      ["fès-meknès", "fès", "fes", "meknès", "meknes"],
      ["tanger-tétouan-al hoceima", "tanger", "tetouan", "tétouan", "hoceima", "al hoceima"],
      ["souss-massa", "agadir", "taroudant", "tiznit"],
      ["oriental", "oujda", "nador", "berkane", "guercif"],
    ];
    for (const g of regionHints) {
      const [name, ...members] = g;
      if (regionRaw === norm(name).replace(/-/g, " ") || members.some((m) => nq.includes(norm(m)))) {
        const unitsInGroup = ctx.units.filter((u) => members.some((m) => norm(u.ville).includes(norm(m))));
        if (unitsInGroup.length) {
          ville = name;
          const lats = unitsInGroup.map((u) => u.ll[1]);
          const lons = unitsInGroup.map((u) => u.ll[0]);
          center = [lons.reduce((a, b) => a + b, 0) / lons.length, lats.reduce((a, b) => a + b, 0) / lats.length];
          break;
        }
      }
    }
  }
  if (!center) {
    // Centre non résolu → posture nationale potentiellement mobilisable (équivalent à unitsStatus filtré prêtes/standby)
    const uReady = ctx.units.filter((u) => u.dispo === "ready" || u.dispo === "standby");
    const totalReady = uReady.filter((u) => u.dispo === "ready").length;
    const avgR = uReady.length ? Math.round(uReady.reduce((a, u) => a + u.readiness, 0) / uReady.length) : 0;
    return {
      intent: "mobilizable_potential",
      layer1: "potentiel mobilisable — centre non résolu → potentiel national (prêtes / standby)",
      text: [
        `POTENTIEL MOBILISABLE — NATIONAL (requête sans zone cible explicite)`,
        `Unités mobilisables (prêtes + en attente) : ${uReady.length}/${ctx.units.length} · dont ${totalReady} prêtes immédiatement · readiness moyenne ${avgR}%`,
        `Astuces pour préciser : « 60 km autour de Casablanca » · « potentiel Rabat » · « mobilisable dans la région de Marrakech ».`,
      ].join("\n"),
      units: uReady.sort((a, b) => b.readiness - a.readiness).map((u) => ({
        id: u.id, nom: u.nom, ville: u.ville, etaMin: u.readiness, caps: (UNIT_CAPS[u.id] ?? []).map((c) => CAP_LABELS[c]), dispo: DISPO_LABEL[u.dispo], within: true,
      })),
      stats: { unitsReady: totalReady, avgReadiness: avgR },
    };
  }
  // 4) Filtrage par rayon + calculs géo
  const withDist = ctx.units
    .map((u) => ({
      unit: u,
      dKm: haversineKm(center!, u.ll),
      etaMin: etaMinutes(center!, u.ll),
    }))
    .filter((x) => x.dKm <= rayonKm)
    .sort((a, b) => {
      // Prêtes d'abord puis readiness décroissant, puis distance croissante
      const aDispoRank = a.unit.dispo === "ready" ? 0 : a.unit.dispo === "standby" ? 1 : 2;
      const bDispoRank = b.unit.dispo === "ready" ? 0 : b.unit.dispo === "standby" ? 1 : 2;
      if (aDispoRank !== bDispoRank) return aDispoRank - bDispoRank;
      if (a.unit.readiness !== b.unit.readiness) return b.unit.readiness - a.unit.readiness;
      return a.dKm - b.dKm;
    });
  const total = ctx.units.length;
  const nbP = withDist.length;
  const nbReady = withDist.filter((x) => x.unit.dispo === "ready").length;
  const nbDep = withDist.filter((x) => x.unit.dispo === "deployed").length;
  const avgR = nbP ? Math.round(withDist.reduce((s, x) => s + x.unit.readiness, 0) / nbP) : 0;
  const avgEta = nbP ? Math.round(withDist.reduce((s, x) => s + x.etaMin, 0) / nbP) : 0;
  // 5) Couverture capacités
  const capCounts = new Map<Capability, number>();
  withDist.forEach((x) => {
    (UNIT_CAPS[x.unit.id] ?? [] as Capability[]).forEach((c) => capCounts.set(c, (capCounts.get(c) ?? 0) + 1));
  });
  const capLines = [...capCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `  • ${CAP_LABELS[c]} : ${n} unité(s)`);
  // 6) Équipements liés (top 5 unités prêtes → leurs équipements)
  const topUnitIds = new Set(
    withDist.filter((x) => x.unit.dispo === "ready").slice(0, 5).map((x) => x.unit.id),
  );
  const topEquip = ctx.equipment.filter((e) => {
    const uid = UNIT_CODE[e.unit];
    return uid ? topUnitIds.has(uid) : false;
  });
  // 7) Texte réponse
  const titleVille = ville ? ville[0].toUpperCase() + ville.slice(1) : "zone cible";
  const lines = [
    `POTENTIEL MOBILISABLE — ${titleVille} · rayon ${rayonKm} km`,
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
  const mapFocus = { ll: center, zoom: rayonKm <= 30 ? 10 : rayonKm <= 80 ? 9 : 8, label: ville ?? undefined };
  return {
    intent: "mobilizable_potential",
    layer1: `potentiel mobilisable ${titleVille} rayon ${rayonKm} km · ${nbP} unités · avg readiness ${avgR}% · avg ETA ${avgEta} min`,
    text: lines.join("\n"),
    units: withDist.map((x) => ({
      id: x.unit.id, nom: x.unit.nom, ville: x.unit.ville, etaMin: x.etaMin, caps: (UNIT_CAPS[x.unit.id] ?? []).map((c) => CAP_LABELS[c]), dispo: DISPO_LABEL[x.unit.dispo], within: x.dKm <= rayonKm, readiness: x.unit.readiness,
    })),
    topEquip: topEquip.map((e) => ({
      id: e.id, desig: e.desig, cat: e.cat, stock: e.stock, cond: COND_LABEL[e.cond], unit: e.unit, seuil: e.threshold,
    })),
    stats: {
      unitsReady: nbReady,
      unitsDeployed: nbDep,
      avgReadiness: avgR,
      items: [
        { key: "périmètre", label: `Périmètre`, value: `${rayonKm} km autour de ${titleVille}`, level: Math.min(1, rayonKm / 150) },
        { key: "nb_potentiel", label: `Unités dans périmètre`, value: `${nbP}/${total}`, level: Math.min(1, nbP / Math.max(1, total)) },
        { key: "nb_pretes", label: `Prêtes immédiatement`, value: `${nbReady}`, level: Math.min(1, nbReady / 6) },
        { key: "eta_moyen", label: `ETA moyen centre`, value: `${avgEta} min`, level: 1 - Math.min(1, avgEta / 120) },
        { key: "capacites", label: `Capacités couvertes`, value: capLines.length ? String(capLines.length) : "0", level: Math.min(1, capLines.length / 7) },
      ],
    },
    cross: { zones: [{ nom: ville ?? "cible", count: nbP, severity: nbReady >= 5 ? "moyen" : nbReady >= 2 ? "élevé" : "critique", ll: center, ids: withDist.map((x) => x.unit.id) }], mapFocus },
    suggestions: [
      { label: `Dispositif INC-2607`, query: "Dispositif recommandé pour INC-2607", priority: "primary" as const },
      { label: `Potentiel national`, query: "Potentiel mobilisable national" },
      { label: `Posture unités`, query: "Posture globale des unités FAR" },
    ],
  };
}
