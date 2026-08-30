// ============================================================================
// ARGOS — typologie des établissements de santé
// Source unique de vérité pour la différenciation militaire / civil sur toute
// la plateforme : symboles cartographiques, filtres Hospinet, légendes.
// Six catégories, lisibles d'un coup d'œil grâce à trois axes visuels :
//   • FORME   — hexagone = réseau militaire, cercle = réseau civil ;
//   • TRAIT   — plein = structure permanente, pointillé = hôpital de campagne ;
//   • COULEUR — or (militaire), violet (CHU), bleu (CHR), rouge (CHP/local).
// ============================================================================

import type { FieldHospital, Hospital, HospitalKind } from "@/lib/types";

/** Descripteur visuel et textuel d'une catégorie d'établissement. */
export interface HospitalKindDef {
  kind: HospitalKind;
  /** Libellé court (légendes, puces de filtre). */
  label: string;
  /** Libellé long (info-bulles, panneau de sélection). */
  long: string;
  /** Couleur d'accentuation (bordure du marqueur, pastille de filtre). */
  color: string;
  /** Réseau de rattachement. */
  reseau: "militaire" | "civil";
  /** Structure déployée temporairement (hôpital de campagne). */
  campagne: boolean;
}

export const HOSPITAL_KINDS: HospitalKindDef[] = [
  { kind: "mil", label: "Militaire", long: "Hôpital militaire", color: "#C9A84C", reseau: "militaire", campagne: false },
  { kind: "mil_field", label: "Campagne militaire", long: "Hôpital de campagne militaire", color: "#C9A84C", reseau: "militaire", campagne: true },
  { kind: "civ_univ", label: "Universitaire (CHU)", long: "Hôpital universitaire civil", color: "#8B5CF6", reseau: "civil", campagne: false },
  { kind: "civ_reg", label: "Régional (CHR)", long: "Hôpital régional civil", color: "#3B82F6", reseau: "civil", campagne: false },
  { kind: "civ", label: "Civil (CHP)", long: "Hôpital civil", color: "#EF4444", reseau: "civil", campagne: false },
  { kind: "civ_field", label: "Campagne civil", long: "Hôpital de campagne civil", color: "#EF4444", reseau: "civil", campagne: true },
];

const BY_KIND = new Map(HOSPITAL_KINDS.map((d) => [d.kind, d]));

/** Descripteur d'une catégorie (retombe sur « civil » si inconnue). */
export function kindDef(k: HospitalKind | undefined): HospitalKindDef {
  return (k && BY_KIND.get(k)) || BY_KIND.get("civ")!;
}

/**
 * Catégorie d'un établissement fixe. Les enregistrements créés avant
 * l'introduction du champ n'ont pas de `kind` : on le déduit alors du nom
 * (« Militaire » → réseau militaire), sinon réseau civil.
 */
export function hospKind(h: Pick<Hospital, "kind" | "nom">): HospitalKind {
  if (h.kind) return h.kind;
  return /militaire/i.test(h.nom) ? "mil" : "civ";
}

/** Catégorie d'un hôpital de campagne (militaire par défaut : « HMC »). */
export function fieldKind(f: Pick<FieldHospital, "kind" | "nom">): HospitalKind {
  return f.kind ?? (/^HCC/i.test(f.nom) ? "civ_field" : "mil_field");
}

/**
 * Identifiant d'un établissement, quel que soit son réseau.
 *
 * Les hôpitaux de campagne portent `hid` là où les établissements fixes
 * portent `id` : sans cet accesseur, tout code manipulant l'union des deux
 * types compile mal ou lit `undefined` sur les structures de campagne.
 */
export function hospId(h: Hospital | FieldHospital): string {
  return "id" in h ? h.id : h.hid;
}
