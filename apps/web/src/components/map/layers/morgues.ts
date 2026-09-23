// ============================================================================
// components/map/layers/morgues.ts — les sites mortuaires sur la carte
//
// Un symbole par site : la PLAQUE du service mortuaire, ardoise pour un site
// fixe ; une morgue mobile déployée porte la même plaque SUR DES ROUES, en
// ambre — elle se déploie et se lit sur la carte comme une morgue, sans se
// confondre avec elle (ADR 0029). Un site replié ne se montre pas ; rouge
// sombre quand il est plein. Son nom au survol, sa fiche au clic.
// ============================================================================

import type maplibregl from "maplibre-gl";
import type { MorgueSite } from "@/lib/types";
import { morgueMarkerHTML } from "@/lib/map/markers";
import { applyGlyphMarkers } from "./glyphs";
import { hasLL } from "./points";

/** Rien à préparer : les sites sont des marqueurs DOM (ADR 0029). */
export function setupMorgueLayers(_map: maplibregl.Map): void {
  /* le glyphe vit dans le DOM, pas dans le style */
}

/** Les sites à montrer : ceux de la couche, mobiles repliées exclues. */
export function applyMorgues(map: maplibregl.Map | null, morgues: readonly MorgueSite[], on: boolean, selected?: string | null): void {
  applyGlyphMarkers(
    map,
    "morgues",
    "morgue",
    morgues
      .filter(hasLL)
      .filter((m) => !(m.kind === "mobile" && !m.deployment))
      .map((m) => ({
        id: m.id,
        ll: m.ll,
        // Ambre : mobile déployée ; ardoise foncée : régionale ; ardoise claire : de ville ; rouge sombre : plein.
        html: morgueMarkerHTML(
          m.nom,
          m.kind === "mobile",
          m.statut === "full" ? "#991b1b" : m.kind === "mobile" ? "#d97706" : m.level === "regional" ? "#334155" : "#64748b",
          selected === m.id,
        ),
      })),
    on,
  );
}
