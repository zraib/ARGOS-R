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

/** Le titulaire d'une entité, s'il en est un. */
export function responsibleOf(list: readonly Responsible[], kind: EntityKind, entityId: string): Responsible | undefined {
  return list.find((r) => r.kind === kind && r.entityId === entityId);
}

/** Les postes déployés sur un incident. */
export function deployedOn(list: readonly Responsible[], incidentId: string): Responsible[] {
  return list.filter((r) => r.kind === "incident" && r.entityId === incidentId);
}

/** En ligne = un flux ouvert sur le serveur, rien d'autre ; la casse du matricule ne compte pas. */
export function isOnline(online: readonly PresenceUser[], matricule: string): boolean {
  const m = matricule.toLowerCase();
  return online.some((p) => p.matricule.toLowerCase() === m);
}

/** Identifiant du canal d'un incident — la convention du serveur (`c-<référence>`). */
export function incidentChannelId(incidentId: string): string {
  return `c-${incidentId.toLowerCase()}`;
}
