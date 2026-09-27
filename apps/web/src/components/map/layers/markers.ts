// ============================================================================
// components/map/layers/markers.ts — marqueurs DOM (unités, hôpitaux, hôpitaux
// de campagne, incidents, postes, ressources posées, véhicules) et itinéraires
// d'animation des convois.
//
// Les marqueurs sont TENUS PAR CLÉ (`kind:id`) d'une passe à l'autre (ADR 0038) :
// une passe ne touche que ce qui a changé — le contenu d'un marqueur dont l'état
// ou la sélection change, la position de celui qui bouge, l'écart de ceux qui
// partagent un point — et retire ce qui a disparu. Avant, chaque sélection,
// chaque interrupteur et chaque rechargement temps réel détruisaient puis
// recréaient les ~200 marqueurs de la carte. Les véhicules avancent le long de
// leur route dans la boucle rAF.
// ============================================================================

import maplibregl from "maplibre-gl";
import { useArgos } from "@/lib/store";
import { hospKind } from "@/lib/hospitals";
import { fieldMarkerHTML, hospMarkerHTML, incMarkerHTML, placedMarkerHTML, postMarkerHTML, unitMarkerHTML, vehMarkerHTML, vehPos } from "@/lib/map/markers";
import { POST_FILL, postCaption, postCode } from "@/lib/posts";
import { PLACED_FILL, placeableResourceKinds } from "@/lib/edit";
import { entityLL, fieldLL, isFieldHospitalEntity, mapMarkerOffsets, markerKey } from "@/lib/map/positions";
import type { MarkerKind } from "@/lib/types";

export interface VehMarker {
  mk: maplibregl.Marker;
  routeIndex: number;
  /** Identifiant du convoi et contenu affiché : le marqueur est réutilisé d'une passe à l'autre. */
  id: string;
  html: string;
}

/** Un marqueur posé : ce qu'il affiche, où, avec quel écart, saisissable ou non. */
interface Pose {
  mk: maplibregl.Marker;
  html: string;
  ll: [number, number];
  offset: [number, number];
  draggable: boolean;
}

export class MarkersRuntime {
  /** Les marqueurs posés, par clé `kind:id` — réutilisés d'une passe à l'autre. */
  poses = new Map<string, Pose>();
  veh: VehMarker[] = [];
  /** Progression [0,1[ de chaque convoi sur sa route. */
  vehProg: number[] = [0.1, 0.45, 0.7];
}

/** Agrandit le contenu (lisibilité console/terrain) sans casser l'ancrage : l'élément positionné par MapLibre garde sa taille. */
function agrandir(el: HTMLElement): void {
  const inner = el.firstElementChild as HTMLElement | null;
  if (inner) inner.style.transform = "scale(1.4)";
}

/** Remplace le contenu d'un marqueur déjà posé (état, sélection), agrandissement compris. */
export function setMarkerHtml(el: HTMLElement, html: string): void {
  el.innerHTML = html;
  agrandir(el);
}

export function mkEl(html: string, kind: MarkerKind, id: string) {
  const el = document.createElement("div");
  el.innerHTML = html;
  el.style.cursor = "pointer";
  agrandir(el);
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    const st = useArgos.getState();
    // Outil d'itinéraire armé : le marqueur devient une étape, à sa position —
    // un itinéraire vers un hôpital se trace en cliquant l'hôpital (ADR 0039).
    if (st.routeOn) {
      const ll = entityLL(st, kind, id);
      if (ll) {
        st.addRoutePt(ll);
        return;
      }
    }
    st.select(kind, id);
  });
  return el;
}

/**
 * Écarts des marqueurs posés au même point (voir `mapMarkerOffsets`) : passés
 * par MapCanvas, qui les calcule une fois pour ces marqueurs ET pour ceux des
 * sites mortuaires et des abris — un abri et un hôpital de campagne au même
 * point s'écartent même s'ils vivent dans deux registres.
 */
export type MarkerOffsets = ReadonlyMap<string, [number, number]>;

/**
 * Empilement des familles. Quand tout était recréé à chaque passe, l'ordre de
 * pose le fixait ; les marqueurs survivant désormais d'une passe à l'autre, un
 * z-index le garde tel quel — le civil sous le militaire, les incidents
 * au-dessus des établissements, les postes et les ressources posées au-dessus.
 */
const ETAGE = { unit: 1, hospCiv: 2, hospMil: 3, field: 4, inc: 5, post: 6, placed: 7, veh: 8 } as const;

const SANS_ECART: [number, number] = [0, 0];
const memeLL = (a: [number, number], b: [number, number]) => a[0] === b[0] && a[1] === b[1];

export function syncMarkers(rt: MarkersRuntime, map: maplibregl.Map | null, offsets?: MarkerOffsets) {
  if (!map) return;
  const state = useArgos.getState();
  const L = state.layers;
  const sm = state.selMarker;
  const isSel = (kind: MarkerKind, id: string) => !!sm && sm.kind === kind && sm.id === id;
  const ecarts = offsets ?? mapMarkerOffsets(state);
  const vus = new Set<string>();

  /**
   * Pose ou met à jour le marqueur `kind:id`. Un marqueur qu'on saisit (mode
   * édition) reste à sa place exacte, sans écart : lâché, il écrit sa position.
   */
  const poser = (
    kind: MarkerKind,
    id: string,
    ll: [number, number],
    html: string,
    etage: number,
    opts: { draggable?: boolean; cursor?: string; onDragEnd?: (ll: [number, number]) => void } = {},
  ) => {
    const cle = markerKey(kind, id);
    vus.add(cle);
    const draggable = !!opts.draggable;
    const offset = draggable ? SANS_ECART : ecarts.get(cle) ?? SANS_ECART;
    let p = rt.poses.get(cle);
    // Passer en édition (ou en sortir) change la nature du marqueur : on le recrée.
    if (p && p.draggable !== draggable) {
      p.mk.remove();
      rt.poses.delete(cle);
      p = undefined;
    }
    if (!p) {
      const el = mkEl(html, kind, id);
      el.style.zIndex = String(etage);
      if (opts.cursor) el.style.cursor = opts.cursor;
      const mk = new maplibregl.Marker({ element: el, draggable, offset }).setLngLat(ll).addTo(map);
      if (opts.onDragEnd) {
        const fin = opts.onDragEnd;
        mk.on("dragend", () => {
          const { lng, lat } = mk.getLngLat();
          fin([lng, lat]);
        });
      }
      rt.poses.set(cle, { mk, html, ll, offset, draggable });
      return;
    }
    if (p.html !== html) {
      setMarkerHtml(p.mk.getElement(), html);
      p.html = html;
    }
    if (!memeLL(p.ll, ll)) {
      p.mk.setLngLat(ll);
      p.ll = ll;
    }
    if (!memeLL(p.offset, offset)) {
      p.mk.setOffset(offset);
      p.offset = offset;
    }
  };

  if (L.units) state.units.forEach((u) => poser("unit", u.id, u.ll, unitMarkerHTML(u, isSel("unit", u.id)), ETAGE.unit));
  // Santé : deux couches distinctes (militaire / civil) — le réseau civil
  // compte plus de cent établissements et se masque d'un seul interrupteur.
  // Le militaire, réseau de commandement, reste au-dessus du civil dans les
  // villes où les deux coexistent.
  // Un établissement dont le type est « campagne » se dessine avec les
  // hôpitaux de campagne : rangé dans le réseau civil, il restait invisible
  // tant que cette couche, masquée par défaut, n'était pas rallumée.
  const hosps = state.hospitals;
  const posterHosp = (h: (typeof hosps)[number], etage: number) => poser("hosp", h.id, h.ll, hospMarkerHTML(h, isSel("hosp", h.id)), etage);
  if (L.hospitalsCiv) hosps.filter((h) => !isFieldHospitalEntity(h) && hospKind(h) !== "mil").forEach((h) => posterHosp(h, ETAGE.hospCiv));
  if (L.hospitals) hosps.filter((h) => !isFieldHospitalEntity(h) && hospKind(h) === "mil").forEach((h) => posterHosp(h, ETAGE.hospMil));
  if (L.field) {
    hosps.filter(isFieldHospitalEntity).forEach((h) => posterHosp(h, ETAGE.field));
    // Clé : l'identifiant du détachement (`HDC-01`…) — deux détachements ne se confondent plus par leur nom.
    state.fieldHosps.forEach((f) => poser("field", f.id, fieldLL(f), fieldMarkerHTML(f, isSel("field", f.id)), ETAGE.field));
  }
  // Tout le monde voit l'incident sur la carte (ADR 0020) : la couche dessine
  // `mapIncidents`, pas la liste cantonnée du compte.
  if (L.incidents) state.mapIncidents.forEach((i) => poser("inc", i.id, i.ll, incMarkerHTML(i, isSel("inc", i.id)), ETAGE.inc));

  // Postes d'opération (lot #12). En mode édition, le marqueur se saisit et se
  // déplace ; lâché, il écrit sa nouvelle position. Hors mode, il se lit.
  if (L.posts) {
    const edit = state.mapEdit;
    const ctx = { shelters: state.shelters, units: state.units, responsables: state.responsables };
    state.posts.forEach((p) =>
      poser("post", p.id, p.ll, postMarkerHTML(postCode(p.kind, state.dict), POST_FILL[p.kind], isSel("post", p.id), postCaption(p, ctx)), ETAGE.post, {
        draggable: edit,
        cursor: edit ? "grab" : "pointer",
        onDragEnd: edit ? (ll) => void useArgos.getState().movePost(p.id, ll) : undefined,
      }),
    );
  }

  // Ressources sur le terrain (ADR 0018) : équipes, véhicules, équipements
  // posés par le TACOM et les cellules. En mode édition, celles que le rôle
  // pose se saisissent et se déplacent ; les autres se lisent.
  if (L.placed) {
    const edit = state.mapEdit;
    const mine = placeableResourceKinds(state.role);
    const code = (k: (typeof state.placed)[number]["kind"]) => (k === "teams" ? state.dict.pl_teams : k === "vehicles" ? state.dict.pl_vehicles : state.dict.pl_equipment).slice(0, 3).toUpperCase();
    state.placed.forEach((p) => {
      const key = `${p.kind}:${p.id}`;
      const draggable = edit && mine.includes(p.kind);
      // Une équipe posée écrit son chef à côté de son nom — comme l'unité son commandant.
      poser("placed", key, p.position.ll, placedMarkerHTML(code(p.kind), PLACED_FILL[p.kind], isSel("placed", key), p.leader ? `${p.label} · ${p.leader}` : p.label), ETAGE.placed, {
        draggable,
        cursor: draggable ? "grab" : "pointer",
        onDragEnd: draggable ? (ll) => void useArgos.getState().movePlaced(p.kind, p.id, ll) : undefined,
      });
    });
  }

  // Ce qui n'est plus à montrer (couche éteinte, élément retiré) quitte la carte.
  for (const [cle, p] of rt.poses) {
    if (!vus.has(cle)) {
      p.mk.remove();
      rt.poses.delete(cle);
    }
  }

  // Les convois aussi sont réutilisés, par identifiant : leur position avance à
  // chaque image (`animateVehicles`), seul leur contenu suit la sélection.
  const convois = new Set<string>();
  if (L.vehicles) {
    state.vehRoutes.forEach((v, routeIndex) => {
      convois.add(v.id);
      const html = vehMarkerHTML(v, isSel("veh", v.id));
      const deja = rt.veh.find((x) => x.id === v.id);
      if (deja) {
        deja.routeIndex = routeIndex;
        if (deja.html !== html) {
          setMarkerHtml(deja.mk.getElement(), html);
          deja.html = html;
        }
        return;
      }
      const el = mkEl(html, "veh", v.id);
      el.style.zIndex = String(ETAGE.veh);
      const mk = new maplibregl.Marker({ element: el }).setLngLat(vehPos(v.route, rt.vehProg[routeIndex])).addTo(map);
      rt.veh.push({ mk, routeIndex, id: v.id, html });
    });
  }
  rt.veh = rt.veh.filter((x) => {
    if (convois.has(x.id)) return true;
    x.mk.remove();
    return false;
  });

  // Les aéronefs ne passent PAS par ces marqueurs : ils bougent en continu et
  // ont leur propre registre, déplacé par `setLngLat`. Voir l'effet « suivi
  // aérien ».

  if (map.getLayer("routes-line")) {
    map.setLayoutProperty("routes-line", "visibility", L.vehicles ? "visible" : "none");
  }
}

/** Avance chaque convoi le long de sa route (appelé à chaque image). */
export function animateVehicles(rt: MarkersRuntime, dt: number): void {
  rt.veh.forEach(({ mk, routeIndex }) => {
    const v = useArgos.getState().vehRoutes[routeIndex];
    rt.vehProg[routeIndex] = (rt.vehProg[routeIndex] + v.speed * dt) % 1;
    mk.setLngLat(vehPos(v.route, rt.vehProg[routeIndex]));
  });
}

/** Ligne des itinéraires de convois (appelée par setupStyle ; idempotente). */
export function setupRoutesLayer(map: maplibregl.Map): void {
    if (!map.getSource("routes")) {
      map.addSource("routes", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: useArgos.getState().vehRoutes.map((v) => ({
            type: "Feature" as const,
            properties: { id: v.id },
            geometry: { type: "LineString" as const, coordinates: v.route },
          })),
        },
      });
      map.addLayer({
        id: "routes-line",
        type: "line",
        source: "routes",
        paint: { "line-color": "#C9A84C", "line-width": 4.5, "line-dasharray": [2, 2], "line-opacity": 0.95 },
      });
    }
}
