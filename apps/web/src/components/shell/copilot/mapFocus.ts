import type { AiMessage } from "@/lib/store";
import type { Incident } from "@/lib/types";

// ============================================================================
// « Afficher sur la carte » : ce qu'une réponse permet de montrer.
//
// Une même règle servait deux endroits (le bouton et la puce suggérée) et
// était écrite deux fois. Elle vit ici une fois : d'abord l'incident cible s'il
// existe dans le magasin (on le SÉLECTIONNE, pas seulement on le centre), sinon
// un simple centrage sur des coordonnées.
// ============================================================================

export type MapFocusAction =
  | { kind: "incident"; incident: Incident }
  | { kind: "center"; ll: [number, number]; zoom: number; label: string }
  | null;

export function resolveMapFocus(msg: Pick<AiMessage, "cross">, incidents: Incident[]): MapFocusAction {
  const mf = msg.cross?.mapFocus;
  const incCoords = msg.cross?.incident?.coords;
  const incId = msg.cross?.incident?.id ?? mf?.incidentId;
  if (!mf && !(incCoords && incId)) return null;
  if (mf?.incidentId) {
    const inc = incidents.find((i) => i.id === mf.incidentId);
    if (inc) return { kind: "incident", incident: inc };
  }
  if (incCoords && incId) {
    const inc = incidents.find((i) => i.id === incId);
    if (inc) return { kind: "incident", incident: inc };
  }
  if (mf?.ll) return { kind: "center", ll: mf.ll as [number, number], zoom: mf.zoom ?? 9, label: mf.label ?? "" };
  if (incCoords) return { kind: "center", ll: incCoords as [number, number], zoom: 10, label: msg.cross?.incident?.titre ?? "Incident" };
  return null;
}

/** Libellé du bouton : celui de la réponse, ou « Localiser » par défaut. */
export function mapFocusLabel(msg: Pick<AiMessage, "cross">): string {
  return msg.cross?.mapFocus?.label ?? "Localiser";
}
