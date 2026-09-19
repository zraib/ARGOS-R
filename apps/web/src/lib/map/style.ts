import type { StyleSpecification } from "maplibre-gl";
import { SOVEREIGN_TILES_URL, TILES_MODE } from "@/lib/map/tiles";

// Style de base « poste de commandement ».
//
// L'origine des tuiles est décidée par `lib/map/tiles.ts` (ADR 0006, ADR 0014)
// et par lui seul : en mode SOUVERAIN les sources viennent du serveur de tuiles
// de la station, en mode EXTERNE des fournisseurs publics.
//
// Sources en mode externe (aucun jeton de fournisseur requis) :
//  • sat  — Esri World Imagery (raster)
//  • dem  — tuiles d'altitude terrarium (AWS) pour le relief 3D
//  • le fond « plan » et les repères (frontières, lieux) sont des tuiles
//    VECTORIELLES OpenFreeMap stylées par `lib/map/plan.ts`, insérées à
//    l'ouverture de la carte : c'est ce qui permet de ne tracer aucune
//    frontière contestée à l'intérieur du Royaume — une image raster
//    (OpenStreetMap, repères Esri) ne se corrige pas.
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
  dem: {
    type: "raster-dem",
    tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
    encoding: "terrarium",
    tileSize: 256,
    maxzoom: 13,
  },
};

/**
 * Sources en mode SOUVERAIN : martin auto-hébergé (`infra/compose`, données
 * dans `infra/geo/tiles/*.mbtiles`). Sans URL configurée, on rend un jeu VIDE —
 * la carte n'a pas de fond, et c'est délibéré : aucun repli silencieux vers un
 * fournisseur étranger n'est acceptable.
 *
 * Motif d'URL de martin : `/{source}/{z}/{x}/{y}` (martin choisit le format
 * d'après le fichier). Quatre sources, une par MBTiles : `sat` (imagerie),
 * `plan` (fond planimétrique), `lbl` (repères et toponymes), `dem` (altitude
 * terrarium, pour le relief 3D). Un fichier absent donne des tuiles vides, pas
 * un style cassé. Voir `infra/geo/README.md`.
 */
function sovereignSources(): StyleSpecification["sources"] {
  if (!SOVEREIGN_TILES_URL) return {};
  // Une base RELATIVE (`/tiles`, derrière le reverse proxy de la station) est
  // rendue absolue sur l'origine de la page : les sources d'un style MapLibre
  // sont des URL complètes. Côté serveur (pas de `window`) elle reste telle
  // quelle — le navigateur recalcule le style au montage de la carte.
  const raw = SOVEREIGN_TILES_URL.replace(/\/$/, "");
  const base = raw.startsWith("/") && typeof window !== "undefined" ? `${window.location.origin}${raw}` : raw;
  return {
    // L'imagerie passe par le protocole `iris-sat` (lib/map/satFallback.ts) : une
    // tuile absente à ce zoom se fabrique depuis son parent — la couverture hors
    // ligne n'est pas uniforme (pays z13, agglomérations et communes plus fin).
    sat: { type: "raster", tiles: ["iris-sat://{z}/{x}/{y}"], tileSize: 256, maxzoom: 19 },
    plan: { type: "raster", tiles: [`${base}/plan/{z}/{x}/{y}`], tileSize: 256, maxzoom: 19 },
    lbl: { type: "raster", tiles: [`${base}/lbl/{z}/{x}/{y}`], tileSize: 256, maxzoom: 19 },
    dem: { type: "raster-dem", tiles: [`${base}/dem/{z}/{x}/{y}`], encoding: "terrarium", tileSize: 256, maxzoom: 13 },
  };
}

const SOURCES = TILES_MODE === "external" ? EXTERNAL_SOURCES : sovereignSources();

export const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: SOURCES,
  // Une couche dont la source est absente fait échouer tout le style MapLibre :
  // on ne déclare que celles réellement disponibles dans le mode courant. En
  // mode externe, `plan` et `lbl` n'existent pas ici : le fond vectoriel les
  // remplace (`lib/map/plan.ts`).
  layers: [
    ...(SOURCES.sat ? [{ id: "sat", type: "raster" as const, source: "sat" }] : []),
    ...(SOURCES.plan ? [{ id: "plan", type: "raster" as const, source: "plan", layout: { visibility: "none" as const } }] : []),
    ...(SOURCES.lbl ? [{ id: "lbl", type: "raster" as const, source: "lbl" }] : []),
  ],
};


export const MAP_CENTER: [number, number] = [-7.6, 31.9];
export const MAP_ZOOM = 6.3;
