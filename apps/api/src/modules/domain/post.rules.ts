import type { PostKind } from "@/modules/domain/domain.types";

// ============================================================================
// Règles d'un poste posé sur la carte — module pur, testé seul.
//
// Un PC ou une cellule se pose n'importe où : le poste EST le lieu. Un abri ou
// un parc, eux, représentent une entité qui existe déjà ailleurs dans la
// plateforme ; sans elle, le poste ne représenterait rien.
// ============================================================================

/** Les natures qui représentent une entité existante, et l'entité qu'elles exigent. */
export const ENTITY_POST_KINDS: Partial<Record<PostKind, "shelter" | "unit">> = {
  shelter: "shelter",
  equipment: "unit",
};

export interface PostInput {
  kind: PostKind;
  entityId?: string;
}

export interface EntityLookup {
  shelter: (id: string) => boolean;
  unit: (id: string) => boolean;
}

export type PostCheck = { ok: true; entityId: string | undefined } | { ok: false; reason: string };

/** Valide la nature et l'entité d'un poste ; rend l'entité à garder (aucune pour un PC ou une cellule). */
export function checkPost(input: PostInput, exists: EntityLookup): PostCheck {
  const need = ENTITY_POST_KINDS[input.kind];
  if (!need) return { ok: true, entityId: undefined };
  const id = input.entityId?.trim();
  if (!id) return { ok: false, reason: need === "shelter" ? "Un poste d'abri désigne un abri existant." : "Un poste de parc désigne l'unité détentrice du parc." };
  if (!exists[need](id)) return { ok: false, reason: need === "shelter" ? `Abri inconnu : ${id}` : `Unité inconnue : ${id}` };
  return { ok: true, entityId: id };
}
