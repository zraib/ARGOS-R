// ============================================================================
// ARGOS — orchestrateur de l'assistant IA (§6.17 Couche 2)
// Traduit une requête en langage naturel en une requête Couche 1 DÉTERMINISTE,
// l'exécute contre le moteur de reco / les données, et produit une réponse par
// gabarit en français. Le LLM local ne fait ensuite que reformuler ce résultat
// (voir provider.ts). Cœur exécutable hors-ligne, sans LLM.
// ============================================================================

import type { Incident, Unit } from "@/lib/types";
import type { TransportMovement } from "@/lib/data/dispatch";
import type { EquipItem, OrsecBoard } from "@/lib/data/modules";
import { etaMinutes, UNIT_CAPS, CAP_LABELS, type Capability } from "@/lib/reco";

export type AiIntent = "reachability" | "sitrep" | "anomaly" | "unknown";

export interface AiUnitResult {
  id: string;
  nom: string;
  ville: string;
  etaMin: number;
  caps: string[];
  dispo: string;
  within: boolean;
}

export interface AiAnswer {
  intent: AiIntent;
  /** description humaine de la requête Couche 1 réellement exécutée */
  layer1: string;
  /** réponse déterministe (gabarit FR), toujours disponible */
  text: string;
  units?: AiUnitResult[];
}

export interface AiContext {
  incidents: Incident[];
  movements: TransportMovement[];
  units: Unit[];
  equipment: EquipItem[];
  orsec: OrsecBoard;
}

// --- Utilitaires ----------------------------------------------------------

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Code court d'unité (données EQUIPMENT) → id d'unité. */
const UNIT_CODE: Record<string, string> = {
  "1er GI": "U1", "3e BG": "U2", "7e RA": "U3", "2e GL": "U4", "5e BS": "U5", "4e NRBC": "U6",
};

/** Lieu de référence par incident (les 6 incidents de démonstration). */
const INCIDENT_PLACE: Record<string, string> = {
  "INC-2607": "Al Haouz", "INC-2606": "Ourika", "INC-2604": "Chefchaouen",
  "INC-2601": "Al Hoceïma", "INC-2598": "Mohammedia", "INC-2595": "Zagora",
};

function resolveTarget(q: string, incidents: Incident[]): Incident | null {
  const nq = norm(q);
  for (const inc of incidents) {
    const place = INCIDENT_PLACE[inc.id] ?? inc.region;
    if (nq.includes(norm(place))) return inc;
    // essai sur la région complète
    if (nq.includes(norm(inc.region.split("-")[0]))) return inc;
  }
  return null;
}

function parseThreshold(q: string): number | null {
  const nq = norm(q);
  const min = nq.match(/(\d+)\s*min/);
  if (min) return Number(min[1]);
  const h = nq.match(/(\d+)\s*h(?:eure)?/);
  if (h) return Number(h[1]) * 60;
  if (/une heure|1 heure|d'une heure|en une heure/.test(nq)) return 60;
  if (/deux heures|2 heures/.test(nq)) return 120;
  if (/trois heures|3 heures/.test(nq)) return 180;
  return null;
}

const CAP_KEYWORDS: [RegExp, Capability][] = [
  [/genie|deblaiement|deblai/, "genie"],
  [/sauvetage|sar|recherche|cynophile|cynotech/, "sar"],
  [/medical|medicalis|sante|infirmier|medecin|blesse/, "medical"],
  [/nrbc|chimique|radiologique|decontamin/, "nrbc"],
  [/logistique|ravitaill|fret|transport/, "logistique"],
  [/potabilisation|\beau\b|hydrique/, "eau"],
  [/transmission|radio|liaison/, "transmissions"],
  [/pompage|hydraulique|crue|inondation/, "hydraulique"],
  [/aeroporte|heliporte|helico|parachut/, "aeroporte"],
];

/** Catégorie d'équipement (données EQUIPMENT) déduite de mots-clés. */
function parseEquipCategory(q: string): string | null {
  const nq = norm(q);
  if (/electrogene|generateur|courant|eclairage|energie/.test(nq)) return "Énergie";
  if (/tente|campement|abri/.test(nq)) return "Campement";
  if (/brancard|medical/.test(nq)) return "Médical";
  return null;
}

function parseCapability(q: string): Capability | null {
  const nq = norm(q);
  for (const [re, cap] of CAP_KEYWORDS) if (re.test(nq)) return cap;
  return null;
}

const DISPO_LABEL: Record<string, string> = { ready: "opérationnelle", deployed: "déployée", standby: "en attente" };

// --- Intentions -----------------------------------------------------------

function reachability(q: string, ctx: AiContext): AiAnswer {
  const target = resolveTarget(q, ctx.incidents);
  const threshold = parseThreshold(q);
  const cap = parseCapability(q);
  const equipCat = parseEquipCategory(q);

  if (!target) {
    return {
      intent: "reachability",
      layer1: "portée d'unités — lieu non résolu",
      text: "Je n'ai pas identifié le lieu ou l'opération visée. Précisez une zone (ex. « Al Haouz », « Ourika », « Al Hoceïma »).",
    };
  }

  const equipUnitIds = equipCat
    ? new Set(ctx.equipment.filter((e) => e.cat === equipCat).map((e) => UNIT_CODE[e.unit]).filter(Boolean))
    : null;

  let rows: AiUnitResult[] = ctx.units.map((u) => {
    const caps = UNIT_CAPS[u.id] ?? [];
    return {
      id: u.id,
      nom: u.nom,
      ville: u.ville,
      etaMin: etaMinutes(u.ll, target.ll),
      caps: caps.map((c) => CAP_LABELS[c]),
      dispo: DISPO_LABEL[u.dispo] ?? u.dispo,
      within: true,
    };
  });

  // Filtre capacité (par aptitude d'unité OU par équipement détenu)
  if (cap || equipUnitIds) {
    rows = rows.filter((r) => {
      const capOk = cap ? (UNIT_CAPS[r.id] ?? []).includes(cap) : false;
      const equipOk = equipUnitIds ? equipUnitIds.has(r.id) : false;
      return capOk || equipOk;
    });
  }

  rows.sort((a, b) => a.etaMin - b.etaMin);
  if (threshold != null) rows.forEach((r) => (r.within = r.etaMin <= threshold));

  const capLabel = cap ? CAP_LABELS[cap] : equipCat ? `équipement « ${equipCat} »` : null;
  const layer1 = [
    `unités pour ${INCIDENT_PLACE[target.id] ?? target.region} (${target.id})`,
    capLabel ? `capacité = ${capLabel}` : null,
    threshold != null ? `ETA ≤ ${threshold} min` : null,
  ].filter(Boolean).join(", ");

  const within = rows.filter((r) => r.within);
  let text: string;
  if (rows.length === 0) {
    text = `Aucune unité ne correspond à la capacité demandée${capLabel ? ` (${capLabel})` : ""}.`;
  } else if (threshold != null && within.length === 0) {
    const nearest = rows[0];
    text = `Aucune unité ne peut atteindre ${INCIDENT_PLACE[target.id] ?? target.region} en moins de ${threshold} min. La plus proche est ${nearest.nom} (${nearest.ville}), ETA ~${nearest.etaMin} min.`;
  } else {
    const list = (threshold != null ? within : rows.slice(0, 4))
      .map((r) => `${r.nom} (${r.ville}) — ETA ~${r.etaMin} min`)
      .join(" ; ");
    text = `${threshold != null ? within.length : Math.min(4, rows.length)} unité(s) correspondent : ${list}.`;
  }

  return { intent: "reachability", layer1, text, units: rows };
}

function sitrep(_q: string, ctx: AiContext): AiAnswer {
  const b = ctx.orsec;
  const active = ctx.incidents.filter((i) => i.st !== "closed").length;
  const inTransit = ctx.movements.filter((m) => m.progress < 100).length;
  const delayed = ctx.movements.filter((m) => m.delayMin > 0).length;
  const text = [
    "SITREP — Opération SALAMA (brouillon)",
    `1. SITUATION : ${active} opérations actives ; séisme M5.9 — Al Haouz, niveau ORSEC ${b.planLevel} (renforcé), activé ${b.activatedAt}.`,
    `2. BILAN HUMAIN : ${b.casualties.dead} décès, ${b.casualties.injured} blessés, ${b.casualties.missing} disparus, ${b.casualties.rescued} secourus.`,
    `3. MOYENS ENGAGÉS : ${b.units.engaged} unités, ${b.personnel.engaged} personnels, ${b.vehicles.engaged} véhicules.`,
    `4. SANTÉ & ABRIS : charge hospitalière ${b.hospitalLoad} %, ${b.sheltersActive} abris actifs.`,
    `5. MOUVEMENTS : ${inTransit} convois en cours, dont ${delayed} en retard.`,
    "6. PROCHAINES ÉTAPES : maintien du pont aérien Agadir–Amizmiz ; réouverture RP2010 visée 14h00 ; consolidation des HMC.",
  ].join("\n");
  return { intent: "sitrep", layer1: "SITREP auto-rempli depuis l'état ORSEC + incidents + mouvements", text };
}

function anomaly(_q: string, ctx: AiContext): AiAnswer {
  const delayed = ctx.movements.filter((m) => m.delayMin > 0).sort((a, b) => b.delayMin - a.delayMin);
  const text = delayed.length
    ? [`${delayed.length} mouvement(s) en écart sur les itinéraires planifiés :`,
       ...delayed.map((m) => `• ${m.id} ${m.mission} — retard +${m.delayMin} min (${m.origin} → ${m.destination}), progression ${m.progress} %.`)].join("\n")
    : "Aucune anomalie : tous les mouvements sont conformes à l'itinéraire planifié.";
  return { intent: "anomaly", layer1: "analyse des écarts sur les mouvements de transport", text };
}

/** Traduit une requête NL → requête Couche 1 déterministe + réponse par gabarit. */
export function interpret(q: string, ctx: AiContext): AiAnswer {
  const nq = norm(q);
  if (/sitrep|rapport de situation|compte[- ]rendu|brouillon/.test(nq)) return sitrep(q, ctx);
  if (/anomal|retard|ecart|deviation|alerte.*mouvement|mouvement.*retard/.test(nq)) return anomaly(q, ctx);
  if (/unite|equipe|atteindre|rejoindre|mobilis|envoyer|dispatch|proche|capable|peut|peuvent/.test(nq)) return reachability(q, ctx);
  return {
    intent: "unknown",
    layer1: "aucune intention reconnue",
    text: "Je peux : (1) chercher des unités mobilisables pour une zone (avec capacité et délai), (2) générer un brouillon de SITREP, (3) résumer les anomalies des mouvements. Reformulez selon l'un de ces cas.",
  };
}

/** Message utilisateur transmis au LLM : requête + résultat Couche 1 à reformuler. */
export function buildLlmUserMessage(query: string, answer: AiAnswer): string {
  const data = {
    requete_couche1: answer.layer1,
    resultat_deterministe: answer.text,
    unites: answer.units?.map((u) => ({ unite: u.nom, ville: u.ville, eta_min: u.etaMin, dans_delai: u.within, capacites: u.caps })),
  };
  return [
    `Question de l'opérateur : « ${query} »`,
    "Données fournies par le moteur Couche 1 (à reformuler, sans rien ajouter) :",
    JSON.stringify(data, null, 2),
    "Rédige une réponse française claire et opérationnelle à partir de ces seules données.",
  ].join("\n");
}
