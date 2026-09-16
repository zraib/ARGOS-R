// ============================================================================
// lib/ai/draft/proposal.ts — choix d'un titre et d'une description
//
// Le `salt` rend la proposition reproductible : même saisie, même salt, même
// texte — la régénération change le salt, pas la règle.
//
// RÈGLE 2026-09 : LES CHAMPS STRUCTURÉS PRIMENT SUR LES KEYWORDS.
//   - dead / injured / missing → bilan humain
//   - infected / contaminated → épidémie / NRBC
//   - nrbcFamily / nrbcSubstance → détail NRBC
//   - unitsCount / hospitalsCount → moyens engagés
//   - ville / province / adresse → localisation (via lieuOf)
//
// Les keywords sont DEVENUS OPTIONNELS : si vide, le fallback complet utilise
// les champs structurés pour construire titre ET description sans hallucination.
// ============================================================================

import { buildSemanticDescription , buildSemanticTitle} from "./semantic";
import { inject, keywordTokens, labelOf, lieuOf, rngSeed} from "./lexicon";
import { DescPair } from "./types";
import { DESC_POOL , DESC_POOL_GEN, TITLE_POOL, TITLE_POOL_GEN} from "./pools";
import type { DescriptionProposalInput } from "./types";
import { tpl as tplStr } from "@/lib/i18n/format";

export interface DraftLabels {
  bal_deaths: string;
  bal_injured: string;
  bal_missing: string;
  bal_infected: string;
  bal_contaminated: string;
  moy_unit_1: string;
  moy_unit_pl_tpl: string;
  moy_hospital_1: string;
  moy_hospital_pl_tpl: string;
  nrbc_family_prefix: string;
  nrbc_substance_prefix: string;
  nrbc_spill_small: string;
  nrbc_spill_large: string;
  nrbc_release_instant: string;
  nrbc_release_continuous: string;
  lieu_det_tpl: string;
  tk_tpl_1: string;
  tk_tpl_2: string;
  tk_tpl_3: string;
  tk_tpl_4: string;
  dp_p1_v1: string;
  dp_p1_v2: string;
  dp_p1_v3: string;
  dp_p1_v4: string;
  dp_p2_m1: string;
  dp_p2_m2: string;
  dp_p2_m3: string;
  dp_p2_s1: string;
  dp_p2_s2: string;
  dp_p2_s3: string;
  dp_p2_n1: string;
  dp_p2_n2: string;
  dp_p2_n3: string;
  sem_bilan_tpl: string;
  r0_desc_prefix_tpl: string;
  r0_desc_sentence_prep: string;
  r0_desc_confirm_tpl: string;
}

export const DEFAULT_DRAFT_LABELS: DraftLabels = {
  bal_deaths: "décès",
  bal_injured: "blessés",
  bal_missing: "disparus",
  bal_infected: "infectés",
  bal_contaminated: "contaminés",
  moy_unit_1: "1 unité engagée",
  moy_unit_pl_tpl: "{n} unités engagées",
  moy_hospital_1: "1 hôpital mobilisé",
  moy_hospital_pl_tpl: "{n} hôpitaux mobilisés",
  nrbc_family_prefix: "famille {famille}",
  nrbc_substance_prefix: "substance {substance}",
  nrbc_spill_small: "déversement limité",
  nrbc_spill_large: "déversement important",
  nrbc_release_instant: "émission instantanée",
  nrbc_release_continuous: "émission continue",
  lieu_det_tpl: " au niveau de {lieu}",
  tk_tpl_1: "{labelC} à {lieu}",
  tk_tpl_2: "{labelC} — {lieu}",
  tk_tpl_3: "Signalement : {labelC} {lieu}",
  tk_tpl_4: "Incident · {labelC} sur {lieu}",
  dp_p1_v1: "Un {labelMin} a été signalé{lieuDet}.",
  dp_p1_v2: "{labelC} rapporté{lieuDet}.",
  dp_p1_v3: "Un événement de type {labelMin} est mentionné{lieuDet}.",
  dp_p1_v4: "Cas de {labelMin} signalé{lieuDet}.",
  dp_p2_m1: "Bilan rapporté : {first}. Éléments complémentaires : {rest}.",
  dp_p2_m2: "Constats : {first} — {rest}.",
  dp_p2_m3: "Éléments recueillis : {first}. Données opérationnelles : {rest}.",
  dp_p2_s1: "Éléments rapportés : {only}.",
  dp_p2_s2: "Données recueillies : {only}.",
  dp_p2_s3: "Constats : {only}.",
  dp_p2_n1: "Données complémentaires à consolider ; bilan à compléter.",
  dp_p2_n2: "Signalement enregistré ; données opérationnelles à enrichir.",
  dp_p2_n3: "Informations en cours de consolidation — bilan provisoire.",
  sem_bilan_tpl: "Bilan rapporté : {content}.",
  r0_desc_prefix_tpl: "Au niveau de {topo} : ",
  r0_desc_sentence_prep: "à {topo}",
  r0_desc_confirm_tpl: " Localisation confirmée : {topo}.",
};

export function mergeDraftLabels(partial?: Partial<DraftLabels>): DraftLabels {
  if (!partial) return DEFAULT_DRAFT_LABELS;
  return { ...DEFAULT_DRAFT_LABELS, ...partial };
}

/* Construit un extrait bilan humain à partir des champs structurés (phrase nominale). */
function bilanFromStructured(input: DescriptionProposalInput, L: DraftLabels): string {
  const items: { label: string; raw: string | undefined }[] = [
    { label: L.bal_deaths, raw: input.dead },
    { label: L.bal_injured, raw: input.injured },
    { label: L.bal_missing, raw: input.missing },
    { label: L.bal_infected, raw: input.infected },
    { label: L.bal_contaminated, raw: input.contaminated },
  ];
  const n = (x: string | undefined) => (x ?? "").toString().trim();
  const filled = items
    .filter((i) => n(i.raw).length > 0 && !/^0+$/.test(n(i.raw)))
    .map((i) => {
      const val = n(i.raw);
      const isNum = /^[0-9]+$/.test(val);
      return isNum ? `${val} ${i.label}` : `${i.label} : ${val}`;
    });
  if (filled.length === 0) return "";
  if (filled.length === 1) return filled[0];
  return filled.slice(0, -1).join(", ") + " et " + filled[filled.length - 1];
}

/* Construit un extrait moyens si unitsCount / hospitalsCount > 0. */
function moyensFromStructured(input: DescriptionProposalInput, L: DraftLabels): string {
  const parts: string[] = [];
  const u = input.unitsCount ?? 0;
  const h = input.hospitalsCount ?? 0;
  if (u === 1) parts.push(L.moy_unit_1);
  if (u > 1) parts.push(tplStr(L.moy_unit_pl_tpl, { n: String(u) }));
  if (h === 1) parts.push(L.moy_hospital_1);
  if (h > 1) parts.push(tplStr(L.moy_hospital_pl_tpl, { n: String(h) }));
  return parts.join(", ");
}

/* Construit un extrait NRBC si famille/substance. */
function nrbcFromStructured(input: DescriptionProposalInput, L: DraftLabels): string {
  if (input.type !== "nrbc") return "";
  const parts: string[] = [];
  if (input.nrbcFamily) parts.push(tplStr(L.nrbc_family_prefix, { famille: String(input.nrbcFamily).toUpperCase() }));
  if (input.nrbcSubstance) parts.push(tplStr(L.nrbc_substance_prefix, { substance: input.nrbcSubstance }));
  if (input.nrbcSpill) parts.push(input.nrbcSpill === "small" ? L.nrbc_spill_small : L.nrbc_spill_large);
  if (input.nrbcRelease) parts.push(input.nrbcRelease === "instant" ? L.nrbc_release_instant : L.nrbc_release_continuous);
  return parts.join(" · ");
}

/** Pick TITLE — 100% depuis champs structurés ; keywords optionnels (amélioration seulement). */
export function pickTitle(input: DescriptionProposalInput, salt: number, labels?: Partial<DraftLabels>): string {
  const L = mergeDraftLabels(labels);
  if (!input.type) return "";
  const label = labelOf(input);
  const lieu = lieuOf(input);
  const tokens = keywordTokens(input.keywords);
  const titles = TITLE_POOL[input.type] ?? TITLE_POOL_GEN;
  const titleTpl = titles[rngSeed(salt * 131 + titles.length * 17 + 7, titles.length)] ?? TITLE_POOL_GEN[0];
  const injected = inject(titleTpl as string, label, lieu).replace(/\s+/g, " ").trim();
  if (tokens.length === 0) {
    const labelC = label.charAt(0).toUpperCase() + label.slice(1);
    if (!lieu) return labelC;
    const poolSimple = [
      tplStr(L.tk_tpl_1, { labelC, lieu }),
      tplStr(L.tk_tpl_2, { labelC, lieu }),
      tplStr(L.tk_tpl_3, { labelC, lieu }),
      tplStr(L.tk_tpl_4, { labelC, lieu }),
    ];
    return poolSimple[((salt % poolSimple.length) + poolSimple.length) % poolSimple.length];
  }
  return buildSemanticTitle(tokens, input.type, injected, lieu, input.incidentTypes, salt);
}

/** Pick DESCRIPTION — construit depuis CHAMPS STRUCTURÉS si keywords absents. */
export function pickDesc(input: DescriptionProposalInput, salt: number, labels?: Partial<DraftLabels>): string {
  const L = mergeDraftLabels(labels);
  if (!input.type) return "";
  const label = labelOf(input);
  const lieu = lieuOf(input);
  const lieuDet = lieu ? tplStr(L.lieu_det_tpl, { lieu }) : "";
  const tokens = keywordTokens(input.keywords);
  const descs = DESC_POOL[input.type] ?? DESC_POOL_GEN;
  const dTpl: DescPair = (descs[rngSeed(salt * 271 + descs.length * 53 + 11, descs.length)] as DescPair) ?? DESC_POOL_GEN[0];
  if (tokens.length === 0) {
    const labelMin = label.charAt(0).toLowerCase() + label.slice(1);
    const labelC = label.charAt(0).toUpperCase() + label.slice(1);
    const poolBilan = <T extends string>(arr: T[]) => arr[((salt % arr.length) + arr.length) % arr.length] as string;

    const p1Variants: string[] = [
      tplStr(L.dp_p1_v1, { labelMin, lieuDet }),
      tplStr(L.dp_p1_v2, { labelC, lieuDet }),
      tplStr(L.dp_p1_v3, { labelMin, lieuDet }),
      tplStr(L.dp_p1_v4, { labelMin, lieuDet }),
    ];
    const p1 = poolBilan(p1Variants);

    const bilan = bilanFromStructured(input, L);
    const moyens = moyensFromStructured(input, L);
    const nrbc = nrbcFromStructured(input, L);
    const extras = [bilan, moyens, nrbc].filter(Boolean);
    let p2: string;
    if (extras.length >= 2) {
      const first = extras[0];
      const rest = extras.slice(1).join(" — ");
      p2 = poolBilan([
        tplStr(L.dp_p2_m1, { first, rest }),
        tplStr(L.dp_p2_m2, { first, rest }),
        tplStr(L.dp_p2_m3, { first, rest }),
      ]);
    } else if (extras.length === 1) {
      const only = extras[0];
      p2 = poolBilan([
        tplStr(L.dp_p2_s1, { only }),
        tplStr(L.dp_p2_s2, { only }),
        tplStr(L.dp_p2_s3, { only }),
      ]);
    } else {
      p2 = poolBilan([L.dp_p2_n1, L.dp_p2_n2, L.dp_p2_n3]);
    }
    return `${p1}\n${p2}`;
  }

  const fromSem = buildSemanticDescription(tokens, input.type, dTpl.l1, dTpl.l2, lieuDet, input.incidentTypes, salt);
  const structExtras = [bilanFromStructured(input, L), moyensFromStructured(input, L), nrbcFromStructured(input, L)].filter(Boolean);
  if (structExtras.length === 0) return fromSem;
  const bil = tplStr(L.sem_bilan_tpl, { content: structExtras.join(" — ") });
  const headerKey = tplStr(L.sem_bilan_tpl, { content: "X" }).split("X")[0] ?? "";
  const hasBilanHeader = headerKey && fromSem.replace(/\s+/g, " ").toLowerCase().includes(headerKey.replace(/\s+/g, " ").toLowerCase().slice(0, 8));
  if (!hasBilanHeader) return `${fromSem}\n${bil}`;
  return fromSem;
}

/* ====================== HOOK PRINCIPAL : 2 COMPTEURS / 2 SETTERS SÉPARÉS ====================== */
