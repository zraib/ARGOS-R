// ============================================================================
// lib/map/positions.ts — OÙ se dessine chaque élément de la carte
//
// Une seule réponse pour tous : le marqueur, le recentrage de la carte et le
// bouton « Afficher sur la carte » des fiches lisent la même position, et
// allument la même couche. Avant, chaque endroit avait sa règle : un abri
// sans coordonnées propres avait une position dans sa fiche (sa commune) mais
// aucune sur la carte ; un hôpital dont le type est « campagne » tombait dans
// la couche civile, masquée par défaut ; sélectionner un hôpital de campagne
// ne recentrait pas la carte.
//
// Et des marqueurs posés AU MÊME POINT — un hôpital de campagne déployé sur la
// commune de l'incident, un abri placé au chef-lieu — se recouvraient
// exactement : le dernier dessiné cachait les autres. `mapMarkerOffsets` les
// écarte de quelques pixels autour du premier, qui garde sa place exacte.
// ============================================================================

import type { Shelter } from "@/lib/data/modules";
import type { LayerState } from "@/lib/store/shared";
import type { City, FieldHospital, Hospital, Incident, IncidentPost, MarkerKind, MorgueSite, PlacedResource, Unit } from "@/lib/types";
import type { Tracker } from "@/lib/tracking/tracker";
import { hospKind, kindDef } from "@/lib/hospitals";
import { fieldLL } from "@/lib/map/markers";

type LL = [number, number];

/** Ce qu'il faut lire pour placer les éléments — un sous-ensemble du magasin. */
export interface PositionSource {
  mapIncidents: readonly Incident[];
  units: readonly Unit[];
  hospitals: readonly Hospital[];
  fieldHosps: readonly FieldHospital[];
  morgues: readonly MorgueSite[];
  shelters: readonly Shelter[];
  cities: readonly City[];
  trackers: readonly Tracker[];
  posts: readonly IncidentPost[];
  placed: readonly PlacedResource[];
}

/** Des coordonnées [lng, lat] utilisables. */
export function isLL(v: unknown): v is LL {
  return Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === "number" && Number.isFinite(x));
}

/**
 * Position d'un abri : la sienne ; à défaut, celle de sa commune — la même
 * règle que sa fiche (« position de la commune »). Une commune homonyme d'une
 * autre province ne le déplace pas : la province tranche quand l'abri la porte.
 */
export function shelterLL(s: Pick<Shelter, "ll" | "ville" | "province">, cities: readonly City[]): { ll: LL; fromCity: boolean } | null {
  if (isLL(s.ll)) return { ll: s.ll, fromCity: false };
  const cle = s.ville.trim().toLocaleLowerCase("fr");
  if (!cle) return null;
  const memeNom = cities.filter((c) => c.v.trim().toLocaleLowerCase("fr") === cle);
  const ville = (s.province ? memeNom.find((c) => c.province === s.province) : undefined) ?? memeNom[0];
  return ville && isLL(ville.ll) ? { ll: ville.ll, fromCity: true } : null;
}

/** Position d'un site mortuaire : une morgue mobile se lit là où elle est déployée ; repliée, elle n'est pas sur la carte. */
export function morgueLL(m: Pick<MorgueSite, "kind" | "ll" | "deployment">): LL | null {
  if (m.kind === "mobile") return m.deployment && isLL(m.deployment.ll) ? m.deployment.ll : null;
  return isLL(m.ll) ? m.ll : null;
}

/** Un établissement dont le type est « campagne » se range avec les hôpitaux de campagne, pas dans son réseau. */
export function isFieldHospitalEntity(h: Pick<Hospital, "kind" | "nom">): boolean {
  return kindDef(hospKind(h)).campagne;
}

/** Un hôpital de campagne par son identifiant (`HDC-01`…) — ou par son nom, l'ancienne clé de la carte. */
export function findField(fieldHosps: readonly FieldHospital[], id: string): FieldHospital | undefined {
  return fieldHosps.find((f) => f.id === id) ?? fieldHosps.find((f) => f.nom === id);
}

/** La couche qui montre un élément — celle qu'« Afficher sur la carte » allume. */
export function layerOf(s: Pick<PositionSource, "hospitals">, kind: MarkerKind, id: string): keyof LayerState | null {
  switch (kind) {
    case "unit": return "units";
    case "field": return "field";
    case "morgue": return "morgues";
    case "shelter": return "shelters";
    case "inc": return "incidents";
    case "post": return "posts";
    case "placed": return "placed";
    case "trk": return "trackers";
    case "veh": return "vehicles";
    case "acft": return "aircraft";
    case "hosp": {
      const h = s.hospitals.find((x) => x.id === id);
      if (!h) return null;
      if (isFieldHospitalEntity(h)) return "field";
      return hospKind(h) === "mil" ? "hospitals" : "hospitalsCiv";
    }
  }
}

/** Position d'un élément de la carte ; `null` s'il n'en a pas — il n'y est alors pas dessiné. */
export function entityLL(s: PositionSource, kind: MarkerKind, id: string): LL | null {
  switch (kind) {
    case "inc": {
      const ll = s.mapIncidents.find((i) => i.id === id)?.ll;
      return isLL(ll) ? ll : null;
    }
    case "unit": {
      const ll = s.units.find((u) => u.id === id)?.ll;
      return isLL(ll) ? ll : null;
    }
    case "hosp": {
      const ll = s.hospitals.find((h) => h.id === id)?.ll;
      return isLL(ll) ? ll : null;
    }
    case "field": {
      const f = findField(s.fieldHosps, id);
      return f ? fieldLL(f) : null;
    }
    case "morgue": {
      const m = s.morgues.find((x) => x.id === id);
      return m ? morgueLL(m) : null;
    }
    case "shelter": {
      const a = s.shelters.find((x) => x.id === id);
      return a ? shelterLL(a, s.cities)?.ll ?? null : null;
    }
    case "trk": {
      const ll = s.trackers.find((x) => x.id === id)?.last?.ll;
      return isLL(ll) ? ll : null;
    }
    case "post": {
      const ll = s.posts.find((p) => p.id === id)?.ll;
      return isLL(ll) ? ll : null;
    }
    case "placed": {
      const ll = s.placed.find((p) => `${p.kind}:${p.id}` === id)?.position.ll;
      return isLL(ll) ? ll : null;
    }
    // Un convoi ou un aéronef bouge sans cesse : pas de position à viser.
    case "veh":
    case "acft":
      return null;
  }
}

/** Clé d'un marqueur dans le calcul d'écartement. */
export function markerKey(kind: MarkerKind, id: string): string {
  return `${kind}:${id}`;
}

/** Marqueurs plus proches que ce pas (~11 m) : « au même point ». */
const MEME_POINT = 1e4;
/** Écart minimal au centre : un marqueur fait ~34 px une fois agrandi — le voisin ne le chevauche pas. */
const RAYON_MIN = 34;

/**
 * Écarts en pixels des marqueurs posés au même point : le PREMIER de chaque
 * groupe (l'ordre d'appel fait la priorité) garde sa place exacte, les
 * autres se rangent en cercle autour. Un point seul n'a pas d'écart.
 */
export function spreadOffsets(points: readonly { key: string; ll: LL }[]): Map<string, [number, number]> {
  const groupes = new Map<string, string[]>();
  for (const p of points) {
    const g = `${Math.round(p.ll[0] * MEME_POINT)}:${Math.round(p.ll[1] * MEME_POINT)}`;
    const liste = groupes.get(g);
    if (liste) liste.push(p.key);
    else groupes.set(g, [p.key]);
  }
  const out = new Map<string, [number, number]>();
  for (const cles of groupes.values()) {
    const autour = cles.length - 1;
    if (autour < 1) continue;
    // Au-delà de six voisins, le cercle s'agrandit pour qu'ils ne se touchent pas.
    const r = Math.max(RAYON_MIN, (autour * RAYON_MIN) / (2 * Math.PI));
    cles.slice(1).forEach((k, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / autour;
      out.set(k, [Math.round(r * Math.cos(a)), Math.round(r * Math.sin(a))]);
    });
  }
  return out;
}

/**
 * Les écarts de TOUS les marqueurs DOM visibles, calculés ensemble — un abri
 * et un hôpital de campagne au même point s'écartent même s'ils vivent dans
 * deux couches. Priorité (qui garde sa place) : incident, poste, unité,
 * établissement, hôpital de campagne, site mortuaire, abri, ressource posée.
 */
export function mapMarkerOffsets(s: PositionSource & { layers: LayerState }): Map<string, [number, number]> {
  const L = s.layers;
  const pts: { key: string; ll: LL }[] = [];
  const push = (kind: MarkerKind, id: string, ll: LL | null | undefined) => {
    if (isLL(ll)) pts.push({ key: markerKey(kind, id), ll });
  };
  if (L.incidents) s.mapIncidents.forEach((i) => push("inc", i.id, i.ll));
  if (L.posts) s.posts.forEach((p) => push("post", p.id, p.ll));
  if (L.units) s.units.forEach((u) => push("unit", u.id, u.ll));
  s.hospitals.forEach((h) => {
    const couche = isFieldHospitalEntity(h) ? L.field : hospKind(h) === "mil" ? L.hospitals : L.hospitalsCiv;
    if (couche) push("hosp", h.id, h.ll);
  });
  if (L.field) s.fieldHosps.forEach((f) => push("field", f.id, fieldLL(f)));
  if (L.morgues) s.morgues.forEach((m) => push("morgue", m.id, morgueLL(m)));
  if (L.shelters) s.shelters.forEach((a) => push("shelter", a.id, shelterLL(a, s.cities)?.ll));
  if (L.placed) s.placed.forEach((p) => push("placed", `${p.kind}:${p.id}`, p.position.ll));
  return spreadOffsets(pts);
}
