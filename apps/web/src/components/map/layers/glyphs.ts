// ============================================================================
// components/map/layers/glyphs.ts — des marqueurs DOM à GLYPHE, par famille
//
// Les abris et les sites mortuaires étaient deux pastilles rondes de couleurs
// différentes : à l'écran, rien ne les distinguait d'un traceur ou d'une
// ressource posée. Ils passent aux marqueurs DOM, comme les unités et les
// établissements de santé, pour porter leur propre symbole (ADR 0029) — la
// carte n'a pas de serveur de glyphes, un SVG dans le DOM marche partout.
//
// Chaque famille tient sa liste de marqueurs et la remplace à chaque passe :
// une carte de quelques dizaines d'abris ou de sites se redessine sans qu'on
// ait à diffuser les changements un par un.
// ============================================================================

import maplibregl from "maplibre-gl";
import type { MarkerKind } from "@/lib/types";
import { mkEl } from "@/components/map/layers/markers";

export interface GlyphMarker {
  id: string;
  ll: [number, number];
  html: string;
  /** Écart en pixels quand un autre marqueur occupe le même point (`mapMarkerOffsets`). */
  offset?: [number, number];
}

const registres = new Map<string, maplibregl.Marker[]>();

/** Repose les marqueurs d'une famille ; `on = false` la vide. */
export function applyGlyphMarkers(map: maplibregl.Map | null, key: string, kind: MarkerKind, items: readonly GlyphMarker[], on: boolean): void {
  for (const mk of registres.get(key) ?? []) mk.remove();
  registres.set(key, []);
  if (!map || !on) return;
  const poses: maplibregl.Marker[] = [];
  for (const it of items) {
    poses.push(new maplibregl.Marker({ element: mkEl(it.html, kind, it.id), offset: it.offset }).setLngLat(it.ll).addTo(map));
  }
  registres.set(key, poses);
}

/** Retire tout (changement de fond de carte, démontage). */
export function clearGlyphMarkers(key: string): void {
  for (const mk of registres.get(key) ?? []) mk.remove();
  registres.delete(key);
}
