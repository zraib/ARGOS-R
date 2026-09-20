// ============================================================================
// ARGOS — qui tient quoi, et qui est là
//
// Le titulaire d'une entité (commandant d'unité, directeur d'hôpital,
// responsable d'abri…) vient de l'API ; sa présence vient du flux temps réel.
// Ces deux listes se joignent ici, une fois, pour la fiche et pour la carte.
// ============================================================================

import type { PresenceUser, Responsible } from "@/lib/types";

export type ResponsibleKind = Responsible["kind"];
/** Les natures d'entité qui ont un titulaire (tout sauf le poste déployé). */
export type EntityKind = Exclude<ResponsibleKind, "incident">;

/** Le premier titulaire d'une entité, s'il en est un — pour une légende ; la fiche, elle, les montre TOUS (`responsiblesOf`). */
export function responsibleOf(list: readonly Responsible[], kind: EntityKind, entityId: string): Responsible | undefined {
  return list.find((r) => r.kind === kind && r.entityId === entityId);
}

/**
 * TOUS les titulaires d'une entité (ADR 0026) : une unité peut avoir deux
 * commandants rattachés, un hôpital un directeur et son adjoint — chacun se
 * joint depuis la fiche et depuis la carte. Un même compte n'apparaît qu'une
 * fois par rôle, dans l'ordre où l'API les sert.
 */
export function responsiblesOf(list: readonly Responsible[], kind: EntityKind, entityId: string): Responsible[] {
  const out: Responsible[] = [];
  for (const r of list) {
    if (r.kind !== kind || r.entityId !== entityId) continue;
    if (out.some((x) => x.matricule.toLowerCase() === r.matricule.toLowerCase() && x.role === r.role)) continue;
    out.push(r);
  }
  return out;
}

/** Les postes déployés sur un incident. */
export function deployedOn(list: readonly Responsible[], incidentId: string): Responsible[] {
  return list.filter((r) => r.kind === "incident" && r.entityId === incidentId);
}

/** L'opération sur laquelle un compte est déployé (`entityId` = l'incident), s'il l'est. */
export function deploymentOf(list: readonly Responsible[], matricule: string): Responsible | undefined {
  const m = matricule.toLowerCase();
  return list.find((r) => r.kind === "incident" && r.matricule.toLowerCase() === m);
}

/** En ligne = un flux ouvert sur le serveur, rien d'autre ; la casse du matricule ne compte pas. */
export function isOnline(online: readonly PresenceUser[], matricule: string): boolean {
  const m = matricule.toLowerCase();
  return online.some((p) => p.matricule.toLowerCase() === m);
}

/**
 * En ligne SOUS CE RÔLE. Un compte à plusieurs profils ouvre sa session sous
 * l'un d'eux : connecté comme OPCOM, il n'est pas « en ligne » comme cellule
 * bleue, même si le compte tient aussi ce rôle. La présence est celle du
 * poste tenu, pas celle de la personne.
 */
export function isOnlineAs(online: readonly PresenceUser[], matricule: string, role: string): boolean {
  const m = matricule.toLowerCase();
  return online.some((p) => p.matricule.toLowerCase() === m && p.role === role);
}

/** Identifiant du canal d'un incident — la convention du serveur (`c-<référence>`). */
export function incidentChannelId(incidentId: string): string {
  return `c-${incidentId.toLowerCase()}`;
}
