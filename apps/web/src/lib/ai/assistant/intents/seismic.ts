// ============================================================================
// ARGOS — assistant IA · Intention « sismologie ».
//
// Extrait de l'ancien `assistant.ts` (2 782 lignes) lors de la refactorisation :
// même code, découpé par responsabilité pour être lisible, testable et
// modifiable sans relire le tout. Voir `index.ts` pour la surface publique.
// ============================================================================

import { norm } from "../labels";
import type { AiAnswer, AiContext } from "../types";

export function seismicStatus(q: string, ctx: AiContext): AiAnswer {
  const nq = norm(q);

  // --- 🌟 RÈGLE RÉGION (INVERSÉE PAR RAPPORT À AVANT) :
  // DÉFAUT = "world" (MONDIAL, toutes régions confondues).
  // SEULEMENT SI user dit explicitement MAROC → région = morocco.
  const explicitMorocco = /\b(au\s+maroc|maroc|marocaine|nationale|national|locale|local|au\s+pays|dans\s+le\s+pays|far|interieur|intérieur|territoire\s+national)\b/.test(nq);
  const region = explicitMorocco ? "morocco" : "world";

  // --- 🌟 SEUIL MAGNITUDE PAR DÉFAUT = 2.0
  let minMag: number;
  if (/\b(majeur|majeurs|tres\s+fort|tres\s+forts|superieur|supérieur|>=?\s*5|≥\s*5)\b/.test(nq)) {
    minMag = 5;
  } else if (/\b(>=?\s*4|≥\s*4|moyen|modere|modéré|significatif)\b/.test(nq)) {
    minMag = 4;
  } else if (explicitMorocco) {
    minMag = 3;
  } else {
    minMag = 2;
  }

  // --- 🌟 TRI : DERNIER (date DESC) ou PLUS FORT (mag DESC) ?
  const temporalCue = /\b(dernier|demier|derniers|demiers|plus\s+recent|plus\s+récent|recente|récente|actualite|actualité|actualités|actualites|en\s+ce\s+moment|ce\s+jour|aujourd.?hui|24h|48h|semaine|7\s*j|jours?|séisme\s+récent|seisme\s+recent)\b/.test(nq);
  const sortByTime = temporalCue;

  // --- 🌟 SINGULIER VS PLURIEL : NOMBRE D'ÉVÉNEMENTS À AFFICHER DANS LE TEXTE COUCHE1
  // User demande explicitement UN SEUL :
  //   • 1 seul séisme / un seul / juste un / unique / seulement 1 / que 1 / que un
  //   • OU : mot "séisme" SANS "s" final (singulier) ET il y a un mot "dernier/le plus récent"
  const singleCue = /\b(1\s*seul|un\s+seul|juste\s+un|seulement\s+1|seulement\s+un|que\s+1|que\s+un|unique|juste\s+1|seulement|le\s+plus\s+recent|le\s+plus\s+récent|le\s+dernier|le\s+demier)\b/.test(nq)
    // Singulier grammatical fort : "le dernier séisme" / "le plus récent séisme" / "le séisme le plus récent"
    || /\ble\s+(dernier|demier|plus\s+récent|plus\s+recent|seul|unique)\s+(séisme|seisme|evenement|événement|tremblement)\b/.test(nq)
    || /\b(séisme|seisme|tremblement)\s+(le\s+)?(dernier|demier|plus\s+récent|plus\s+recent|seul|unique)\b/.test(nq)
    // Plus le mot "singulier" ou pas de "s" à la fin de la requête (trop fragile → ignoré).
    ;
  // Compte le nombre d'occurrences de "séismes" / "seismes" (PLURIEL)
  const pluralCue = /\b(séismes|seismes|evenements|événements|derniers|demiers|plusieurs|nombre|combien|liste|tous|toutes|les\s+(\d+|quelques|plusieurs))\b/.test(nq);

  // Nombre final d'affichage dans Couche1 :
  let desiredCount: number;
  if (singleCue) {
    desiredCount = 1;
  } else if (/\b(top|meilleurs|pire|pires|plus\s+forts|plus\s+faibles)\s+\d+/.test(nq)) {
    const digits = nq.match(/\b\d+\b/);
    desiredCount = Math.min(20, Math.max(1, digits?.length ? parseInt(digits[0] ?? "3", 10) : 3));
  } else if (pluralCue) {
    desiredCount = sortByTime ? 5 : 8;
  } else if (sortByTime) {
    // Tri temporel SANS singulier/pluriel explicite:
    // SI user a écrit "séisme" SANS "s" = on essaie 1, sinon on prend 3
    const nqRaw = q.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const hasSingularNoun = /(^|[^a-z])(seisme|tremblement)([^a-z]|$)/i.test(nqRaw);
    desiredCount = hasSingularNoun ? 1 : 3;
  } else {
    desiredCount = 5;
  }

  const quakes = ctx.quakes ?? [];
  let list = quakes.filter((qk) => (region === "morocco" ? (qk.lon >= -14 && qk.lon <= -1 && qk.lat >= 21 && qk.lat <= 36) : true));
  list = list.filter((qk) => qk.mag >= minMag);
  if (sortByTime) {
    list.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  } else {
    list.sort((a, b) => b.mag - a.mag);
  }
  const top = list.slice(0, desiredCount);

  // --- 🌟 ENRICHISSEMENT LLM (brut non filtré mag/région)
  const llmVisible = [...quakes]
    .sort((a, b) => b.mag - a.mag)
    .slice(0, 12)
    .map((qk) => ({ id: qk.id, region: qk.region, mag: qk.mag, depth: qk.depth, time: qk.time }));

  // --- 🌟 TEXTE COUCHE1
  // Si SINGULIER (desiredCount === 1) et qu'il y a un événement → RÉPONSE 1 SEUL ÉVÉNEMENT SANS LISTE À PUCES
  const lines: string[] = [];
  if (desiredCount === 1 && top.length === 1) {
    const qk = top[0];
    const t = new Date(qk.time).toLocaleString("fr-FR", { hour12: false });
    lines.push(
      `DERNIER SÉISME · région = ${region} · seuil M ≥ ${minMag} · 1 événement (le ${sortByTime ? "plus récent" : "plus fort"})`,
    );
    lines.push(
      `  M${qk.mag.toFixed(1)}${qk.magType ? ` (${qk.magType})` : ""} — ${qk.region} · profondeur ${qk.depth} km · ${t}${qk.agency ? ` · agence ${qk.agency}` : ""}`,
    );
  } else {
    lines.push(
      `VEILLE SISMIQUE · région = ${region} · seuil M ≥ ${minMag} · ordre = ${sortByTime ? "plus récent d'abord" : "magnitude décroissante"} · ${list.length} événements · affichés ${top.length}`,
    );
    lines.push(
      ...top.map((qk) => {
        const t = new Date(qk.time).toLocaleString("fr-FR", { hour12: false });
        return `  • M${qk.mag.toFixed(1)}${qk.magType ? ` (${qk.magType})` : ""} · ${qk.region} · ${qk.depth} km · ${t}${qk.agency ? ` · agence ${qk.agency}` : ""}`;
      }),
    );
    if (!top.length) lines.push(`  Aucun événement au-dessus du seuil M≥${minMag} dans la zone ${region}.`);
  }

  return {
    intent: "seismic_status",
    layer1: `séismes ${region} M≥${minMag}, ${sortByTime ? "tri par temps décroissant" : "tri par magnitude décroissante"}, affichés ${top.length}/${list.length}${singleCue ? " (singulier)" : ""}`,
    text: lines.filter(Boolean).join("\n"),
    quakes: llmVisible.length ? llmVisible : top.map((qk) => ({ id: qk.id, region: qk.region, mag: qk.mag, depth: qk.depth, time: qk.time })),
    suggestions: [
      "Situation globale",
      explicitMorocco ? "Activité sismique mondiale" : "Séismes au Maroc",
      ...(top.length ? [`Analyse croisée ${top[0].id.startsWith("INC") ? top[0].id : "INC-2607"}`] : ["Analyse croisée avec INC-2607"]),
    ],
  };
}
