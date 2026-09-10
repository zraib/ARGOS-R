// ============================================================================
// ARGOS — postes d'opération sur la carte : natures, couleurs, libellés, dépôt
// ============================================================================

import { distKm } from "@/lib/geo";
import type { Dict } from "@/lib/i18n/translations";
import type { Shelter } from "@/lib/data/modules";
import type { DeployableAccount, Incident, IncidentPost, PostKind, Responsible, Unit } from "@/lib/types";

export const POST_KINDS: readonly PostKind[] = ["opcom", "tacom", "bluecell", "greencell", "orangecell", "shelter", "equipment"];

/** Les natures tenues par un compte déployable ; les deux autres représentent une entité. */
export const ROLE_POST_KINDS: readonly PostKind[] = ["opcom", "tacom", "bluecell", "greencell", "orangecell"];

/** Type MIME du glisser-déposer d'un chip de la boîte à outils vers la carte. */
export const POST_DRAG_MIME = "application/x-argos-post";

export function isPostKind(v: unknown): v is PostKind {
  return typeof v === "string" && (POST_KINDS as readonly string[]).includes(v);
}

/** Ce que l'opérateur a choisi de poser : une instance, jamais une nature seule. */
export interface PostPick {
  kind: PostKind;
  /** Ce que le chip affiche — nom du compte, de l'abri, du parc. */
  title: string;
  matricule?: string;
  entityId?: string;
}

/** Relit un choix transporté par le glisser-déposer ; `null` si ce n'en est pas un. */
export function parsePostPick(raw: string): PostPick | null {
  try {
    const v = JSON.parse(raw) as Partial<PostPick> | null;
    if (!v || !isPostKind(v.kind) || typeof v.title !== "string") return null;
    if (ROLE_POST_KINDS.includes(v.kind) ? typeof v.matricule !== "string" : typeof v.entityId !== "string") return null;
    return { kind: v.kind, title: v.title, matricule: v.matricule, entityId: v.entityId };
  } catch {
    return null;
  }
}

/** Un chip de la boîte à outils : le choix, et ce qui en fait un poste disponible ou non. */
export interface PickItem {
  pick: PostPick;
  /** Sous-titre : grade d'un compte, ville d'un abri ou d'une unité. */
  sub?: string;
  /** Opération sur laquelle le compte est déjà déployé (il en sera retiré). */
  deployedOn?: string;
  /** Opération sur laquelle cette instance est déjà posée : le chip est inactif. */
  placedOn?: string;
}

export interface PickGroup {
  kind: PostKind;
  items: PickItem[];
}

/**
 * Les instances posables, par nature : les comptes tenant chaque rôle (un
 * compte à deux rôles apparaît sous les deux), puis les abris et les parcs.
 * Dans chaque groupe : les disponibles d'abord, puis les déployés ailleurs,
 * puis les déjà posés — l'opérateur voit tout, mais ce qu'il peut faire vient
 * en premier.
 */
export function pickGroups(
  ctx: { accounts: readonly DeployableAccount[]; shelters: readonly Shelter[]; units: readonly Unit[]; posts: readonly IncidentPost[] },
  parkLabel: string,
): PickGroup[] {
  const placedAccount = (m: string) => ctx.posts.find((p) => p.matricule?.toLowerCase() === m.toLowerCase())?.incidentId;
  const placedEntity = (kind: PostKind, id: string) => ctx.posts.find((p) => p.kind === kind && p.entityId === id)?.incidentId;
  const rank = (i: PickItem) => (i.placedOn ? 2 : i.deployedOn ? 1 : 0);
  const sorted = (items: PickItem[]) => items.sort((a, b) => rank(a) - rank(b) || a.pick.title.localeCompare(b.pick.title, "fr"));
  const groups: PickGroup[] = ROLE_POST_KINDS.map((kind) => ({
    kind,
    items: sorted(
      ctx.accounts
        .filter((a) => a.roles.includes(kind))
        .map((a) => ({
          pick: { kind, title: a.nom, matricule: a.matricule },
          // Le nom porte déjà le grade ; le matricule, lui, distingue deux homonymes.
          sub: a.matricule,
          deployedOn: a.currentIncidentId ?? undefined,
          placedOn: placedAccount(a.matricule),
        })),
    ),
  }));
  groups.push({
    kind: "shelter",
    items: sorted(ctx.shelters.map((s) => ({ pick: { kind: "shelter", title: s.nom, entityId: s.id }, sub: s.ville, placedOn: placedEntity("shelter", s.id) }))),
  });
  groups.push({
    kind: "equipment",
    items: sorted(ctx.units.map((u) => ({ pick: { kind: "equipment", title: `${parkLabel} — ${u.nom}`, entityId: u.id }, sub: u.ville, placedOn: placedEntity("equipment", u.id) }))),
  });
  return groups;
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

/** Ce que le marqueur dit sous son code : le libellé donné, sinon le compte ou l'entité que le poste désigne. */
export function postCaption(
  post: Pick<IncidentPost, "kind" | "label" | "entityId" | "matricule">,
  ctx: { shelters: readonly Shelter[]; units: readonly Unit[]; responsables?: readonly Responsible[] },
): string | undefined {
  if (post.label) return post.label;
  if (post.kind === "shelter") return ctx.shelters.find((s) => s.id === post.entityId)?.nom;
  if (post.kind === "equipment") return ctx.units.find((u) => u.id === post.entityId)?.nom;
  if (post.matricule) {
    const m = post.matricule.toLowerCase();
    return ctx.responsables?.find((r) => r.matricule.toLowerCase() === m)?.nom ?? post.matricule;
  }
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
