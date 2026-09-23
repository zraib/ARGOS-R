// ============================================================================
// components/map/layers/shelters.ts — les abris d'hébergement sur la carte
//
// Un abri ouvert par un responsable doit apparaître là où il est (ADR 0015) :
// un point par abri qui porte une position, teinté par son taux d'occupation
// — vert tant qu'il reste de la place, ambre au-delà de 80 %, rouge plein.
// Les abris sans position (saisis avant la géolocalisation) restent dans les
// listes, pas sur la carte. Le symbole est une TENTE (ADR 0029) : un abri ne
// se confond plus avec un site mortuaire ni avec un traceur.
// ============================================================================

import type maplibregl from "maplibre-gl";
import type { Shelter } from "@/lib/data/modules";
import { shelterMarkerHTML } from "@/lib/map/markers";
import { applyGlyphMarkers } from "./glyphs";
import { hasLL } from "./points";

/** Rien à préparer : les abris sont des marqueurs DOM (ADR 0029). */
export function setupShelterLayers(_map: maplibregl.Map): void {
  /* le glyphe vit dans le DOM, pas dans le style */
}

/** Couleur d'un abri selon son remplissage. */
export function shelterColor(s: Shelter): string {
  const taux = s.capacity > 0 ? s.occupants / s.capacity : 0;
  return taux >= 1 ? "#b91c1c" : taux >= 0.8 ? "#d97706" : "#15803d";
}

export function applyShelters(map: maplibregl.Map | null, shelters: readonly Shelter[], on: boolean, selected?: string | null): void {
  applyGlyphMarkers(
    map,
    "shelters",
    "shelter",
    shelters.filter(hasLL).map((s) => ({ id: s.id, ll: s.ll, html: shelterMarkerHTML(s.nom, s.ville, shelterColor(s), selected === s.id) })),
    on,
  );
}
