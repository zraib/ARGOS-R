// ============================================================================
// components/map/layers/shelters.ts — les abris d'hébergement sur la carte
//
// Un abri ouvert par un responsable doit apparaître là où il est (ADR 0015) :
// un point par abri qui porte une position, teinté par son taux d'occupation
// — vert tant qu'il reste de la place, ambre au-delà de 80 %, rouge plein.
// Les abris sans position (saisis avant la géolocalisation) restent dans les
// listes, pas sur la carte. Le symbole est une TENTE (ADR 0029) : un abri ne
// se confond plus avec un site mortuaire ni avec un traceur.
//
// Révision (ADR 0036) : un abri sans position propre se dessine désormais à
// celle de sa COMMUNE — la même que sa fiche annonce (« position de la
// commune ») ; son infobulle le dit. Seul un abri dont la commune est
// introuvable reste hors de la carte.
// ============================================================================

import type maplibregl from "maplibre-gl";
import type { Shelter } from "@/lib/data/modules";
import type { City } from "@/lib/types";
import { shelterMarkerHTML } from "@/lib/map/markers";
import { markerKey, shelterLL } from "@/lib/map/positions";
import { applyGlyphMarkers } from "./glyphs";

/** Rien à préparer : les abris sont des marqueurs DOM (ADR 0029). */
export function setupShelterLayers(_map: maplibregl.Map): void {
  /* le glyphe vit dans le DOM, pas dans le style */
}

/** Couleur d'un abri selon son remplissage. */
export function shelterColor(s: Shelter): string {
  const taux = s.capacity > 0 ? s.occupants / s.capacity : 0;
  return taux >= 1 ? "#b91c1c" : taux >= 0.8 ? "#d97706" : "#15803d";
}

export function applyShelters(
  map: maplibregl.Map | null,
  shelters: readonly Shelter[],
  cities: readonly City[],
  on: boolean,
  selected?: string | null,
  offsets?: ReadonlyMap<string, [number, number]>,
  cityNote?: string,
): void {
  const items = shelters.flatMap((s) => {
    const pos = shelterLL(s, cities);
    if (!pos) return [];
    // Posé à sa commune : l'infobulle le dit, pour qu'un point ne passe pas pour une adresse.
    const ville = pos.fromCity && cityNote ? `${s.ville} (${cityNote})` : s.ville;
    return [{ id: s.id, ll: pos.ll, offset: offsets?.get(markerKey("shelter", s.id)), html: shelterMarkerHTML(s.nom, ville, shelterColor(s), selected === s.id) }];
  });
  applyGlyphMarkers(map, "shelters", "shelter", items, on);
}
