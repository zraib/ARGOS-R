"use client";

// Exemple minimal d'intégration. Copier ce fichier dans le projet cible et
// ajuster l'import selon l'emplacement du paquet.

import { useState } from "react";
import { EsriMaxarMap, type MapMarker, type MapSelection, type MovingMarker } from "esri-maxar-map";

const MARKERS: MapMarker[] = [
  { id: "U1", kind: "unit", ll: [-8.0, 31.63], label: "U1", shape: "square", color: "#C9A84C" },
  { id: "H1", kind: "hospital", ll: [-7.98, 31.62], shape: "cross", color: "#EF4444" },
  { id: "INC-1", kind: "incident", ll: [-8.25, 31.22], shape: "triangle", color: "#EF4444", pulse: true },
];

const MOVING: MovingMarker[] = [
  {
    id: "LOG-1",
    kind: "vehicle",
    label: "LOG-1",
    shape: "diamond",
    color: "#3B82F6",
    speed: 0.03,
    path: [
      [-7.62, 33.57],
      [-7.9, 32.6],
      [-8.0, 31.63],
    ],
  },
];

export default function Demo() {
  const [sel, setSel] = useState<MapSelection | null>(null);
  const [layers, setLayers] = useState({ unit: true, hospital: true, incident: true, vehicle: true });

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <EsriMaxarMap
        markers={MARKERS}
        movingMarkers={MOVING}
        layers={layers}
        selected={sel}
        onSelect={(s) => setSel(s)}
        routing={{ engine: "osrm" }}
        onContextMenu={(ll) => console.log("clic droit", ll)}
      >
        {/* Toute surcouche libre : ici un sélecteur de couches. */}
        <div style={{ position: "absolute", top: 12, insetInlineStart: 12, zIndex: 10 }}>
          {Object.keys(layers).map((k) => (
            <label key={k} style={{ display: "block", color: "#fff", fontSize: 12 }}>
              <input
                type="checkbox"
                checked={layers[k as keyof typeof layers]}
                onChange={(e) => setLayers((l) => ({ ...l, [k]: e.target.checked }))}
              />{" "}
              {k}
            </label>
          ))}
        </div>
      </EsriMaxarMap>
    </div>
  );
}
