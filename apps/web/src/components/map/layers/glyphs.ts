// ============================================================================
// components/map/layers/glyphs.ts — des marqueurs DOM à GLYPHE, par famille
//
// Les abris et les sites mortuaires étaient deux pastilles rondes de couleurs
// différentes : à l'écran, rien ne les distinguait d'un traceur ou d'une
// ressource posée. Ils passent aux marqueurs DOM, comme les unités et les
// établissements de santé, pour porter leur propre symbole (ADR 0029) — la
// carte n'a pas de serveur de glyphes, un SVG dans le DOM marche partout.
//
// Chaque famille tient ses marqueurs PAR IDENTIFIANT (ADR 0038) : une passe ne
// touche que ce qui a changé — contenu, position, écart — et retire ce qui a
// disparu, comme les marqueurs de `markers.ts`. Le registre retient la carte à
// laquelle ses marqueurs appartiennent : une carte recréée (retour sur la page)
// repart d'un registre vide.
// ============================================================================

import maplibregl from "maplibre-gl";
import type { MarkerKind } from "@/lib/types";
import { mkEl, setMarkerHtml } from "@/components/map/layers/markers";

export interface GlyphMarker {
  id: string;
  ll: [number, number];
  html: string;
  /** Écart en pixels quand un autre marqueur occupe le même point (`mapMarkerOffsets`). */
  offset?: [number, number];
}

interface PoseGlyphe {
  mk: maplibregl.Marker;
  html: string;
  ll: [number, number];
  offset: [number, number];
}
const registres = new Map<string, { map: maplibregl.Map; poses: Map<string, PoseGlyphe> }>();

const memeLL = (a: [number, number], b: [number, number]) => a[0] === b[0] && a[1] === b[1];

/**
 * Pose ou met à jour les marqueurs d'une famille ; `on = false` la vide.
 * `etage` : z-index de la famille — les marqueurs survivant d'une passe à
 * l'autre, c'est lui qui les garde au-dessus des autres familles.
 */
export function applyGlyphMarkers(map: maplibregl.Map | null, key: string, kind: MarkerKind, items: readonly GlyphMarker[], on: boolean, etage?: number): void {
  let reg = registres.get(key);
  if (reg && reg.map !== map) {
    for (const p of reg.poses.values()) p.mk.remove();
    registres.delete(key);
    reg = undefined;
  }
  if (!map || !on) {
    if (reg) for (const p of reg.poses.values()) p.mk.remove();
    registres.delete(key);
    return;
  }
  if (!reg) {
    reg = { map, poses: new Map() };
    registres.set(key, reg);
  }
  const vus = new Set<string>();
  for (const it of items) {
    vus.add(it.id);
    const offset = it.offset ?? [0, 0];
    const p = reg.poses.get(it.id);
    if (!p) {
      const el = mkEl(it.html, kind, it.id);
      if (etage) el.style.zIndex = String(etage);
      reg.poses.set(it.id, { mk: new maplibregl.Marker({ element: el, offset }).setLngLat(it.ll).addTo(map), html: it.html, ll: it.ll, offset });
      continue;
    }
    if (p.html !== it.html) {
      setMarkerHtml(p.mk.getElement(), it.html);
      p.html = it.html;
    }
    if (!memeLL(p.ll, it.ll)) {
      p.mk.setLngLat(it.ll);
      p.ll = it.ll;
    }
    if (!memeLL(p.offset, offset)) {
      p.mk.setOffset(offset);
      p.offset = offset;
    }
  }
  for (const [id, p] of reg.poses) {
    if (!vus.has(id)) {
      p.mk.remove();
      reg.poses.delete(id);
    }
  }
}
