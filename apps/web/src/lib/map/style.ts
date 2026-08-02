import type { StyleSpecification } from "maplibre-gl";

// Style de base « poste de commandement ». Sources raster uniquement (aucun
// jeton de fournisseur requis) :
//  • sat  — Esri World Imagery
//  • plan — OpenStreetMap
//  • lbl  — surcouche frontières & lieux Esri (étiquettes sur le satellite)
//  • dem  — tuiles d'altitude terrarium pour le relief 3D
// En déploiement souverain, elles sont remplacées par des tuiles vectorielles
// martin auto-hébergées + un style de frontières corrigé (MASTER_PLAN §5.1).
// Regroupées ici pour que le remplacement tienne en une seule modification.
export const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    // `maxzoom` = zoom natif maximal de la source. Sans lui, MapLibre n'a plus
    // de tuiles au-delà et affiche « données cartographiques non disponibles » ;
    // avec, il sur-zoome (mise à l'échelle des tuiles) et l'image reste affichée.
    sat: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Esri, Maxar",
    },
    plan: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© OpenStreetMap",
    },
    lbl: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 19,
    },
    dem: {
      type: "raster-dem",
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      encoding: "terrarium",
      tileSize: 256,
      maxzoom: 13,
    },
  },
  layers: [
    { id: "sat", type: "raster", source: "sat" },
    { id: "plan", type: "raster", source: "plan", layout: { visibility: "none" } },
    { id: "lbl", type: "raster", source: "lbl" },
  ],
};

export const MAP_CENTER: [number, number] = [-7.6, 31.9];
export const MAP_ZOOM = 6.3;
