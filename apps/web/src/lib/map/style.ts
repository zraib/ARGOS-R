import type { StyleSpecification } from "maplibre-gl";
import { SOVEREIGN_TILES_URL, TILES_MODE } from "@/lib/map/tiles";

// Style de base « poste de commandement ».
//
// L'origine des tuiles est décidée par `lib/map/tiles.ts` (ADR 0006) et par
// lui seul : en mode SOUVERAIN les sources viennent de martin auto-hébergé, en
// mode EXTERNE des fournisseurs publics (développement uniquement — la
// production impose le mode souverain).
//
// Sources en mode externe (aucun jeton de fournisseur requis) :
//  • sat  — Esri World Imagery
//  • plan — OpenStreetMap
//  • lbl  — surcouche frontières & lieux Esri (étiquettes sur le satellite)
//  • dem  — tuiles d'altitude terrarium pour le relief 3D
const EXTERNAL_SOURCES: StyleSpecification["sources"] = {
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
};

/**
 * Sources en mode SOUVERAIN : martin auto-hébergé. Sans URL configurée, on
 * rend un jeu VIDE — la carte n'a pas de fond, et c'est délibéré : aucun
 * repli silencieux vers un fournisseur étranger n'est acceptable.
 */
function sovereignSources(): StyleSpecification["sources"] {
  if (!SOVEREIGN_TILES_URL) return {};
  return {
    sat: {
      type: "raster",
      tiles: [`${SOVEREIGN_TILES_URL}/sat/{z}/{x}/{y}.png`],
      tileSize: 256,
      maxzoom: 19,
    },
    plan: {
      type: "raster",
      tiles: [`${SOVEREIGN_TILES_URL}/plan/{z}/{x}/{y}.png`],
      tileSize: 256,
      maxzoom: 19,
    },
  };
}

const SOURCES = TILES_MODE === "external" ? EXTERNAL_SOURCES : sovereignSources();

export const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: SOURCES,
  // Une couche dont la source est absente fait échouer tout le style MapLibre :
  // on ne déclare que celles réellement disponibles dans le mode courant.
  layers: [
    ...(SOURCES.sat ? [{ id: "sat", type: "raster" as const, source: "sat" }] : []),
    ...(SOURCES.plan ? [{ id: "plan", type: "raster" as const, source: "plan", layout: { visibility: "none" as const } }] : []),
    ...(SOURCES.lbl ? [{ id: "lbl", type: "raster" as const, source: "lbl" }] : []),
  ],
};


export const MAP_CENTER: [number, number] = [-7.6, 31.9];
export const MAP_ZOOM = 6.3;
