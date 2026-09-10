// ============================================================================
// ARGOS — postes d'opération sur la carte : natures, couleurs, libellés, dépôt
// ============================================================================

import { distKm } from "@/lib/geo";
import type { Dict } from "@/lib/i18n/translations";
import type { Shelter } from "@/lib/data/modules";
import type { Incident, IncidentPost, PostKind, Unit } from "@/lib/types";

export const POST_KINDS: readonly PostKind[] = ["opcom", "tacom", "bluecell", "greencell", "orangecell", "shelter", "equipment"];

/** Type MIME du glisser-déposer d'un chip de la boîte à outils vers la carte. */
export const POST_DRAG_MIME = "application/x-argos-post";

export function isPostKind(v: unknown): v is PostKind {
  return typeof v === "string" && (POST_KINDS as readonly string[]).includes(v);
}

/** Couleur de chaque nature — la palette des cellules est celle de leur nom. */
export const POST_FILL: Record<PostKind, string> = {
  opcom: "#C9A84C",
  tacom: "#8B6B2A",
  bluecell: "#3B82F6",
  greencell: "#22C55E",
  orangecell: "#F97316",
  shelter: "#14B8A6",
  equipment: "#6B7280",
};

/** Le code court écrit sur le marqueur. */
export function postCode(kind: PostKind, d: Dict): string {
  return {
    opcom: d.post_code_opcom,
    tacom: d.post_code_tacom,
    bluecell: d.post_code_bluecell,
    greencell: d.post_code_greencell,
    orangecell: d.post_code_orangecell,
    shelter: d.post_code_shelter,
    equipment: d.post_code_equipment,
  }[kind];
}

/** Ce que le marqueur dit sous son code : le libellé donné, sinon l'entité représentée. */
export function postCaption(post: Pick<IncidentPost, "kind" | "label" | "entityId">, ctx: { shelters: readonly Shelter[]; units: readonly Unit[] }): string | undefined {
  if (post.label) return post.label;
  if (post.kind === "shelter") return ctx.shelters.find((s) => s.id === post.entityId)?.nom;
  if (post.kind === "equipment") return ctx.units.find((u) => u.id === post.entityId)?.nom;
  return undefined;
}

/** L'opération active la plus proche d'un point — celle qu'on propose au dépôt. */
export function nearestIncident(ll: [number, number], incidents: readonly Incident[]): Incident | undefined {
  let best: Incident | undefined;
  let bestKm = Infinity;
  for (const i of incidents) {
    if (i.archived) continue;
    const km = distKm(i.ll, ll);
    if (km < bestKm) {
      bestKm = km;
      best = i;
    }
  }
  return best;
}
