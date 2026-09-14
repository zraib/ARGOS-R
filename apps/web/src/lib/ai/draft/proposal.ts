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

/* Construit un extrait bilan humain à partir des champs structurés (phrase nominale). */
function bilanFromStructured(input: DescriptionProposalInput): string {
  const items: { label: string; raw: string | undefined }[] = [
    { label: "décès", raw: input.dead },
    { label: "blessés", raw: input.injured },
    { label: "disparus", raw: input.missing },
    { label: "infectés", raw: input.infected },
    { label: "contaminés", raw: input.contaminated },
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
function moyensFromStructured(input: DescriptionProposalInput): string {
  const parts: string[] = [];
  const u = input.unitsCount ?? 0;
  const h = input.hospitalsCount ?? 0;
  if (u === 1) parts.push("1 unité engagée");
  if (u > 1) parts.push(`${u} unités engagées`);
  if (h === 1) parts.push("1 hôpital mobilisé");
  if (h > 1) parts.push(`${h} hôpitaux mobilisés`);
  return parts.join(", ");
}

/* Construit un extrait NRBC si famille/substance. */
function nrbcFromStructured(input: DescriptionProposalInput): string {
  if (input.type !== "nrbc") return "";
  const parts: string[] = [];
  if (input.nrbcFamily) parts.push(`famille ${String(input.nrbcFamily).toUpperCase()}`);
  if (input.nrbcSubstance) parts.push(`substance ${input.nrbcSubstance}`);
  if (input.nrbcSpill) parts.push(input.nrbcSpill === "small" ? "déversement limité" : "déversement important");
  if (input.nrbcRelease) parts.push(input.nrbcRelease === "instant" ? "émission instantanée" : "émission continue");
  return parts.join(" · ");
}

/** Pick TITLE — 100% depuis champs structurés ; keywords optionnels (amélioration seulement). */
export function pickTitle(input: DescriptionProposalInput, salt: number): string {
  if (!input.type) return "";
  const label = labelOf(input);
  const lieu = lieuOf(input);
  const tokens = keywordTokens(input.keywords);
  const titles = TITLE_POOL[input.type] ?? TITLE_POOL_GEN;
  const tpl = titles[rngSeed(salt * 131 + titles.length * 17 + 7, titles.length)] ?? TITLE_POOL_GEN[0];
  const injected = inject(tpl as string, label, lieu).replace(/\s+/g, " ").trim();
  if (tokens.length === 0) {
    // === CAS ZÉRO KEYWORDS : TITRE FORMATÉ {TypeLabel} à {Lieu} ===
    const labelC = label.charAt(0).toUpperCase() + label.slice(1);
    if (!lieu) return labelC;
    const poolSimple = [
      `${labelC} à ${lieu}`,
      `${labelC} — ${lieu}`,
      `Signalement : ${labelC} ${lieu}`,
      `Incident · ${labelC} sur ${lieu}`,
    ];
    return poolSimple[((salt % poolSimple.length) + poolSimple.length) % poolSimple.length];
  }
  return buildSemanticTitle(tokens, input.type, injected, lieu, input.incidentTypes, salt);
}

/** Pick DESCRIPTION — construit depuis CHAMPS STRUCTURÉS si keywords absents. */
export function pickDesc(input: DescriptionProposalInput, salt: number): string {
  if (!input.type) return "";
  const label = labelOf(input);
  const lieu = lieuOf(input);
  const lieuDet = lieu ? ` au niveau de ${lieu}` : "";
  const tokens = keywordTokens(input.keywords);
  const descs = DESC_POOL[input.type] ?? DESC_POOL_GEN;
  const dTpl: DescPair = (descs[rngSeed(salt * 271 + descs.length * 53 + 11, descs.length)] as DescPair) ?? DESC_POOL_GEN[0];
  if (tokens.length === 0) {
    // ========== CAS ZÉRO KEYWORDS : 100% CHAMPS STRUCTURÉS ==========
    const labelMin = label.charAt(0).toLowerCase() + label.slice(1);
    const labelC = label.charAt(0).toUpperCase() + label.slice(1);
    const poolBilan = <T extends string>(arr: T[]) => arr[((salt % arr.length) + arr.length) % arr.length] as string;

    // Phrase 1 : nature incident + localisation
    const p1Variants: string[] = [
      `Un ${labelMin} a été signalé${lieuDet}.`,
      `${labelC} rapporté${lieuDet ?? ""}.`,
      `Un événement de type ${labelMin} est mentionné${lieuDet}.`,
      `Cas de ${labelMin} signalé${lieuDet}.`,
    ];
    const p1 = poolBilan(p1Variants);

    // Phrase 2 : bilan humain structuré OU état
    const bilan = bilanFromStructured(input);
    const moyens = moyensFromStructured(input);
    const nrbc = nrbcFromStructured(input);
    const extras = [bilan, moyens, nrbc].filter(Boolean);
    let p2: string;
    if (extras.length >= 2) {
      const first = extras[0];
      const rest = extras.slice(1).join(" — ");
      p2 = poolBilan([
        `Bilan rapporté : ${first}. Éléments complémentaires : ${rest}.`,
        `Constats : ${first} — ${rest}.`,
        `Éléments recueillis : ${first}. Données opérationnelles : ${rest}.`,
      ]);
    } else if (extras.length === 1) {
      const only = extras[0];
      p2 = poolBilan([
        `Éléments rapportés : ${only}.`,
        `Données recueillies : ${only}.`,
        `Constats : ${only}.`,
      ]);
    } else {
      p2 = poolBilan([
        "Données complémentaires à consolider ; bilan à compléter.",
        "Signalement enregistré ; données opérationnelles à enrichir.",
        "Informations en cours de consolidation — bilan provisoire.",
      ]);
    }
    return `${p1}\n${p2}`;
  }

  // Cas avec keywords : on garde buildSemanticDescription, EN AJOUTANT le bilan
  // structuré en PHRASE 3 s'il existe (pour ne pas perdre l'info si keywords
  // n'ont pas été renseignés à la main avec morts/blessés).
  const fromSem = buildSemanticDescription(tokens, input.type, dTpl.l1, dTpl.l2, lieuDet, input.incidentTypes, salt);
  const structExtras = [bilanFromStructured(input), moyensFromStructured(input), nrbcFromStructured(input)].filter(Boolean);
  if (structExtras.length === 0) return fromSem;
  const bil = `Bilan rapporté : ${structExtras.join(" — ")}.`;
  if (!fromSem.includes("Bilan rapporté")) return `${fromSem}\n${bil}`;
  return fromSem;
}

/* ====================== HOOK PRINCIPAL : 2 COMPTEURS / 2 SETTERS SÉPARÉS ====================== */
