// ============================================================================
// ARGOS — briefing opérationnel d'un incident (ADR 0032)
//
// Situation · Anticipation · Objectifs · Concept d'opération · Actions à
// entreprendre (ADR 0034), établis en un
// instant sur les DONNÉES de la station : l'incident principal, ses incidents
// rattachés et leurs sous-incidents, les moyens engagés, les postes déployés,
// le journal des actions entreprises, la prédiction d'évolution et la météo.
// Aucun appel réseau, aucun modèle : c'est la « couche 1 » — l'IA peut ensuite
// la reformuler (llmBriefing), jamais y ajouter un chiffre.
// ============================================================================

import type { FieldHospital, Hospital, Incident, IncidentPost, SubIncidentCatalog, Unit, UnitCorps, WeatherForecast } from "@/lib/types";
import type { IncidentEvolution } from "@/lib/ai/risk/incidentEvolution";

export interface Briefing {
  incidentId: string;
  titre: string;
  /** Moment où le briefing a été établi (ISO). */
  generatedAt: string;
  scope: { children: number; subIncidents: number };
  situation: string[];
  anticipation: string[];
  objectives: string[];
  concept: string[];
  /** Actions à entreprendre, par ordre de priorité (ADR 0034). */
  actions: string[];
}

export interface BriefingInput {
  root: Incident;
  /** Tous les incidents (les rattachés sont retrouvés par `parentId`). */
  incidents: Incident[];
  units: Unit[];
  hospitals: Hospital[];
  fieldHosps: FieldHospital[];
  posts: IncidentPost[];
  subCatalog: SubIncidentCatalog;
  evolution?: IncidentEvolution | null;
  weather?: WeatherForecast | null;
  typeLabel: (type: string) => string;
  now?: Date;
}

const SEV_TXT = { high: "HAUTE", medium: "MOYENNE", low: "FAIBLE" } as const;
const ST_TXT = { open: "ouvert", prog: "en cours de traitement", closed: "clôturé" } as const;
const LEVEL_TXT = { critique: "CRITIQUE", eleve: "ÉLEVÉ", modere: "MODÉRÉ", faible: "FAIBLE" } as const;
const TREND_TXT = { aggravation: "en aggravation", stable: "stable", amelioration: "en amélioration" } as const;
const CORPS_TXT: Record<UnitCorps, string> = { far: "FAR", gendarmerie: "Gendarmerie", dgsn: "DGSN", dgpc: "Protection civile", fa: "Forces auxiliaires" };
const POST_TXT: Record<string, string> = {
  opcom: "OPCOM", tacom: "TACOM", pco: "PCO", pct: "PCT", pcfar: "PC FAR", pcf: "PCF",
  bluecell: "cellule bleue", greencell: "cellule verte", orangecell: "cellule orange", shelter: "abri", equipment: "parc",
};

/** Objectifs propres à la nature de l'incident, par ordre de priorité. */
const TYPE_OBJECTIVES: Record<string, string[]> = {
  earthquake: ["Rechercher et dégager les personnes ensevelies (sauvetage-déblaiement).", "Évaluer les bâtiments et interdire l'accès aux structures menaçantes ; anticiper les répliques."],
  building_collapse: ["Rechercher et dégager les personnes ensevelies (sauvetage-déblaiement).", "Stabiliser les structures voisines et interdire la zone d'effondrement."],
  flood: ["Mettre hors d'eau et évacuer les populations exposées.", "Surveiller la montée des eaux et les ouvrages ; interdire les passages submergés."],
  tsunami: ["Évacuer la bande côtière vers les hauteurs.", "Interdire le retour avant la fin de l'alerte."],
  wildfire: ["Circonscrire le feu et protéger les zones habitées.", "Évacuer préventivement les habitations sous le vent."],
  landslide: ["Évacuer et interdire la zone instable.", "Surveiller l'évolution du glissement et rétablir les accès."],
  nrbc: ["Isoler la zone et protéger la population (confinement ou évacuation).", "Identifier l'agent, décontaminer les victimes et les intervenants."],
  industrial: ["Isoler le site et éviter le sur-accident.", "Protéger les populations riveraines (confinement ou évacuation)."],
  epidemic: ["Isoler les cas et rompre la chaîne de transmission.", "Protéger les soignants et renforcer la capacité hospitalière."],
  storm: ["Mettre à l'abri les populations exposées.", "Dégager les axes et rétablir les réseaux."],
  coldwave: ["Mettre à l'abri et chauffer les personnes vulnérables.", "Désenclaver les douars isolés."],
  drought: ["Assurer l'approvisionnement en eau des populations.", "Protéger les personnes vulnérables et le cheptel."],
  road_accident: ["Secourir et évacuer les victimes.", "Sécuriser la chaussée et prévenir le sur-accident."],
  maritime: ["Rechercher et secourir les naufragés.", "Prévenir et contenir une pollution."],
};

/** Un énoncé sans ponctuation finale, pour l'enchaîner à d'autres sans doubler les points. */
function bare(s: string): string {
  return s.trim().replace(/[\s.;:,]+$/u, "");
}

function sum(ns: number[]): number {
  return ns.reduce((a, b) => a + b, 0);
}

function list(items: string[], max = 6): string {
  if (items.length <= max) return items.join(", ");
  return `${items.slice(0, max).join(", ")} et ${items.length - max} autre(s)`;
}

function fmtDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Le briefing de l'incident principal et de sa famille (rattachés, sous-incidents). */
export function buildBriefing(input: BriefingInput): Briefing {
  const { root, typeLabel } = input;
  const now = input.now ?? new Date();
  const children = input.incidents.filter((i) => i.parentId === root.id);
  const family = [root, ...children];
  const subs = family.flatMap((i) => (i.subIncidents ?? []).map((s) => ({ s, of: i })));
  const subLabel = (type: string) => input.subCatalog.types.find((t) => t.id === type)?.labels.fr ?? type;

  // --- bilan et moyens de toute la famille ---------------------------------
  const cas = (c?: { dead: number; injured: number; missing: number }) => c ?? { dead: 0, injured: 0, missing: 0 };
  const dead = sum(family.map((i) => cas(i.casualties).dead)) + sum(subs.map(({ s }) => cas(s.casualties).dead));
  const injured = sum(family.map((i) => cas(i.casualties).injured)) + sum(subs.map(({ s }) => cas(s.casualties).injured));
  const missing = sum(family.map((i) => cas(i.casualties).missing)) + sum(subs.map(({ s }) => cas(s.casualties).missing));
  // Les personnes impliquées (ADR 0034) : touchées, pas victimes — jamais dans le bilan des victimes.
  const involved = sum(family.map((i) => i.casualties?.involved ?? 0));
  const unitIds = [...new Set(family.flatMap((i) => i.responders?.units ?? []))];
  const units = unitIds.map((id) => input.units.find((u) => u.id === id)).filter((u): u is Unit => !!u);
  const hospIds = [...new Set(family.flatMap((i) => i.responders?.hospitals ?? []))];
  const hospitals = hospIds.map((id) => input.hospitals.find((h) => h.id === id)).filter((h): h is Hospital => !!h);
  const fields = input.fieldHosps.filter((f) => hospIds.includes(f.hid) || family.some((i) => i.id === f.incidentId));
  const morgueCount = new Set(family.flatMap((i) => i.responders?.morgues ?? [])).size;
  const assignments = family.flatMap((i) => i.assignments ?? []);
  const posts = input.posts.filter((p) => family.some((i) => i.id === p.incidentId));
  const effectif = sum(units.map((u) => u.eff));
  const lits = sum(hospitals.map((h) => h.lits));
  const occupes = sum(hospitals.map((h) => h.occ));
  const occPct = lits > 0 ? Math.round((occupes / lits) * 100) : 0;

  // --- SITUATION --------------------------------------------------------------
  const situation: string[] = [];
  const declared = fmtDate(root.declaredAt);
  situation.push(
    `${typeLabel(root.type)} « ${root.titre} » — ${root.region}${root.adresse ? `, ${root.adresse}` : ""}${declared ? ` — déclaré le ${declared}` : ""} ; gravité ${SEV_TXT[root.sev]}, ${ST_TXT[root.st]}.`,
  );
  if (root.desc?.trim()) situation.push(`Contexte : ${root.desc.trim().slice(0, 280)}${root.desc.trim().length > 280 ? "…" : ""}`);
  situation.push(
    dead + injured + missing > 0
      ? `Bilan humain${children.length || subs.length ? " (incident, rattachés et aléas secondaires)" : ""} : ${dead} décès, ${injured} blessé(s), ${missing} disparu(s).`
      : "Bilan humain : aucune victime déclarée à ce stade.",
  );
  if (involved > 0) situation.push(`Personnes impliquées (ni blessées, ni disparues, ni décédées) : ${involved}.`);
  if (children.length) {
    situation.push(`Incidents rattachés (${children.length}) : ${list(children.map((c) => `${typeLabel(c.type)} « ${c.titre} » (gravité ${SEV_TXT[c.sev].toLowerCase()})`), 4)}.`);
  }
  if (subs.length) {
    situation.push(`Aléas secondaires (${subs.length}) : ${list(subs.map(({ s }) => `${subLabel(s.type)}${s.note ? ` — ${s.note}` : ""}`), 5)}.`);
  }
  if (units.length || hospitals.length || fields.length) {
    const parts: string[] = [];
    if (units.length) parts.push(`${units.length} unité(s), ${effectif} personnel(s) — ${list(units.map((u) => u.nom), 4)}`);
    if (hospitals.length) parts.push(`${hospitals.length} établissement(s) de santé — ${list(hospitals.map((h) => h.nom), 3)}`);
    if (fields.length) parts.push(`${fields.length} hôpital(aux) de campagne`);
    if (morgueCount) parts.push(`${morgueCount} site(s) mortuaire(s)`);
    situation.push(`Moyens engagés : ${parts.join(" ; ")}.`);
  } else {
    situation.push("Moyens engagés : aucun moyen rattaché à ce stade.");
  }
  const log = family.flatMap((i) => (i.actionsLog ?? []).map((e) => ({ e, of: i }))).sort((a, b) => b.e.at.localeCompare(a.e.at));
  if (log.length) {
    situation.push(
      `Dernières actions entreprises : ${log
        .slice(0, 3)
        .map(({ e }) => `${fmtDate(e.at) ?? ""} — ${bare(e.action || e.event)}`)
        .join(" ; ")}.`,
    );
  }

  // --- ANTICIPATION -----------------------------------------------------------
  const anticipation: string[] = [];
  const ev = input.evolution;
  if (ev) {
    anticipation.push(
      `Évolution estimée : niveau ${LEVEL_TXT[ev.level]}, tendance ${TREND_TXT[ev.trend]} — probabilité d'aggravation ${Math.round(ev.probabilityPct)} % sous ${Math.round(ev.horizonMin)} min.`,
    );
    if (ev.scenario) anticipation.push(`Scénario : ${bare(ev.scenario)}.`);
    const drivers = [...ev.factors].sort((a, b) => b.weightedScore - a.weightedScore).slice(0, 3).map((f) => f.label);
    if (drivers.length) anticipation.push(`Facteurs principaux : ${drivers.join(" ; ")}.`);
  }
  const possibles = (input.subCatalog.byParent[root.type] ?? []).filter((t) => !subs.some(({ s }) => s.type === t));
  if (possibles.length) anticipation.push(`Aléas secondaires possibles, non déclarés : ${list(possibles.map(subLabel), 5)}.`);
  if (missing > 0) anticipation.push(`${missing} disparu(s) : le bilan peut s'alourdir.`);
  if (hospitals.length) {
    anticipation.push(`Capacité hospitalière engagée : ${Math.max(0, lits - occupes)} lit(s) libre(s) sur ${lits} (${occPct} % occupés)${occPct >= 85 ? " — saturation proche" : ""}.`);
  }
  const wx = input.weather?.current;
  if (wx) {
    anticipation.push(`Météo sur zone : ${Math.round(wx.temp)} °C, vent ${Math.round(wx.wind)} km/h (rafales ${Math.round(wx.gust)}), précipitations ${wx.precip} mm.`);
  }
  if (!anticipation.length) anticipation.push("Aucun élément d'anticipation disponible : données d'évolution et météo absentes.");

  // --- OBJECTIFS ----------------------------------------------------------------
  const objectives: string[] = [];
  if (dead + injured + missing > 0 || root.sev === "high") {
    const detail = [injured ? `${injured} blessé(s) à prendre en charge` : "", missing ? `${missing} disparu(s) à rechercher` : ""].filter(Boolean).join(", ");
    objectives.push(`Sauver les vies${detail ? ` : ${detail}` : ""}.`);
  }
  for (const o of TYPE_OBJECTIVES[root.type] ?? []) if (!objectives.includes(o)) objectives.push(o);
  for (const c of children) for (const o of TYPE_OBJECTIVES[c.type] ?? []) if (!objectives.includes(o)) objectives.push(o);
  if (injured > 0) objectives.push(`Assurer la prise en charge médicale et l'évacuation des blessés${hospitals.length ? ` vers ${list(hospitals.map((h) => h.nom), 2)}` : ""}.`);
  if (dead > 0) objectives.push("Traiter les défunts avec dignité : acheminement vers les sites mortuaires et identification.");
  if (involved > 0) objectives.push(`Prendre en charge les ${involved} personne(s) impliquée(s) : recensement, mise à l'abri, soutien.`);
  objectives.push("Informer et protéger la population ; tenir l'autorité informée de l'évolution.");

  // --- CONCEPT D'OPÉRATION -----------------------------------------------------
  const concept: string[] = [];
  const kinds = [...new Set(posts.map((p) => POST_TXT[p.kind] ?? p.kind))];
  concept.push(kinds.length ? `Commandement : ${kinds.join(", ")} déployé(s) sur la carte.` : "Commandement : aucun poste de commandement déployé sur la carte — à armer.");
  const worst = [...family].sort((a, b) => ["low", "medium", "high"].indexOf(b.sev) - ["low", "medium", "high"].indexOf(a.sev))[0];
  concept.push(`Effort principal : ${worst.id === root.id ? "l'incident principal" : `l'incident rattaché « ${worst.titre} »`} (${worst.region}, gravité ${SEV_TXT[worst.sev].toLowerCase()}).`);
  if (units.length) {
    const byCorps = new Map<string, number>();
    for (const u of units) byCorps.set(CORPS_TXT[u.corps ?? "far"], (byCorps.get(CORPS_TXT[u.corps ?? "far"]) ?? 0) + 1);
    concept.push(`Moyens par corps : ${[...byCorps].map(([c, n]) => `${c} ${n}`).join(", ")}.`);
  }
  if (assignments.length) {
    const pco = assignments.filter((a) => a.destination === "pco").length;
    const pct = assignments.filter((a) => a.destination === "pct").length;
    const deployed = assignments.filter((a) => !!a.deployedAt).length;
    concept.push(`Affectations : ${assignments.length} unité(s) affectée(s) — PCO ${pco}, PCT ${pct} ; ${deployed} déployée(s) sur le terrain.`);
  }
  if (hospitals.length || fields.length) {
    concept.push(`Soutien santé : ${[hospitals.length ? `${hospitals.length} établissement(s)` : "", fields.length ? `${fields.length} hôpital(aux) de campagne` : ""].filter(Boolean).join(" et ")} ; évacuations coordonnées par le PC.`);
  }
  concept.push(`Coordination : centre de communication, canal de l'opération « ${root.titre} » ; point de situation à chaque évolution notable.`);

  // --- ACTIONS À ENTREPRENDRE (ADR 0034) ----------------------------------------
  // Ce qui manque au dispositif, d'abord, puis les actions recommandées par la
  // prédiction d'évolution ; chaque ligne se déduit des données — aucune
  // n'est inventée.
  const actions: string[] = [];
  const add = (a: string) => {
    const k = bare(a).toLowerCase();
    if (!actions.some((x) => bare(x).toLowerCase() === k)) actions.push(a);
  };
  if (!posts.length) add("Armer un poste de commandement (PCT ou PCO) sur la carte et en désigner le chef.");
  if (!units.length) add("Engager des unités sur l'opération : aucune n'y est rattachée.");
  const aDeployer = assignments.filter((a) => !a.deployedAt).length;
  if (aDeployer) add(`Déployer sur le terrain ${aDeployer} unité(s) affectée(s) qui ne le sont pas encore.`);
  if (missing > 0) add(`Lancer la recherche des ${missing} disparu(s) ; recouper avec les hôpitaux et les abris.`);
  if (injured > 0 && !hospitals.length) add(`Désigner les établissements d'évacuation des ${injured} blessé(s).`);
  if (injured > 0 && hospitals.length && occPct >= 85) add("Anticiper la saturation hospitalière : hôpital de campagne ou report vers d'autres établissements.");
  if (dead > 0 && !morgueCount) add(`Affecter un site mortuaire aux ${dead} décès et ouvrir les dossiers d'identification.`);
  if (involved > 0) add(`Recenser les ${involved} personne(s) impliquée(s), les mettre à l'abri et organiser leur soutien.`);
  if (possibles.length) add(`Surveiller les aléas possibles : ${list(possibles.slice(0, 3).map(subLabel), 3)}.`);
  if (root.type === "nrbc" || root.nrbc) add("Tenir le périmètre d'isolement et la chaîne de décontamination.");
  for (const a of ev?.actions ?? []) add(`${bare(a)}.`);
  add("Consigner chaque action entreprise au journal de l'incident et diffuser un point de situation.");

  return {
    incidentId: root.id,
    titre: root.titre,
    generatedAt: now.toISOString(),
    scope: { children: children.length, subIncidents: subs.length },
    situation,
    anticipation,
    objectives,
    concept,
    actions,
  };
}

/** Le briefing en texte brut, rubrique par rubrique (copie, IA). */
export function briefingText(
  b: Briefing,
  labels: { situation: string; anticipation: string; objectives: string; concept: string; actions: string },
): string {
  const bloc = (title: string, lines: string[]) => `${title.toUpperCase()}\n${lines.map((l) => `- ${l}`).join("\n")}`;
  return [
    `BRIEFING — ${b.incidentId} « ${b.titre} »`,
    bloc(labels.situation, b.situation),
    bloc(labels.anticipation, b.anticipation),
    bloc(labels.objectives, b.objectives),
    bloc(labels.concept, b.concept),
    `${labels.actions.toUpperCase()}\n${b.actions.map((l, k) => `${k + 1}. ${l}`).join("\n")}`,
  ].join("\n\n");
}

/** La racine d'une famille : un incident rattaché renvoie à son principal. */
export function briefingRoot(incidents: Incident[], id: string): Incident | undefined {
  const inc = incidents.find((i) => i.id === id);
  if (!inc) return undefined;
  return inc.parentId ? incidents.find((i) => i.id === inc.parentId) ?? inc : inc;
}
