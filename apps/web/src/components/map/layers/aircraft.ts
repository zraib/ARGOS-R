// ============================================================================
// components/map/layers/aircraft.ts — suivi aérien : marqueurs propres et
// navigation à l'estime entre deux échos (ADR 0004).
//
// Les aéronefs ne passent PAS par la reconstruction des marqueurs : ils bougent
// en continu, alors que `syncMarkers` détruit et recrée tout. Ils ont leur
// registre, déplacé par `setLngLat`. Code déplacé verbatim depuis MapCanvas.tsx (R-7).
// ============================================================================

import maplibregl from "maplibre-gl";
import { useArgos } from "@/lib/store";
import { extrapolate } from "@/lib/map/deadReckoning";
import { acftMarkerHTML } from "@/lib/map/markers";
import { ACFT_STALE_S } from "@/lib/map/canvas/weather-render";
import { mkEl } from "./markers";

export type AircraftRegistry = Map<string, { mk: maplibregl.Marker; el: HTMLElement; html: string }>;

/** Retire tous les marqueurs d'aéronefs. */
export function dropAircraft(registry: AircraftRegistry): void {
  registry.forEach((e) => e.mk.remove());
  registry.clear();
}

/** Une image : place ou déplace chaque appareil à sa position estimée. */
export function renderAircraft(map: maplibregl.Map, registry: AircraftRegistry): void {
  const now = Date.now();
  const st = useArgos.getState();
  const sel = st.selMarker;
  const vus = new Set<string>();

  st.aircraft.forEach((a) => {
    // Sans écho, pas de position : l'appareil reste listé dans le panneau
    // mais n'est pas placé sur la carte.
    if (!a.position) return;
    const id = a.aircraft.id;
    vus.add(id);

    const est = extrapolate(a.position, now);
    let entry = registry.get(id);
    if (!entry) {
      const el = mkEl("", "acft", id);
      const mk = new maplibregl.Marker({ element: el }).setLngLat(est.ll).addTo(map);
      entry = { mk, el, html: "" };
      registry.set(id, entry);
    }

    // Le balisage n'est réécrit que s'il change réellement (cap, état,
    // sélection) : réécrire innerHTML à chaque image saccaderait le rendu.
    const html = acftMarkerHTML(
      a.aircraft.label,
      a.aircraft.role,
      a.status,
      a.position.heading,
      sel?.kind === "acft" && sel.id === id,
      est.ageSec > ACFT_STALE_S,
    );
    if (html !== entry.html) {
      entry.el.innerHTML = html;
      // `mkEl` agrandit le contenu à la création ; réécrire le balisage
      // remplace cet enfant, il faut donc réappliquer l'échelle.
      const inner = entry.el.firstElementChild as HTMLElement | null;
      if (inner) inner.style.transform = "scale(1.4)";
      entry.html = html;
    }
    entry.mk.setLngLat(est.ll);
  });

  // Appareils retirés du suivi ou ayant perdu leur écho.
  registry.forEach((entry, id) => {
    if (!vus.has(id)) {
      entry.mk.remove();
      registry.delete(id);
    }
  });
}
