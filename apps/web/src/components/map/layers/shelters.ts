// ============================================================================
// components/map/layers/shelters.ts — les abris d'hébergement sur la carte
//
// Un abri ouvert par un responsable doit apparaître là où il est (ADR 0015) :
// un point par abri qui porte une position, teinté par son taux d'occupation
// — vert tant qu'il reste de la place, ambre au-delà de 80 %, rouge plein.
// Les abris sans position (saisis avant la géolocalisation) restent dans les
// listes, pas sur la carte.
// ============================================================================

import type maplibregl from "maplibre-gl";
import type { Shelter } from "@/lib/data/modules";
import { applyPoints, hasLL, setupPointLayers } from "./points";

export function setupShelterLayers(map: maplibregl.Map): void {
  setupPointLayers(map, "shelters", "shelter");
}

/** Couleur d'un abri selon son remplissage. */
export function shelterColor(s: Shelter): string {
  const taux = s.capacity > 0 ? s.occupants / s.capacity : 0;
  return taux >= 1 ? "#b91c1c" : taux >= 0.8 ? "#d97706" : "#15803d";
}

export function applyShelters(map: maplibregl.Map | null, shelters: readonly Shelter[], on: boolean): void {
  applyPoints(
    map,
    "shelters",
    shelters.filter(hasLL).map((s) => ({ id: s.id, label: `${s.nom} · ${s.ville}`, ll: s.ll, color: shelterColor(s) })),
    on,
  );
}
