import type { PostKind } from "@/modules/domain/domain.types";

// ============================================================================
// Règles d'un poste posé sur la carte — module pur, testé seul.
//
// Un poste désigne une INSTANCE : un PC ou une cellule, c'est LE compte qui
// le tient (il y a plusieurs OPCOM, plusieurs TACOM, plusieurs cellules) ; un
// abri ou un parc, c'est l'entité qui existe déjà ailleurs dans la plateforme.
// Une instance ne se pose qu'une fois : la poser ailleurs, c'est d'abord
// retirer le poste existant — jamais un doublon silencieux.
// ============================================================================

/** Les natures tenues par un compte déployable. */
export const ROLE_POST_KINDS: readonly PostKind[] = ["opcom", "tacom", "bluecell", "greencell", "orangecell"];

/** Les natures qui représentent une entité existante, et l'entité qu'elles exigent. */
export const ENTITY_POST_KINDS: Partial<Record<PostKind, "shelter" | "unit">> = {
  shelter: "shelter",
  equipment: "unit",
};

export interface PostInput {
  kind: PostKind;
  entityId?: string;
  matricule?: string;
}

export interface PostLookup {
  shelter: (id: string) => boolean;
  unit: (id: string) => boolean;
  /** Le compte existe ET tient ce rôle. */
  account: (matricule: string, role: PostKind) => boolean;
  /** L'opération où ce compte est déjà posé, s'il l'est. */
  placedAccount: (matricule: string) => string | undefined;
  /** L'opération où cette entité est déjà posée, si elle l'est. */
  placedEntity: (kind: PostKind, entityId: string) => string | undefined;
}

export type PostCheck =
  | { ok: true; entityId?: string; matricule?: string }
  /** `conflict` : l'instance est déjà posée — un 409, pas un 400. */
  | { ok: false; reason: string; conflict?: boolean };

const KIND_LABEL: Record<PostKind, string> = {
  opcom: "OPCOM",
  tacom: "TACOM",
  bluecell: "cellule bleue",
  greencell: "cellule verte",
  orangecell: "cellule orange",
  shelter: "abri",
  equipment: "parc",
};

/** Valide la nature et l'instance d'un poste ; rend les identifiants normalisés à garder. */
export function checkPost(input: PostInput, lookup: PostLookup): PostCheck {
  const need = ENTITY_POST_KINDS[input.kind];
  if (need) {
    const id = input.entityId?.trim();
    if (!id) return { ok: false, reason: need === "shelter" ? "Un poste d'abri désigne un abri existant." : "Un poste de parc désigne l'unité détentrice du parc." };
    if (!lookup[need](id)) return { ok: false, reason: need === "shelter" ? `Abri inconnu : ${id}` : `Unité inconnue : ${id}` };
    const deja = lookup.placedEntity(input.kind, id);
    if (deja) return { ok: false, conflict: true, reason: `Cet ${need === "shelter" ? "abri" : "parc"} est déjà posé sur ${deja} : retirez ce poste d'abord.` };
    return { ok: true, entityId: id };
  }
  const m = input.matricule?.trim();
  if (!m) return { ok: false, reason: `Un poste ${KIND_LABEL[input.kind]} désigne le compte qui le tient : choisissez-le dans la liste.` };
  if (!lookup.account(m, input.kind)) return { ok: false, reason: `${m} n'est pas un compte ${KIND_LABEL[input.kind]}.` };
  const deja = lookup.placedAccount(m);
  if (deja) return { ok: false, conflict: true, reason: `${m} est déjà posé sur ${deja} : retirez ce poste d'abord.` };
  return { ok: true, matricule: m };
}
