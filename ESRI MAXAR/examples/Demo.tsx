"use client";

// Exemple minimal. Le composant n'affiche aucune commande : les bascules sont
// des props, l'interface reste entièrement à votre charge (ici deux boutons).

import { useState } from "react";
import { EsriMaxarBaseMap, type Basemap } from "esri-maxar";

export default function Demo() {
  const [basemap, setBasemap] = useState<Basemap>("satellite");
  const [d3, setD3] = useState(false);
  const [last, setLast] = useState("—");

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <EsriMaxarBaseMap
        basemap={basemap}
        terrain3d={d3}
        onMapClick={(ll) => setLast(`${ll[1].toFixed(4)}, ${ll[0].toFixed(4)}`)}
      >
        <div style={{ position: "absolute", top: 12, insetInlineStart: 12, zIndex: 10, display: "flex", gap: 8 }}>
          <button onClick={() => setBasemap(basemap === "satellite" ? "plan" : "satellite")}>{basemap}</button>
          <button onClick={() => setD3(!d3)}>{d3 ? "3D" : "2D"}</button>
          <span style={{ background: "#000", color: "#fff", padding: "2px 6px" }}>{last}</span>
        </div>
      </EsriMaxarBaseMap>
    </div>
  );
}
