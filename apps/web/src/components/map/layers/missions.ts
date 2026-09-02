// ============================================================================
// components/map/layers/missions.ts — les boucles opérationnelles sur la carte
// (ADR 0007, P1-c) : un trait de l'unité engagée vers son incident, coloré par
// état, plein quand la boucle est prise en charge, tireté tant qu'elle attend.
// Code déplacé verbatim depuis MapCanvas.tsx (R-7).
// ============================================================================

import maplibregl from "maplibre-gl";
import { useArgos } from "@/lib/store";

/**
 * Trace les boucles ouvertes : un segment de l'unité engagée vers son
 * incident. Seuls les ordres sont tracés — une demande de moyen ou un
 * transfert n'ont pas de trajet d'unité à montrer.
 *
 * Le filtre par incident sélectionné n'est PAS appliqué ici : à l'échelle
 * nationale, voir toutes les boucles est précisément l'intérêt. C'est la
 * sélection d'un incident qui met les autres en retrait (opacité), pas qui
 * les efface.
 */
export function applyMissions(map: maplibregl.Map | null) {
  if (!map) return;
  const src = map.getSource("missions") as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  const st = useArgos.getState();
  // Inbox ET outbox : selon le rôle, on est d'un côté ou de l'autre de la
  // boucle — la carte doit montrer les deux sans doublon.
  const seen = new Set<string>();
  const all = [...st.missionInbox, ...st.missionOutbox].filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return m.payload.kind === "order";
  });
  const features = all.flatMap((m) => {
    const unitId = typeof m.payload.unitId === "string" ? m.payload.unitId : null;
    const unit = unitId ? st.units.find((u) => u.id === unitId) : undefined;
    const inc = st.incidents.find((i) => i.id === m.incidentId);
    if (!unit?.ll || !inc?.ll) return [];
    return [{
      type: "Feature" as const,
      properties: { id: m.id, state: m.state, incidentId: m.incidentId },
      geometry: { type: "LineString" as const, coordinates: [unit.ll, inc.ll] },
    }];
  });
  src.setData({ type: "FeatureCollection", features });

  // L'interrupteur de l'arbre des couches éteint les deux couches d'un coup.
  const vis = st.layers.missions ? "visible" : "none";
  for (const id of ["missions-line", "missions-line-pending"]) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
  }
}

/** Pose les couches (appelée par setupStyle ; idempotente). */
export function setupMissionLayers(map: maplibregl.Map): void {
    // Boucles opérationnelles (ADR 0007, P1-c) : un trait de l'unité vers
    // l'incident pour chaque ordre en cours, coloré par état. La carte cesse
    // d'être une photographie des positions pour devenir le THÉÂTRE de ce
    // qui se joue : qui a été appelé, qui a répondu, qui roule.
    if (!map.getSource("missions")) {
      map.addSource("missions", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      const stateColor: maplibregl.ExpressionSpecification = [
        "match", ["get", "state"],
        "issued", "#C9A84C",      // émis — personne n'a encore répondu
        "accepted", "#3B82F6",    // accusé réception
        "in_progress", "#10B981", // en route / sur zone
        "#94A3B8",
      ];
      // Trait plein pour une boucle prise en charge, tireté tant qu'elle
      // attend : l'œil distingue l'engagement réel de l'appel sans réponse
      // AVANT de lire une couleur (utile en vision nocturne, et pour les
      // opérateurs daltoniens).
      map.addLayer({
        id: "missions-line",
        type: "line",
        source: "missions",
        filter: ["!=", ["get", "state"], "issued"],
        paint: { "line-color": stateColor, "line-width": 3, "line-opacity": 0.9 },
      });
      map.addLayer({
        id: "missions-line-pending",
        type: "line",
        source: "missions",
        filter: ["==", ["get", "state"], "issued"],
        paint: { "line-color": stateColor, "line-width": 2.5, "line-dasharray": [1.5, 1.5], "line-opacity": 0.85 },
      });
      applyMissions(map); // une boucle déjà chargée survit au changement de fond
    }
}
