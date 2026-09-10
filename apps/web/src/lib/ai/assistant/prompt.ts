// ============================================================================
// ARGOS — assistant IA · Construction du message utilisateur transmis au modèle (contexte borné, jamais exhaustif).
//
// Extrait de l'ancien `assistant.ts` (2 782 lignes) lors de la refactorisation :
// même code, découpé par responsabilité pour être lisible, testable et
// modifiable sans relire le tout. Voir `index.ts` pour la surface publique.
// ============================================================================

import type { AiAnswer, AiContext, AiCrossBlock, AiHospitalRow, AiIncidentRow } from "./types";
import type { Bar } from "@/lib/data/modules";
import { buildOperationalSnapshot } from "./snapshot";
import type { RiskPrediction } from "@/lib/ai/risk/types";

/** Message utilisateur transmis au LLM : requête + résultat Couche 1 à reformuler. */
export function buildLlmUserMessage(query: string, answer: AiAnswer, lang: "fr" | "en" | "ar" = "fr", ctx?: AiContext): string {
  // Langue de la consigne finale : suit la session (le prompt système porte la
  // même directive) ; les données restent telles quelles.
  const langName = lang === "en" ? "anglais" : lang === "ar" ? "arabe" : "français";
  // 🚨 CRITIQUE 13/08/26 : Qwen2.5:14b (modelfile Ollama) a n_ctx_train=32768 SEULEMENT.
  // Requesting num_ctx > 32768 → Ollama WARN "too large for model" et FORCE -c 32768.
  // TOUT DOIT RENTRER DANS 32 768 tokens (system prompt + historique + user msg + assistant answer).
  // RÈGLE DE SÉCURITÉ ABSOLUE : 1 message user (celui-ci) ≤ ~5 000 tokens.
  //
  // 🔥🔥 14/08/26 : Augmentation ciblée des quotas LLM_MAX_ROWS :
  //         - LLM_MAX_ROWS_HOPITAUX = 200 (tous les 113 hôpitaux transmis pour répondre « taux lits disponibles »)
  //         - LLM_MAX_ROWS_INCIDENTS = 60 (tous les incidents OUVERTS)
  //         - LLM_MAX_ROWS_UNITES = 40 (toutes les unités FAR/RM)
  //         - LLM_MAX_ROWS_EQUIP = 30 (top équipements)
  //         - LLM_MAX_ROWS = 6 (quotidien généraliste default : croisements, seismes etc.)
  // → JSON transmis est tronqué dynamiquement si > 12 000 caractères (GARANTIE ~4 000 tokens).
  // QUOTAS RÉDUITS — C'EST LE LEVIER DU « CHAUD ». Mesuré sur ce poste avec le
  // modèle réellement installé : l'évaluation du prompt tourne à ~575 jetons/s,
  // la génération à ~45 jetons/s. Un contexte de 12 000 caractères (~4 000
  // jetons) coûtait donc ~7 s AVANT le premier mot, à chaque question — et les
  // 200 lignes d'hôpitaux en faisaient l'essentiel. Le modèle n'a pas besoin de
  // 113 hôpitaux pour reformuler : les agrégats (taux, totaux, top) viennent du
  // moteur déterministe, déjà dans `summaryText` et dans les blocs structurés
  // que l'écran monte depuis `answer.*`, pas depuis le texte du modèle. Ce qu'il
  // lui faut, c'est un échantillon fidèle pour illustrer, pas l'exhaustivité.
  // ≤ 5 000 caractères (~1 700 jetons) : ~3 s d'évaluation au lieu de ~7.
  const LLM_MAX_ROWS = 6;
  const LLM_MAX_ROWS_HOPITAUX = 24;
  const LLM_MAX_ROWS_INCIDENTS = 20;
  const LLM_MAX_ROWS_UNITES = 16;
  const LLM_MAX_ROWS_EQUIP = 12;
  const MAX_JSON_CHARS = 5000;
  const data: Record<string, unknown> = {};
  // PREMIÈRE clé : l'instantané opérationnel, calculé en temps réel depuis le
  // contexte. C'est la seule source d'agrégats autorisée par les règles R0–R4
  // du prompt système ; en tête pour survivre à toute troncature.
  if (ctx) data.SNAPSHOT_OPERATIONNEL = buildOperationalSnapshot(ctx);
  // 🚨 13/08/26 FUITE ÉCHO JSON: ne JAMAIS transmettre data.intention=data.indice_moteur.
  //    - greetings/"unknown" font echo ```json {intention:greeting}``` dans la réponse (mistral 7B miroir)
  //    - la reformulation n'a PAS besoin de "intention" détectée par la Couche 1
  //    - indice_moteur est DEJA present dans `summaryText` (## RÉSUMÉ MOTEUR DÉTERMINISTE)
  // if (answer.intent) data.intention = answer.intent;
  // if (answer.layer1) data.indice_moteur = answer.layer1;

  if (answer.units?.length) data.unites = answer.units.slice(0, LLM_MAX_ROWS_UNITES).map((u) => ({
    id: u.id, nom: u.nom, type: u.type ?? "—", ville: u.ville, dispo: u.dispo,
    readiness_pct: u.readiness ?? null, capacites: u.caps ?? [], score: u.score ?? null, ETA_min: u.etaMin,
  }));

  if (answer.incidents?.length) data.incidents = answer.incidents.slice(0, LLM_MAX_ROWS_INCIDENTS).map((i: AiIncidentRow) => ({
    id: i.id, titre: i.titre, region: i.region, severite: i.sev, statut: i.st,
    declare: i.declared ?? i.time, type: i.type, lieu: i.lieu,
    bilan_humain: i.casualties ? {
      deces: i.casualties.dead, blesses: i.casualties.injured,
      disparus: i.casualties.missing, secourus: i.casualties.rescued ?? 0,
    } : undefined,
  }));

  if (answer.hospitals?.length) data.hopitaux = answer.hospitals.slice(0, LLM_MAX_ROWS_HOPITAUX).map((h: AiHospitalRow) => ({
    nom: h.nom ?? h.name ?? "Établissement", ville: h.ville, type: h.kind ?? "—",
    lits: h.lits, occupation_pct: h.occPct,
    occupation_rea_pct: h.icuPct ?? null,
    rea: h.rea, rea_libres: Math.max(0, h.rea - Math.round(h.rea * (h.icuPct ?? 0) / 100)),
    lits_disponibles: Math.max(0, h.lits - Math.round(h.lits * (h.occPct ?? 0) / 100)),
    distance_km: h.distKm ?? null,
  }));

  if (answer.stats) data.statistiques = answer.stats;
  if (answer.topEquip?.length) data.equipements = answer.topEquip.slice(0, LLM_MAX_ROWS_EQUIP).map((e) => ({
    reference: e.id, designation: e.desig, categorie: e.cat, stock: e.stock, etat: e.cond,
    seuil_alerte: e.seuil, unite: e.unit,
  }));
  if (answer.quakes?.length) data.seismes = answer.quakes.slice(0, LLM_MAX_ROWS);

  // 🔥🔥 NOUVEAU : Module Analytique opérationnelle (100% calcul temps réel NestJS
  //    DomainService.computeAnalytics()). Injecté systématiquement dans le JSON
  //    transmis au LLM. Permet au LLM de répondre à : taux clôture, délai
  //    réponse (alerte→site, évac→admission), tendance 7 derniers jours,
  //    saturation hospitalière TOP 6 avec ville, utilisation des moyens par
  //    ressource (Pers / Véh / Eq / Hôp), agrégat zones TRIAGE (rouge/jaune/
  //    vert/noir). Token safe : ~1500 caractères max pour tout analytics.
  if (answer.analytics) {
    const a = answer.analytics;
    type AnalytiqueBar = { label?: string; nom?: string; ville?: string; valeur: number; couleur: string };
    const cleanBar = (b: Bar, removeId = true): AnalytiqueBar => {
      let lbl = b.label.replace(/\s*…\s*$/g, "").replace(/\.{3,}\s*$/g, "").trim();
      if (removeId) lbl = lbl.replace(/^\[[^\]]+\]\s*/g, "");
      const idx = lbl.lastIndexOf("·");
      if (idx > -1) {
        return {
          nom: lbl.slice(0, idx).trim(),
          ville: lbl.slice(idx + 1).trim(),
          valeur: b.value,
          couleur: b.couleur,
        };
      }
      return { label: lbl, valeur: b.value, couleur: b.couleur };
    };
    data.analytique = {
      kpis: {
        delai_reponse_moyen_min: a.kpis.avgResponse,
        delai_evac_vers_admission_min: a.kpis.evacAdmit,
        taux_cloture_pct: a.kpis.closedRate,
        utilisation_moyens_pct: a.kpis.util,
      },
      temps_reponse_etapes: a.responseTimes.map((b) => cleanBar(b, true)),
      tendance_incidents_7j: a.incidentTrend.map((b) => cleanBar(b, true)),
      utilisation_des_moyens: a.resourceUtil.map((b) => cleanBar(b, true)),
      saturation_hospitaliere_top6: a.hospitalSat.map((b) => cleanBar(b, true)),
      resultat_zones_triage: a.triageOutcomes.map((b) => cleanBar(b, true)),
    };
  }

  if (answer.cross) {
    const croppedCross: Partial<AiCrossBlock> = {};
    if (answer.cross.incident) croppedCross.incident = answer.cross.incident;
    if (answer.cross.recommendedUnits?.length) croppedCross.recommendedUnits = answer.cross.recommendedUnits.slice(0, LLM_MAX_ROWS);
    if (answer.cross.hospitals?.length) croppedCross.hospitals = answer.cross.hospitals.slice(0, LLM_MAX_ROWS_HOPITAUX);
    if (answer.cross.unitEquipment?.length) croppedCross.unitEquipment = answer.cross.unitEquipment.slice(0, LLM_MAX_ROWS).map(ue => ({ unitName: ue.unitName, equipment: ue.equipment?.slice(0, 2) ?? [] }));
    if (answer.cross.quakes?.length) croppedCross.quakes = answer.cross.quakes.slice(0, LLM_MAX_ROWS);
    if (answer.cross.zones?.length) croppedCross.zones = answer.cross.zones.slice(0, 3).map(z => ({ nom: z.nom, count: z.count, severity: z.severity, ll: z.ll, ids: z.ids }));
    if (answer.cross.mapFocus) croppedCross.mapFocus = answer.cross.mapFocus;
    data.analyse_croisee = croppedCross;
  }

  // Module prédictions risques (réel, 100% data ARGOS) — top 3 seulement (tokens limit)
  // On transmet uniquement via `ctxNotes` français naturel, JAMAIS dans data → pas d'écho JSON.
  const riskCtx: RiskPrediction[] | undefined = (answer as unknown as { _riskCtx?: RiskPrediction[] })?._riskCtx;
  const riskTop = riskCtx ? riskCtx.filter(p => !p.dismissed).sort((a, b) => b.score - a.score).slice(0, 3) : [];

  // Le texte de la Couche 1 n'est PLUS transmis : il portait des phrases
  // agrégées parfois anciennes que le modèle recopiait au lieu de lire le JSON.
  // Il ne reste qu'une coquille courte : l'intention détectée, sans chiffre.
  const summaryText = (() => {
    const parts = [
      `Intention Couche 1 détectée : ${String(answer.intent ?? "inconnu")}`,
      answer.layer1 ? `(indice : ${String(answer.layer1).slice(0, 70).trim()})` : null,
    ].filter((x): x is string => Boolean(x));
    const hint = "⚠️ Source de vérité UNIQUE = le bloc JSON structuré ci-dessus (SNAPSHOT_OPERATIONNEL, statistiques, incidents, hopitaux, unites). Ce paragraphe ne porte aucun chiffre. " + parts.join(" · ");
    return hint.length > 320 ? hint.slice(0, 320) + "…" : hint;
  })();

  // Notes contextuelles EN FRANÇAIS NATUREL (pas dans JSON → pas de fuite de noms de champs)
  const ctxNotes: string[] = [];
  if (answer.hospitals?.length) ctxNotes.push(`${answer.hospitals.length} établissements de santé au total, ${Math.min(LLM_MAX_ROWS_HOPITAUX, answer.hospitals.length)} détaillé(s) dans JSON (tous transmis sauf si >200).`);
  if (answer.incidents?.length) ctxNotes.push(`${answer.incidents.length} incidents au total, ${Math.min(LLM_MAX_ROWS_INCIDENTS, answer.incidents.length)} détaillé(s).`);
  if (answer.units?.length) ctxNotes.push(`${answer.units.length} unités au total, ${Math.min(LLM_MAX_ROWS_UNITES, answer.units.length)} détaillée(s).`);
  if (answer.topEquip?.length) ctxNotes.push(`${answer.topEquip.length} références équipement au total, ${Math.min(LLM_MAX_ROWS_EQUIP, answer.topEquip.length)} détaillée(s).`);
  if (riskTop.length) {
    const items = riskTop.map((p, i) => `${i + 1}. ${p.label} · score ${p.score}/100 · ${p.level === "eleve" ? "élevé" : p.level === "modere" ? "modéré" : p.level} · horizon ${p.horizon}`).join(" ; ");
    ctxNotes.push(`Prédictions risques · ${riskTop.length} estimation(s) prioritaires : ${items}.`);
  }

  // Garantie token : si le JSON data dépasse MAX_JSON_CHARS ~12 000 (~4 000 tokens), on tronque
  // progressivement hopitaux/incidents/unites/equipements jusqu'à rentrer.
  let jsonStr = JSON.stringify(data);
  const tryCrop = (key: string, keepN: number): boolean => {
    const arr = (data as Record<string, unknown[]>)[key];
    if (!Array.isArray(arr) || arr.length <= keepN) return false;
    (data as Record<string, unknown[]>)[key] = arr.slice(0, keepN);
    return true;
  };
  // Boucle de réduction (→ dans le pire cas on retombe sur quotas LLM_MAX_ROWS basiques)
  const cropSteps: [string, number][] = [
    ["equipements", Math.max(6, Math.floor(LLM_MAX_ROWS_EQUIP / 2))],
    ["unites", Math.max(6, Math.floor(LLM_MAX_ROWS_UNITES / 2))],
    ["incidents", Math.max(6, Math.floor(LLM_MAX_ROWS_INCIDENTS / 2))],
    ["hopitaux", Math.max(20, Math.floor(LLM_MAX_ROWS_HOPITAUX / 4))],
    ["incidents", 8],
    ["unites", 6],
    ["equipements", 4],
    ["hopitaux", 8],
  ];
  let stepIdx = 0;
  while (jsonStr.length > MAX_JSON_CHARS && stepIdx < cropSteps.length) {
    // Ne re-sérialiser QUE si un palier a réellement coupé quelque chose (F-03) :
    // sérialiser pour constater qu'on n'a rien changé est du travail synchrone
    // sur le fil principal, juste avant l'appel réseau.
    if (tryCrop(cropSteps[stepIdx][0], cropSteps[stepIdx][1])) jsonStr = JSON.stringify(data);
    stepIdx += 1;
  }

  const lines: string[] = [];
  lines.push("## QUESTION OPÉRATEUR");
  lines.push(`« ${query} »`);
  lines.push("");
  if (ctxNotes.length > 0) {
    lines.push("## CONTEXTE GLOBAL");
    lines.push(ctxNotes.join(" "));
    lines.push("");
  }
  lines.push("## DONNÉES STRUCTURÉES DÉTAILLÉES (seulement celles-ci — AUCUNE invention autorisée)");
  lines.push("```json");
  // `jsonStr` porte déjà exactement cette sérialisation : la boucle de
  // troncature ci-dessus le réaffecte à chaque palier. Re-sérialiser ~12 000
  // caractères ici serait un travail synchrone de plus sur le thread principal,
  // juste avant l'appel réseau — donc directement dans la latence perçue.
  lines.push(jsonStr);
  lines.push("```");
  lines.push("");
  lines.push("## INTENTION DÉTECTÉE (sans chiffre — les valeurs sont dans le JSON)");
  lines.push(summaryText);
  lines.push("");
  lines.push(`## TA RÉPONSE MAINTENANT (${langName}, concis, factuel, markdown autorisé, titres ###, listes à puces, **gras** pour chiffres clés, 1 tableau Markdown structuré UNIQUEMENT si tu dois comparer ≥ 3 hôpitaux/incidents. RÈGLE FERME : NE termine JAMAIS par des suggestions de questions — l'interface IRIS les affiche séparément (pastilles « Suggérés ») et tu créerais un doublon. Si des données sont DANS le JSON ci-dessus, tu les utilises TOUTES. PAS de blocs code, PAS de JSON dans ta réponse.)`);
  lines.push("");

  return lines.join("\n");
}
