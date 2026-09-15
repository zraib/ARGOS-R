// ============================================================================
// lib/map/plan.ts — fond « plan » et repères du mode EXTERNE : des tuiles
// VECTORIELLES (OpenFreeMap, données OpenStreetMap) stylées ici.
//
// Pourquoi des tuiles vectorielles et pas les images OpenStreetMap / Esri du
// mode développement : une image ne se corrige pas. Les fonds raster tracent
// à l'intérieur du territoire du Royaume une ligne de séparation et le « mur
// de sécurité » ; avec des tuiles vectorielles, c'est le STYLE qui décide de
// ce qui est dessiné — et ce style-ci ne trace aucune frontière contestée.
// La frontière du Maroc court ainsi sans rupture jusqu'à la Mauritanie et à
// l'Algérie, et aucun toponyme de « territoire » distinct n'apparaît.
//
// Le style de base est celui d'OpenFreeMap (« bright », dérivé d'OSM Bright,
// le même dont sont dérivés les styles du mode souverain) ; il est récupéré à
// l'ouverture de la carte, corrigé (`patchPlanStyle`, pure) puis inséré dans
// le style courant juste au-dessus de l'imagerie (`installPlanStyle`). Deux
// groupes : `plan` (tout le fond, visible en mode Plan) et `labels`
// (frontières et toponymes, visibles aussi sur le satellite — le rôle que
// jouait la couche de repères Esri).
// ============================================================================

import type maplibregl from "maplibre-gl";
import type { FilterSpecification, LayerSpecification, StyleSpecification } from "maplibre-gl";

/** Style OpenFreeMap « bright » : sources, glyphes (polices) et sprites sur le même hôte. */
export const PLAN_STYLE_URL = "https://tiles.openfreemap.org/styles/bright";

export type PlanGroup = "plan" | "labels";

/** Ce qu'on garde du style distant, une fois corrigé. */
export interface PlanStyle {
  sources: StyleSpecification["sources"];
  glyphs?: string;
  sprite?: string;
  layers: LayerSpecification[];
}

const GROUP_KEY = "argos:group";

/** Groupe d'une couche du fond (lu dans ses métadonnées) ; `null` si elle n'en vient pas. */
export function planGroupOf(layer: { metadata?: unknown }): PlanGroup | null {
  const meta = layer.metadata;
  if (!meta || typeof meta !== "object") return null;
  const g = (meta as Record<string, unknown>)[GROUP_KEY];
  return g === "plan" || g === "labels" ? g : null;
}

/** Couches qui font les repères sur le satellite : frontières, lieux, eaux. */
function isLabelLayer(layer: LayerSpecification): boolean {
  const sourceLayer = "source-layer" in layer ? layer["source-layer"] : undefined;
  if (sourceLayer === "boundary") return true;
  return layer.type === "symbol" && (sourceLayer === "place" || sourceLayer === "water_name");
}

/**
 * Un filtre est-il une EXPRESSION (`["==", ["get", "clé"], v]`) plutôt qu'un
 * filtre de l'ancienne syntaxe (`["==", "clé", v]`) ? Même règle que MapLibre
 * (`isExpressionFilter` de la spécification de style) : un seul opérande de
 * l'ancienne syntaxe fait lire TOUT le filtre à l'ancienne — la condition
 * ajoutée doit donc parler la même langue que le filtre qu'elle rejoint.
 */
function isExpressionFilter(f: unknown): boolean {
  if (f === true || f === false) return true;
  if (!Array.isArray(f) || f.length === 0) return false;
  const [op, a, b] = f as unknown[];
  switch (op) {
    case "has":
      return f.length >= 2 && a !== "$id" && a !== "$type";
    case "in":
      return f.length >= 3 && (typeof a !== "string" || Array.isArray(b));
    case "!in":
    case "!has":
    case "none":
      return false;
    case "==":
    case "!=":
    case ">":
    case ">=":
    case "<":
    case "<=":
      return f.length !== 3 || Array.isArray(a) || Array.isArray(b);
    case "any":
    case "all":
      return (f as unknown[]).slice(1).every((sub) => typeof sub === "boolean" || isExpressionFilter(sub));
    default:
      return true;
  }
}

/** Ajoute « pas contestée » à un filtre existant, dans la syntaxe qu'il utilise. */
function andNotDisputed(existing: FilterSpecification | undefined): FilterSpecification {
  if (existing && !isExpressionFilter(existing)) {
    const cond = ["!=", "disputed", 1] as unknown as FilterSpecification;
    return ["all", existing, cond] as unknown as FilterSpecification;
  }
  const cond = ["!=", ["get", "disputed"], 1] as unknown as FilterSpecification;
  return existing ? (["all", existing, cond] as unknown as FilterSpecification) : cond;
}

/**
 * Corrige le style distant (pure) :
 *  - aucune frontière contestée n'est tracée : la couche qui les dessine en
 *    pointillé disparaît, et toute couche de frontières exclut `disputed = 1` ;
 *  - chaque couche reçoit son groupe (`plan` ou `labels`) en métadonnée.
 */
export function patchPlanStyle(style: StyleSpecification): PlanStyle {
  const layers: LayerSpecification[] = [];
  for (const raw of style.layers) {
    const sourceLayer = "source-layer" in raw ? raw["source-layer"] : undefined;
    if (sourceLayer === "boundary" && /disputed/i.test(raw.id)) continue;
    const layer: LayerSpecification = structuredClone(raw);
    if (sourceLayer === "boundary" && "filter" in layer) layer.filter = andNotDisputed(layer.filter);
    else if (sourceLayer === "boundary") (layer as { filter?: FilterSpecification }).filter = andNotDisputed(undefined);
    const meta = layer.metadata && typeof layer.metadata === "object" ? (layer.metadata as Record<string, unknown>) : {};
    layer.metadata = { ...meta, [GROUP_KEY]: isLabelLayer(raw) ? "labels" : "plan" };
    layers.push(layer);
  }
  return {
    sources: structuredClone(style.sources),
    glyphs: style.glyphs,
    sprite: typeof style.sprite === "string" ? style.sprite : undefined,
    layers,
  };
}

/** Récupère et corrige le style ; `null` si le réseau ou le document ne suit pas (la carte reste sans plan). */
export async function loadPlanStyle(fetchImpl: typeof fetch = fetch): Promise<PlanStyle | null> {
  try {
    const res = await fetchImpl(PLAN_STYLE_URL, { cache: "force-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const style = (await res.json()) as Partial<StyleSpecification>;
    if (style.version !== 8 || !Array.isArray(style.layers) || !style.sources) throw new Error("style invalide");
    return patchPlanStyle(style as StyleSpecification);
  } catch (e) {
    console.warn("[carte] fond plan indisponible :", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Insère le fond dans le style courant, juste au-dessus de l'imagerie `sat`
 * (donc sous tout ce que la carte pose par-dessus : itinéraires, repères,
 * simulations). Idempotent : ne fait rien si le fond est déjà là.
 */
export function installPlanStyle(map: maplibregl.Map, plan: PlanStyle): boolean {
  if (!map.getStyle() || map.getSource("openmaptiles")) return false;
  for (const [id, src] of Object.entries(plan.sources)) if (!map.getSource(id)) map.addSource(id, src);
  if (plan.glyphs) map.setGlyphs(plan.glyphs);
  if (plan.sprite) map.setSprite(plan.sprite);
  const current = map.getStyle().layers ?? [];
  const i = current.findIndex((l) => l.id === "sat");
  const before = i >= 0 ? current[i + 1]?.id : current[0]?.id;
  for (const layer of plan.layers) if (!map.getLayer(layer.id)) map.addLayer(layer, before);
  return true;
}
