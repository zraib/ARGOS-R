"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useArgos, useDict } from "@/lib/store";
import { POST_DRAG_MIME, nearestIncident, parsePostPick } from "@/lib/posts";
import { RESOURCE_DRAG_MIME, parseResourcePick, type ResourcePick } from "@/lib/edit";
import { FLUX } from "@/lib/i18n/flux";
import { MAP_CENTER, MAP_STYLE, MAP_ZOOM } from "@/lib/map/style";
import { TILES_MODE } from "@/lib/map/tiles";
import { installPlanStyle, loadPlanStyle } from "@/lib/map/plan";
import { routeThrough, type RouteResult } from "@/lib/map/routing";
import { OVERLAY_STYLE } from "@/lib/map/overlay";
import { Icon } from "@/components/ui/Icon";
import { NAV_ICONS, UI_ICONS } from "@/lib/icons";
import { WeatherPopup } from "@/components/flux/WeatherPopup";
import { nearestCity } from "@/lib/map/cities";
import { demElevation } from "@/lib/map/canvas/dem";
import { WX_GRADIENT, WX_T_MAX, WX_T_MIN, wxDays, wxFmtTime } from "@/lib/map/canvas/weather-raster";
import { ACFT_POLL_MS, ACFT_FRAME_MS } from "@/lib/map/canvas/weather-render";

/** Cadence de relecture des traceurs : un boîtier émet toutes les 30 s en mouvement, un partage toutes les 20 s. */
const TRACKER_POLL_MS = 15_000;
import { apply3d, applyBase } from "@/components/map/layers/base";
import { MarkersRuntime, animateVehicles, setupRoutesLayer, syncMarkers } from "@/components/map/layers/markers";
import { applyAircraftTrails, dropAircraft, renderAircraft, setupAircraftTrailLayer, type AircraftRegistry } from "@/components/map/layers/aircraft";
import { pulseQuakes, quakePopup, setupQuakeLayers, syncQuakes } from "@/components/map/layers/quakes";
import { applyMissions, setupMissionLayers } from "@/components/map/layers/missions";
import { drawMeasure, setupMeasureLayer } from "@/components/map/layers/measure";
import {
  DRAW_FILL, DRAW_HANDLE, DRAW_LINE, DRAW_POINT,
  applyDraft, applyDrawings, clearDrawingLabels, createDrawingLabelsRuntime, setupDrawingLayers, syncDrawingLabels,
} from "@/components/map/layers/drawings";
import { canEditDrawing, distanceM } from "@/lib/map/drawings";
import type { Drawing } from "@/lib/types";
import { PlumeRuntime, applyPlume, playPlume, setupPlumeLayers } from "@/components/map/layers/plume";
import {
  FloodRuntime,
  applyFloodGauges,
  applyFloodMaps,
  applyFloodSeed,
  applyFloodSim,
  fitFloodExtent,
  focusFloodStart,
  playFlood,
  setupFloodLayers,
} from "@/components/map/layers/floods";
import { FireRuntime, applyFireSeed, applyFireSim, fitFireExtent, focusFireStart, playFire, setupFireLayers } from "@/components/map/layers/fire";
import { applyMorgues, setupMorgueLayers } from "@/components/map/layers/morgues";
import { applyShelters, setupShelterLayers } from "@/components/map/layers/shelters";
import { applyTrackers, setupTrackerLayers } from "@/components/map/layers/trackers";
import {
  WeatherRuntime,
  applyWeatherVisibility,
  loadNationalSeries,
  loadWorldSeries,
  mountWindCanvas,
  setupWeatherLayers,
  sizeWxsCanvas,
  syncCityVisibility,
  tickWeather,
} from "@/components/map/layers/weather";

/**
 * La carte opérationnelle (MapLibre).
 *
 * Ce composant tient la carte, ses contrôles et la boucle d'animation ; chaque
 * COUCHE vit dans `components/map/layers/` (marqueurs, aéronefs, séismes,
 * boucles opérationnelles, mesure, panache NRBC, météo) sous forme de fonctions
 * impératives qui reçoivent la carte et leur objet d'état — testables et
 * lisibles une par une. Les calculs purs sont dans `lib/map/canvas/`.
 */
/**
 * Pose une ressource sur le terrain à ce point (ADR 0018) : rattachée à
 * l'opération active la plus proche s'il y en a une, désarmée aussitôt — un
 * clic, une pose. L'API tranche ce que le rôle et le mode permettent.
 */
function placeResourceAt(pick: ResourcePick, ll: [number, number]): void {
  const st = useArgos.getState();
  st.armResource(null);
  const inc = nearestIncident(ll, st.mapIncidents);
  void st
    .placeResource(pick.kind, pick.id, ll, inc?.id)
    .then(() => st.showToast(st.dict.pl_placed_ok))
    .catch((err: unknown) => st.showToast(`${st.dict.toast_fail} — ${err instanceof Error ? err.message : String(err)}`));
}

export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const rafRef = useRef<number>(0);
  // Un objet d'état par couche : ce que le rendu garde entre deux images.
  const markersRt = useRef(new MarkersRuntime());
  const acftRegistry = useRef<AircraftRegistry>(new Map());
  const plumeRt = useRef(new PlumeRuntime());
  const wxRt = useRef(new WeatherRuntime());
  const floodRt = useRef(new FloodRuntime());
  const fireRt = useRef(new FireRuntime());
  const quakeBound = useRef(false); // handlers hover/clic de la couche séismes posés une fois
  const quakePopupRef = useRef<maplibregl.Popup | null>(null); // bandeau collé au séisme
  const [wxTimeIdx, setWxTimeIdx] = useState(0);
  const [wxPlaying, setWxPlaying] = useState(true);
  // --- menu contextuel (Maj + clic droit) + pop-up météo du point ---
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; ll: [number, number] } | null>(null);
  const [wxPopup, setWxPopup] = useState<{ ll: [number, number]; place: string | null } | null>(null);
  const role = useArgos((s) => s.role);
  const can = useArgos((s) => s.can);
  const openWizard = useArgos((s) => s.openWizard);
  // Coordonnées + altitude sous le curseur, écrites directement dans le DOM
  // (aucun re-rendu React à chaque mouvement de souris).
  const latRef = useRef<HTMLSpanElement | null>(null);
  const lngRef = useRef<HTMLSpanElement | null>(null);
  const altRef = useRef<HTMLSpanElement | null>(null);
  const altSeqRef = useRef(0);
  // Mode dessin (croquis) : l'outil armé, le croquis sélectionné, le tracé en cours.
  const drawings = useArgos((s) => s.drawings);
  const drawTool = useArgos((s) => s.drawTool);
  const drawSelected = useArgos((s) => s.drawSelected);
  const sessionMatricule = useArgos((s) => s.sessionUser?.matricule);
  // Un croquis se modifie sur la carte quand le mode dessin est ouvert ET qu'il est à ce compte (ou au Super Administrateur).
  const drawEditable = (d: Drawing) => drawTool !== null && canEditDrawing(d, role, sessionMatricule);
  const drawRt = useRef(createDrawingLabelsRuntime());
  const draftRef = useRef<[number, number][]>([]);
  // Une poignée en cours de glissement : quel croquis, quel rôle, quel sommet ; la copie qui suit la souris.
  const dragRef = useRef<{ id: string; role: string; index: number; draft: Drawing } | null>(null);
  // Outil de mesure : points saisis, itinéraire calculé, curseur en croix.
  const [measureOn, setMeasureOn] = useState(false);
  const [pts, setPts] = useState<[number, number][]>([]);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const measureOnRef = useRef(false);
  measureOnRef.current = measureOn;

  // abonnements qui doivent déclencher une re-synchro des marqueurs
  const layers = useArgos((s) => s.layers);
  const selMarker = useArgos((s) => s.selMarker);
  const incidents = useArgos((s) => s.incidents);
  const fieldHosps = useArgos((s) => s.fieldHosps);
  // Postes d'opération (lot #12) : la liste ET le mode — un poste devient
  // saisissable quand le mode s'allume, il faut donc rebâtir les marqueurs.
  const posts = useArgos((s) => s.posts);
  const placed = useArgos((s) => s.placed);
  const mapIncidents = useArgos((s) => s.mapIncidents);
  const armedResource = useArgos((s) => s.armedResource);
  const mapEdit = useArgos((s) => s.mapEdit);
  const armedPost = useArgos((s) => s.armedPost);
  const map3d = useArgos((s) => s.map3d);
  const mapSat = useArgos((s) => s.mapSat);
  // Couche sismique (EMSC) : points colorés/dimensionnés par magnitude.
  const quakes = useArgos((s) => s.quakes);
  const quakesOn = useArgos((s) => s.quakesOn);
  const quakeFocus = useArgos((s) => s.quakeFocus);
  const focusQuake = useArgos((s) => s.focusQuake);
  const incidentFocus = useArgos((s) => s.incidentFocus);
  const incidentFocusAt = useArgos((s) => s.incidentFocusAt);
  const focusIncident = useArgos((s) => s.focusIncident);
  const mapCenterRequest = useArgos((s) => s.mapCenterRequest);
  const setMapCenter = useArgos((s) => s.setMapCenter);
  const quakeSelected = useArgos((s) => s.quakeSelected);
  // Boucles opérationnelles (ADR 0007, P1-c) : liens unité → incident.
  const missionInbox = useArgos((s) => s.missionInbox);
  const missionOutbox = useArgos((s) => s.missionOutbox);
  // Panache NRBC (ADR 0005) : données + style de combinaison des référentiels.
  const plumeData = useArgos((s) => s.plumeData);
  const plumeModels = useArgos((s) => s.plumeModels);
  const plumeEnvelope = useArgos((s) => s.plumeEnvelope);
  const plumeIncidentId = useArgos((s) => s.plumeIncidentId);
  const plumeSteps = useArgos((s) => s.plumeSteps);
  const plumePlaying = useArgos((s) => s.plumePlaying);
  const plume3d = useArgos((s) => s.plume3d);
  const plumeSmoke = useArgos((s) => s.plumeSmoke);
  const plumeVigilance = useArgos((s) => s.plumeVigilance);
  // --- crues : jauges Flood Hub, cartes d'inondation, simulateur (ADR 0010) ---
  const floodGauges = useArgos((s) => s.floodGauges);
  const floodGaugesOn = useArgos((s) => s.floodGaugesOn);
  const floodSel = useArgos((s) => s.floodSel);
  const floodPolygons = useArgos((s) => s.floodPolygons);
  const floodMapsOn = useArgos((s) => s.floodMapsOn);
  const floodSeed = useArgos((s) => s.floodSeed);
  const floodSim = useArgos((s) => s.floodSim);
  const floodFrames = useArgos((s) => s.floodFrames);
  const floodDone = useArgos((s) => s.floodDone);
  const floodProgress = useArgos((s) => s.floodProgress);
  const floodPlaying = useArgos((s) => s.floodPlaying);
  const floodArming = useArgos((s) => s.floodArming);
  // --- feux de forêt : point d'allumage et front simulé (ADR 0011) ---
  const fireSeed = useArgos((s) => s.fireSeed);
  const fireSim = useArgos((s) => s.fireSim);
  const fireFrames = useArgos((s) => s.fireFrames);
  const fireDone = useArgos((s) => s.fireDone);
  const fireProgress = useArgos((s) => s.fireProgress);
  const firePlaying = useArgos((s) => s.firePlaying);
  const fireArming = useArgos((s) => s.fireArming);
  const morgues = useArgos((s) => s.morgues);
  const shelters = useArgos((s) => s.shelters);
  const trackers = useArgos((s) => s.trackers);
  const wxGrid = useArgos((s) => s.wxGrid);
  const wxWorld = useArgos((s) => s.wxWorld);
  const wxLayers = useArgos((s) => s.wxLayers);
  const lang = useArgos((s) => s.lang);
  const t = useDict();

  /** Le pas horaire affiché suit la boucle d'animation et les chargements de grille. */
  const onWxStep = (i: number) => setWxTimeIdx(i);

  // --- initialisation de la carte (une fois) ---
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      // Clone profond : MapLibre MUTE l'objet style qu'on lui passe — réutiliser
      // le module MAP_STYLE tel quel casse toute reconstruction de la carte
      // (remontage React/Fast Refresh → carte sans style).
      style: structuredClone(MAP_STYLE),
      center: MAP_CENTER,
      zoom: MAP_ZOOM,
      pitch: 0,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    const wx = wxRt.current;
    mountWindCanvas(wx, map, containerRef.current);
    // Diagnostic dev : trace les erreurs internes MapLibre (style, sources) —
    // les 403 de tuiles sont attendus sous étranglement CDN, le reste non.
    if (process.env.NODE_ENV !== "production") {
      map.on("error", (e) => console.error("[MapLibre]", (e as { error?: Error }).error?.message ?? e));
    }
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");

    // Bouton « recentrer » ajouté sous la boussole (revient au cadrage national).
    const centerCtrl: maplibregl.IControl = {
      onAdd() {
        const div = document.createElement("div");
        div.className = "maplibregl-ctrl maplibregl-ctrl-group";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.title = "Recentrer";
        btn.setAttribute("aria-label", "Recentrer");
        btn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin:auto"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><path d="M12 1.5v3 M12 19.5v3 M1.5 12h3 M19.5 12h3"/></svg>`;
        btn.addEventListener("click", () => map.easeTo({ center: MAP_CENTER, zoom: MAP_ZOOM, pitch: 0, bearing: 0, duration: 900 }));
        div.appendChild(btn);
        return div;
      },
      onRemove() {},
    };
    map.addControl(centerCtrl, "bottom-right");

    // (Maj + clic droit : géré par onContextMenu sur le conteneur React —
    // indépendant du pipeline d'événements interne de MapLibre.)

    // Lecture continue de la position du curseur (+ altitude via le MNT).
    // Polygone terminé : au double-clic, ou sur le premier sommet.
    const finishPolygon = () => {
      const st = useArgos.getState();
      const coords = draftRef.current;
      draftRef.current = [];
      applyDraft(map, null, [], null);
      if (coords.length < 3) return;
      void st.createDrawing({ kind: "polygon", label: st.dict.dr_new_polygon, coords }).then((d) => d && st.showToast(st.dict.dr_created));
      st.setDrawTool("select");
    };
    map.on("dblclick", (e) => {
      const tool = useArgos.getState().drawTool;
      if (tool !== "polygon" || draftRef.current.length < 2) return;
      e.preventDefault();
      // Le double-clic a déjà ajouté son sommet au premier clic : on le garde.
      finishPolygon();
    });
    // Une poignée du croquis sélectionné : la saisir déplace le sommet, le centre ou le rayon.
    map.on("mousedown", DRAW_HANDLE, (e) => {
      const f = e.features?.[0];
      const id = f?.properties?.id;
      const st = useArgos.getState();
      const d = typeof id === "string" ? st.drawings.find((x) => x.id === id) : undefined;
      if (!f || !d || !st.drawTool || !canEditDrawing(d, st.role, st.sessionUser?.matricule)) return;
      e.preventDefault();
      map.dragPan.disable();
      dragRef.current = { id: d.id, role: String(f.properties?.role), index: Number(f.properties?.index ?? 0), draft: structuredClone(d) };
      map.getCanvas().style.cursor = "grabbing";
    });
    map.on("mouseup", () => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      map.dragPan.enable();
      map.getCanvas().style.cursor = "";
      const st = useArgos.getState();
      const patch: { coords?: [number, number][]; radiusM?: number } = drag.role === "radius" ? { radiusM: drag.draft.radiusM } : { coords: drag.draft.coords };
      void st.updateDrawing(drag.id, patch);
      // Le clic qui suit le relâchement ne doit pas désélectionner.
      window.setTimeout(() => {
        dragRef.current = null;
      }, 0);
    });
    map.on("mousemove", (e) => {
      const drag = dragRef.current;
      if (drag) {
        const ll: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        if (drag.role === "radius") drag.draft.radiusM = Math.max(1, Math.round(distanceM(drag.draft.coords[0], ll)));
        else if (drag.role === "center") drag.draft.coords = [ll];
        else drag.draft.coords = drag.draft.coords.map((c, i) => (i === drag.index ? ll : c));
        const st = useArgos.getState();
        applyDrawings(map, st.drawings.map((d) => (d.id === drag.id ? drag.draft : d)), drag.id, () => true);
        return;
      }
      const tool = useArgos.getState().drawTool;
      if ((tool === "polygon" || tool === "circle") && draftRef.current.length > 0) applyDraft(map, tool, draftRef.current, [e.lngLat.lng, e.lngLat.lat]);
      if (latRef.current) latRef.current.textContent = `${e.lngLat.lat.toFixed(5)}°`;
      if (lngRef.current) lngRef.current.textContent = `${e.lngLat.lng.toFixed(5)}°`;
      // Altitude : échantillon MNT (asynchrone, tuiles mises en cache).
      const seq = ++altSeqRef.current;
      void demElevation(e.lngLat.lng, e.lngLat.lat).then((alt) => {
        if (seq !== altSeqRef.current || !altRef.current) return; // résultat périmé
        altRef.current.textContent = alt == null ? "—" : `${Math.round(alt)} m`;
      });
    });

    // Clic sur la carte : en mode mesure → ajoute un point ; sinon → sélectionne
    // un séisme si le clic tombe sur un marqueur (bandeau de détail).
    map.on("click", (e) => {
      // Mode dessin : l'outil armé décide de ce que fait le clic.
      const tool = useArgos.getState().drawTool;
      if (tool) {
        if (dragRef.current) return;
        const ll: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        const st = useArgos.getState();
        const pixelsTo = (p: [number, number]) => {
          const a = map.project(p);
          return Math.hypot(a.x - e.point.x, a.y - e.point.y);
        };
        if (tool === "select") {
          const layers = [DRAW_POINT, DRAW_LINE, DRAW_FILL].filter((l) => map.getLayer(l));
          const hit = layers.length ? map.queryRenderedFeatures(e.point, { layers })[0] : undefined;
          const id = hit?.properties?.id;
          st.selectDrawing(typeof id === "string" ? id : null);
          return;
        }
        if (tool === "point") {
          void st.createDrawing({ kind: "point", label: st.dict.dr_new_point, coords: [ll] }).then((d) => d && st.showToast(st.dict.dr_created));
          st.setDrawTool("select");
          return;
        }
        if (tool === "circle") {
          if (draftRef.current.length === 0) {
            draftRef.current = [ll];
            applyDraft(map, "circle", draftRef.current, ll);
            return;
          }
          const center = draftRef.current[0];
          const r = Math.max(1, distanceM(center, ll));
          draftRef.current = [];
          applyDraft(map, null, [], null);
          void st.createDrawing({ kind: "circle", label: st.dict.dr_new_circle, coords: [center], radiusM: Math.round(r) }).then((d) => d && st.showToast(st.dict.dr_created));
          st.setDrawTool("select");
          return;
        }
        // Polygone : un sommet de plus ; un clic sur le premier sommet (≥ 3) ferme.
        if (draftRef.current.length >= 3 && pixelsTo(draftRef.current[0]) < 12) {
          finishPolygon();
          return;
        }
        draftRef.current = [...draftRef.current, ll];
        applyDraft(map, "polygon", draftRef.current, ll);
        return;
      }
      // Un chip de la boîte à outils est armé : ce clic pose le poste ici.
      const armed = useArgos.getState().armedPost;
      if (armed) {
        useArgos.getState().setPendingPost({ ...armed, ll: [e.lngLat.lng, e.lngLat.lat] });
        useArgos.getState().armPost(null);
        return;
      }
      // Une ressource est armée : ce clic la pose sur le terrain (ADR 0018).
      const armedRes = useArgos.getState().armedResource;
      if (armedRes) {
        placeResourceAt(armedRes, [e.lngLat.lng, e.lngLat.lat]);
        return;
      }
      // Le simulateur d'inondation attend son point de départ : ce clic le pose.
      if (useArgos.getState().floodArming) {
        useArgos.getState().setFloodSeed([e.lngLat.lng, e.lngLat.lat]);
        useArgos.getState().setFloodArming(false);
        return;
      }
      // Le simulateur de feu attend son point d'allumage : ce clic le pose.
      if (useArgos.getState().fireArming) {
        useArgos.getState().setFireSeed([e.lngLat.lng, e.lngLat.lat]);
        return;
      }
      // Une jauge de crue sous le clic : sa fiche (prévision, seuils, cartes).
      if (map.getLayer("flood-gauges-circle")) {
        const jauge = map.queryRenderedFeatures(e.point, { layers: ["flood-gauges-circle"] })[0];
        const gid = jauge?.properties?.gaugeId;
        if (typeof gid === "string") {
          useArgos.getState().selectFloodGauge(gid);
          return;
        }
      }
      if (measureOnRef.current) {
        setPts((prev) => [...prev, [e.lngLat.lng, e.lngLat.lat]]);
        return;
      }
      if (!map.getLayer("quakes-circle")) return;
      const hit = map.queryRenderedFeatures(e.point, { layers: ["quakes-circle"] })[0];
      const id = hit?.properties?.id;
      if (typeof id === "string") {
        const q = useArgos.getState().quakes.find((x) => x.id === id);
        if (q) useArgos.getState().selectQuake(q);
      }
    });

    // Les marqueurs sont des surcouches DOM indépendantes du chargement des

    // Les marqueurs sont des surcouches DOM indépendantes du chargement des
    // tuiles : on les ajoute tout de suite — la carte reste utilisable même là où
    // les tuiles de fond externes sont lentes ou injoignables (air-gap, réseaux restreints).
    // La nappe volumique apparaît/disparaît avec l'inclinaison : on écoute
    // la fin de mouvement de caméra plutôt que chaque frame.
    map.on("pitchend", () => applyPlume(plumeRt.current, map));
    readyRef.current = true;
    syncMarkers(markersRt.current, map);

    // Boucle d'animation : convois, pulsation sismique, étiquettes de villes,
    // défilement météo. Une seule rAF pour toute la carte.
    let last = performance.now();
    let lastPulse = 0;
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      animateVehicles(markersRt.current, dt);
      // Pulsation « ping sonar » + étiquettes de villes (throttle ~15 fps).
      if (now - lastPulse > 66) {
        lastPulse = now;
        const m = mapRef.current;
        if (m) {
          pulseQuakes(m, now);
          syncCityVisibility(wx, m);
        }
      }
      tickWeather(wx, mapRef.current, dt, now, onWxStep);
      rafRef.current = requestAnimationFrame(step);
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);

    // La ligne d'itinéraires + terrain + bascules de fond ont besoin du style
    // analysé. On s'accroche au premier signal de disponibilité (`styledata` se
    // déclenche sans tuiles).
    //
    // UNE SEULE FOIS. `styledata` se déclenche à CHAQUE changement de style —
    // y compris ceux que setupStyle provoque lui-même (terrain, visibilités).
    // Rejouer setupStyle à chaque `styledata` rebouclait sur ces changements :
    // la carte rendait 2 images par seconde et la caméra ne s'arrêtait plus.
    // Dès que les couches sont posées, le filet est retiré.
    let styleInstalle = false;
    const setupStyle = () => {
      if (styleInstalle) return;
      // Seul le style JSON doit être prêt (getStyle) — PAS les tuiles
      // (isStyleLoaded) : sous étranglement du CDN, isStyleLoaded peut rester
      // faux très longtemps alors qu'addSource fonctionne déjà. Un appel trop
      // précoce lève « Style is not done loading » : attrapé par trySetup,
      // retenté par le filet.
      if (!map.getStyle()) return;
      // Accès console dev : seule l'instance VIVANTE arrive ici (les doubles
      // montages StrictMode sont retirés avant que leur style ne charge).
      if (process.env.NODE_ENV !== "production") {
        (window as unknown as { __map?: maplibregl.Map }).__map = map;
      }
      // L'ORDRE compte : il fixe l'empilement des couches (routes, boucles,
      // mesure, météo sous les repères, séismes, panache).
      setupRoutesLayer(map);
      setupMissionLayers(map);
      setupMeasureLayer(map);
      setupDrawingLayers(map);
      setupWeatherLayers(wx, map);
      setupQuakeLayers(map, () => measureOnRef.current, quakeBound);
      setupPlumeLayers(plumeRt.current, map);
      setupFloodLayers(map);
      setupFireLayers(map);
      setupMorgueLayers(map);
      setupShelterLayers(map);
      setupTrackerLayers(map);
      setupAircraftTrailLayer(map);
      const st = useArgos.getState();
      applyAircraftTrails(map, st.aircraft, st.layers.aircraft);
      applyMorgues(map, st.morgues, st.layers.morgues, st.selMarker?.kind === "morgue" ? st.selMarker.id : null);
      applyDrawings(map, st.drawings, st.drawSelected, (d) => st.drawTool !== null && canEditDrawing(d, st.role, st.sessionUser?.matricule));
      applyShelters(map, st.shelters, st.layers.shelters, st.selMarker?.kind === "shelter" ? st.selMarker.id : null);
      applyTrackers(map, st.trackers, st.layers.trackers);
      applyFireSeed(map, st.fireSeed);
      applyFireSim(fireRt.current, map, st.fireSim, st.fireProgress, st.firePlaying);
      applyFloodGauges(map, st.floodGauges, st.floodGaugesOn, st.floodSel);
      applyFloodMaps(map, st.floodPolygons, st.floodMapsOn);
      applyFloodSeed(map, st.floodSeed);
      applyFloodSim(floodRt.current, map, st.floodSim, st.floodProgress, st.floodPlaying);
      map.setLayoutProperty("routes-line", "visibility", st.layers.vehicles ? "visible" : "none");
      applyBase(map, st.mapSat);
      apply3d(map, st.map3d);
      // Tout est posé : plus de re-tentative, plus d'écoute de `styledata`.
      styleInstalle = true;
      map.off("styledata", trySetup);
      clearInterval(setupTimer);
    };
    // isStyleLoaded peut basculer entre la garde et un addSource (tuiles en
    // re-tentative) : toute exécution est enveloppée, le filet retente.
    const trySetup = () => { try { setupStyle(); } catch { /* style pas prêt — retenté par le filet */ } };
    // Filet : quand le CDN de tuiles étrangle (403 en re-tentative), « load »
    // peut ne jamais venir alors que le style est prêt et que « styledata » est
    // passé trop tôt. On retente toutes les 600 ms jusqu'à ce que les couches
    // soient réellement posées ; setupStyle arrête lui-même le filet.
    const setupTimer = setInterval(trySetup, 600);
    if (map.isStyleLoaded()) trySetup();
    else {
      map.on("styledata", trySetup);
      map.once("load", trySetup);
    }

    // Mode externe : le fond « plan » et les repères sont des tuiles
    // vectorielles stylées par nos soins (frontières contestées non tracées —
    // ADR 0014). Le style distant arrive quand il arrive : il s'insère sous
    // les couches déjà posées, puis la bascule de fond est rejouée.
    if (TILES_MODE === "external") {
      // Les étiquettes vectorielles portent aussi l'arabe : sans le greffon de
      // mise en forme (bidi, ligatures) MapLibre l'écrit à l'envers. Le greffon
      // est AUTO-HÉBERGÉ (public/vendor, copié par scripts/vendor.mjs) et
      // chargé à la demande dans le worker de la carte.
      if (maplibregl.getRTLTextPluginStatus() === "unavailable") {
        void maplibregl.setRTLTextPlugin("/vendor/mapbox-gl-rtl-text.js", true).catch((e: unknown) => {
          console.warn("[carte] greffon RTL indisponible :", e instanceof Error ? e.message : e);
        });
      }
      void loadPlanStyle().then((plan) => {
        if (!plan || mapRef.current !== map) return;
        const poser = () => {
          if (!map.getStyle()) return false;
          installPlanStyle(map, plan);
          applyBase(map, useArgos.getState().mapSat);
          return true;
        };
        if (!poser()) map.once("styledata", () => void poser());
      });
    }

    // Le conteneur change de taille (plein écran, repli du rail) → resize du canvas.
    const ro = new ResizeObserver(() => { mapRef.current?.resize(); sizeWxsCanvas(wx, containerRef.current); });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      clearInterval(setupTimer);
      cancelAnimationFrame(rafRef.current);
      readyRef.current = false;
      wx.cities.forEach((c) => c.mk.remove());
      wx.cities = [];
      wx.wxsCv?.remove();
      wx.wxsCv = null;
      map.remove();
      // Ne pas laisser l'accès console dev pointer sur une instance retirée
      // (double-montage StrictMode).
      const w = window as unknown as { __map?: maplibregl.Map };
      if (w.__map === map) delete w.__map;
      mapRef.current = null;
      markersRt.current.markers = [];
      markersRt.current.veh = [];
      clearDrawingLabels(drawRt.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- croquis : formes, poignées et étiquettes suivent l'état ; Échap annule un tracé ---
  useEffect(() => {
    void useArgos.getState().loadDrawings();
    // Les simulations partagées : ce poste les rejoue (ADR 0029).
    void useArgos.getState().loadSimulations();
  }, []);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    applyDrawings(map, drawings, drawSelected, drawEditable);
    syncDrawingLabels(
      drawRt.current,
      map,
      drawings,
      drawSelected,
      drawEditable,
      (id) => {
        const st = useArgos.getState();
        if (!st.drawTool) st.setDrawTool("select");
        st.selectDrawing(id);
      },
      (d, ll) => {
        // Un point suit son étiquette ; une forme garde sa place, seule l'étiquette bouge.
        void useArgos.getState().updateDrawing(d.id, d.kind === "point" ? { coords: [ll] } : { labelLL: ll });
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawings, drawSelected, drawTool, role, sessionMatricule, mapSat, map3d]);
  useEffect(() => {
    const map = mapRef.current;
    if (map && !drawTool) {
      draftRef.current = [];
      applyDraft(map, null, [], null);
    }
    if (!drawTool || drawTool === "select") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      draftRef.current = [];
      applyDraft(mapRef.current, null, [], null);
      useArgos.getState().setDrawTool("select");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawTool]);

  // --- re-synchro des marqueurs si données / sélection / couche changent ---
  useEffect(() => {
    if (readyRef.current) syncMarkers(markersRt.current, mapRef.current);
  }, [layers, selMarker, incidents, mapIncidents, fieldHosps, posts, placed, mapEdit]);

  // Chip armé, ou point de départ d'une inondation attendu : le curseur le dit avant le clic.
  useEffect(() => {
    const canvas = mapRef.current?.getCanvas();
    const dessin = drawTool && drawTool !== "select";
    if (canvas) canvas.style.cursor = armedPost || armedResource || floodArming || fireArming || dessin ? "crosshair" : "";
  }, [armedPost, armedResource, floodArming, fireArming, drawTool]);

  // --- suivi aérien : interrogation du flux ---
  // Le minuteur s'arrête dès que la couche est masquée, pour ne pas consommer
  // de quota au profit d'une carte que personne ne regarde.
  useEffect(() => {
    if (!layers.aircraft) return;
    const load = () => void useArgos.getState().loadAircraft();
    load();
    const timer = window.setInterval(load, ACFT_POLL_MS);
    return () => window.clearInterval(timer);
  }, [layers.aircraft]);

  // --- suivi aérien : marqueurs propres + navigation à l'estime ---
  // Le flux public ne livre un point que toutes les 10 s environ : on avance
  // la position estimée à cadence d'affichage entre deux contacts. L'effet ne
  // dépend QUE de la visibilité de la couche : la boucle relit le magasin.
  useEffect(() => {
    const map = mapRef.current;
    const registry = acftRegistry.current;
    if (!map || !layers.aircraft) {
      dropAircraft(registry);
      return;
    }
    const render = () => renderAircraft(map, registry);
    render();
    const timer = window.setInterval(render, ACFT_FRAME_MS);
    return () => {
      window.clearInterval(timer);
      dropAircraft(registry);
    };
  }, [layers.aircraft]);

  // --- recentrage/zoom sur l'élément sélectionné (ex. « voir sur la carte ») ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selMarker) return;
    const st = useArgos.getState();
    const ll =
      selMarker.kind === "inc" ? st.mapIncidents.find((i) => i.id === selMarker.id)?.ll
      : selMarker.kind === "unit" ? st.units.find((u) => u.id === selMarker.id)?.ll
      : selMarker.kind === "hosp" ? st.hospitals.find((h) => h.id === selMarker.id)?.ll
      : selMarker.kind === "morgue" ? st.morgues.find((x) => x.id === selMarker.id)?.ll
      : selMarker.kind === "shelter" ? st.shelters.find((x) => x.id === selMarker.id)?.ll
      : selMarker.kind === "trk" ? st.trackers.find((x) => x.id === selMarker.id)?.last?.ll
      : undefined;
    if (ll) map.flyTo({ center: ll, zoom: Math.max(map.getZoom(), 10.5), duration: 1200 });
  }, [selMarker]);

  // --- bascules terrain 3D et fond (satellite / plan) ---
  useEffect(() => {
    if (readyRef.current) apply3d(mapRef.current, map3d);
  }, [map3d]);
  useEffect(() => {
    if (readyRef.current) applyBase(mapRef.current, mapSat);
  }, [mapSat]);

  // --- couche sismique : mise à jour des données + visibilité ---
  useEffect(() => {
    const map = mapRef.current;
    if (map && readyRef.current) syncQuakes(map, quakes, quakesOn);
  }, [quakes, quakesOn]);

  // --- boucles opérationnelles : redessinées à chaque évolution ---
  useEffect(() => {
    if (readyRef.current) applyMissions(mapRef.current);
  }, [missionInbox, missionOutbox, incidents, layers]);

  // --- LECTURE ANIMÉE du panache (lot V1) ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    return playPlume(plumeRt.current, map, plumePlaying, plumeSteps);
  }, [plumePlaying, plumeSteps]);

  // --- panache NRBC : données + style au fil des choix de l'opérateur ---
  // `plumeSmoke` et `plumeVigilance` sont des directives d'AFFICHAGE : elles ne
  // changent pas les données, mais doivent repasser par `applyPlume` pour que
  // les filtres de couche et la nappe soient recalculés.
  useEffect(() => {
    if (readyRef.current) applyPlume(plumeRt.current, mapRef.current);
  }, [plumeData, plumeModels, plumeEnvelope, plumeIncidentId, plume3d, plumeSmoke, plumeVigilance]);

  // --- crues : jauges, cartes d'inondation, point de départ et emprise simulée ---
  useEffect(() => {
    if (readyRef.current) applyFloodGauges(mapRef.current, floodGauges, floodGaugesOn, floodSel);
  }, [floodGauges, floodGaugesOn, floodSel]);
  useEffect(() => {
    if (readyRef.current) applyFloodMaps(mapRef.current, floodPolygons, floodMapsOn);
  }, [floodPolygons, floodMapsOn]);
  useEffect(() => {
    if (readyRef.current) applyFloodSeed(mapRef.current, floodSeed);
  }, [floodSeed]);
  // L'eau simulée suit la course (ses images arrivent au fil du calcul) et,
  // hors lecture, le curseur du panneau ; la lecture elle-même tourne en
  // boucle d'animation et publie l'avancement — l'effet ne repeint pas
  // derrière elle. Une course qui démarre amène la carte sur son point de
  // départ ; finie, elle encadre l'eau si elle est sortie du champ.
  useEffect(() => {
    if (!readyRef.current) return;
    if (floodPlaying) applyFloodSim(floodRt.current, mapRef.current, floodSim, useArgos.getState().floodProgress, true);
    else applyFloodSim(floodRt.current, mapRef.current, floodSim, floodProgress, false);
  }, [floodSim, floodFrames, floodProgress, floodPlaying]);
  useEffect(() => {
    if (readyRef.current) return playFlood(floodRt.current, mapRef.current, floodSim, floodPlaying);
  }, [floodSim, floodPlaying]);
  useEffect(() => {
    if (readyRef.current && floodSim) focusFloodStart(mapRef.current, useArgos.getState().floodSeed);
  }, [floodSim]);
  useEffect(() => {
    if (readyRef.current && floodDone) fitFloodExtent(mapRef.current, floodSim);
  }, [floodDone, floodSim]);

  // --- sites mortuaires : une couche, un interrupteur ---
  useEffect(() => {
    if (readyRef.current) applyMorgues(mapRef.current, morgues, layers.morgues, selMarker?.kind === "morgue" ? selMarker.id : null);
  }, [morgues, layers.morgues, selMarker]);

  // --- trajectoires des aéronefs (ADR 0016) : redessinées à chaque relevé ---
  const aircraftStates = useArgos((s) => s.aircraft);
  useEffect(() => {
    if (readyRef.current) applyAircraftTrails(mapRef.current, aircraftStates, layers.aircraft);
  }, [aircraftStates, layers.aircraft]);

  // --- abris d'hébergement : même mécanique (ADR 0015) ---
  useEffect(() => {
    if (readyRef.current) applyShelters(mapRef.current, shelters, layers.shelters, selMarker?.kind === "shelter" ? selMarker.id : null);
  }, [shelters, layers.shelters, selMarker]);

  // --- traceurs et positions partagées : relus tant que la couche est visible ---
  useEffect(() => {
    if (!layers.trackers) return;
    const load = () => void useArgos.getState().loadTrackers();
    load();
    const timer = window.setInterval(load, TRACKER_POLL_MS);
    return () => window.clearInterval(timer);
  }, [layers.trackers]);
  useEffect(() => {
    if (readyRef.current) applyTrackers(mapRef.current, trackers, layers.trackers);
  }, [trackers, layers.trackers]);

  // --- feux de forêt : même mécanique que l'eau, sur sa propre couche ---
  useEffect(() => {
    if (readyRef.current) applyFireSeed(mapRef.current, fireSeed);
  }, [fireSeed]);
  useEffect(() => {
    if (!readyRef.current) return;
    if (firePlaying) applyFireSim(fireRt.current, mapRef.current, fireSim, useArgos.getState().fireProgress, true);
    else applyFireSim(fireRt.current, mapRef.current, fireSim, fireProgress, false);
  }, [fireSim, fireFrames, fireProgress, firePlaying]);
  useEffect(() => {
    if (readyRef.current) return playFire(fireRt.current, mapRef.current, fireSim, firePlaying);
  }, [fireSim, firePlaying]);
  useEffect(() => {
    if (readyRef.current && fireSim) focusFireStart(mapRef.current, useArgos.getState().fireSeed);
  }, [fireSim]);
  useEffect(() => {
    if (readyRef.current && fireDone) fitFireExtent(mapRef.current, fireSim);
  }, [fireDone, fireSim]);

  // --- grilles météo : nationale dense, mondiale, visibilité des couches ---
  useEffect(() => {
    loadNationalSeries(wxRt.current, mapRef.current, wxGrid, onWxStep);
  }, [wxGrid]);
  useEffect(() => {
    loadWorldSeries(wxRt.current, mapRef.current, wxWorld);
  }, [wxWorld]);
  useEffect(() => {
    const map = mapRef.current;
    if (map && readyRef.current) applyWeatherVisibility(wxRt.current, map, wxLayers);
  }, [wxLayers]);

  // --- re-tentative des grilles météo : si une couche est active alors qu'une
  // grille manque (API/Open-Meteo indisponible au moment de l'activation), on
  // recharge toutes les 30 s jusqu'à couverture complète du globe. ---
  useEffect(() => {
    const anyOn = wxLayers.temp || wxLayers.wind || wxLayers.precip;
    if (!anyOn || (wxGrid && wxWorld)) return;
    void useArgos.getState().loadWxGrid();
    const id = setInterval(() => void useArgos.getState().loadWxGrid(), 30_000);
    return () => clearInterval(id);
  }, [wxLayers, wxGrid, wxWorld]);

  // --- centrages : séisme, incident (compteur pour rejouer au montage), zone Copilot ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !quakeFocus) return;
    map.flyTo({ center: quakeFocus.ll, zoom: Math.max(map.getZoom(), 6.5), duration: 1400 });
    focusQuake(null);
  }, [quakeFocus, focusQuake]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !incidentFocus) return;
    const ll = incidentFocus.ll;
    if (!ll || ll.length !== 2) { focusIncident(null); return; }
    map.flyTo({ center: ll, zoom: Math.max(map.getZoom(), 10), duration: 1300 });
    focusIncident(null);
  }, [incidentFocus, incidentFocusAt, focusIncident]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapCenterRequest) return;
    const { ll, zoom } = mapCenterRequest;
    if (!ll || ll.length !== 2) { setMapCenter(null); return; }
    map.flyTo({ center: ll, zoom: Math.max(map.getZoom(), zoom), duration: 1200 });
    setMapCenter(null); // consume request
  }, [mapCenterRequest, setMapCenter]);

  // --- bandeau de détail COLLÉ au séisme sélectionné (popup ancrée au point) ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    quakePopupRef.current?.remove();
    quakePopupRef.current = null;
    if (!quakeSelected) return;
    const popup = quakePopup(map, quakeSelected, lang);
    quakePopupRef.current = popup;
    return () => { popup.remove(); };
  }, [quakeSelected, lang]);

  // --- mesure : itinéraire routier à chaque changement de points, puis tracé ---
  useEffect(() => {
    if (pts.length < 2) { setRoute(null); return; }
    let cancelled = false;
    void routeThrough(pts).then((r) => { if (!cancelled) setRoute(r); });
    return () => { cancelled = true; };
  }, [pts]);
  useEffect(() => {
    const map = mapRef.current;
    if (map) drawMeasure(map, pts, route);
  }, [pts, route]);
  // Curseur en croix tant que la mesure est active.
  useEffect(() => {
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = measureOn ? "crosshair" : "";
  }, [measureOn]);

  const panel = "rounded-lg px-2.5 py-1.5 text-[11px] shadow-lg";
  const movePt = (i: number, d: number) =>
    setPts((p) => {
      const j = i + d;
      if (j < 0 || j >= p.length) return p;
      const n = [...p];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const removePt = (i: number) => setPts((p) => p.filter((_, k) => k !== i));
  const stepBtn = "rounded p-0.5 text-white/60 transition-colors hover:text-or-400 disabled:opacity-25";

  return (
    <div
      className="absolute inset-0"
      // Glisser-déposer d'un poste depuis la boîte à outils (mode édition) :
      // le point lâché devient le poste en attente, la modale fait le reste.
      onDragOver={(e) => {
        if (useArgos.getState().mapEdit && (e.dataTransfer.types.includes(POST_DRAG_MIME) || e.dataTransfer.types.includes(RESOURCE_DRAG_MIME))) e.preventDefault();
      }}
      onDrop={(e) => {
        const map = mapRef.current, host = containerRef.current;
        if (!map || !host || !useArgos.getState().mapEdit) return;
        const rect = host.getBoundingClientRect();
        const ll = map.unproject([e.clientX - rect.left, e.clientY - rect.top]);
        // Une ressource lâchée se pose tout de suite sur le terrain (ADR 0018).
        const res = parseResourcePick(e.dataTransfer.getData(RESOURCE_DRAG_MIME));
        if (res) {
          e.preventDefault();
          placeResourceAt(res, [ll.lng, ll.lat]);
          return;
        }
        const pick = parsePostPick(e.dataTransfer.getData(POST_DRAG_MIME));
        if (!pick) return;
        e.preventDefault();
        useArgos.getState().setPendingPost({ ...pick, ll: [ll.lng, ll.lat] });
      }}
      onContextMenu={(e) => {
        // Maj + clic droit : menu contextuel du point visé.
        if (!e.shiftKey) return;
        e.preventDefault();
        const map = mapRef.current, host = containerRef.current;
        if (!map || !host) return;
        const rect = host.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
        const ll = map.unproject([x, y]);
        setCtxMenu({ x, y, ll: [ll.lng, ll.lat] });
      }}
    >
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      {/* Ligne de temps météo façon Windy : étirée, centrée en bas de la carte,
          jours cliquables + curseur sur le dégradé de température. Position
          centrale = aucun chevauchement avec les contrôles (droite) ni les
          panneaux de mesure/coordonnées (gauche). */}
      {(wxLayers.temp || wxLayers.precip || wxLayers.wind) && wxGrid && wxGrid.times.length > 1 && (
        <div
          className="pointer-events-auto absolute z-20 rounded-xl px-3 py-2"
          style={{ ...OVERLAY_STYLE, bottom: 10, left: "50%", transform: "translateX(-50%)", width: "min(680px, 58%)", minWidth: 340 }}
        >
          {/* Jours (cliquer saute à la mi-journée) */}
          <div className="mb-1.5 flex items-stretch gap-1">
            {wxDays(wxGrid.times, lang).map((d) => {
              const active = (wxGrid.times[wxTimeIdx] ?? "").startsWith(d.date);
              return (
                <button
                  key={d.date}
                  type="button"
                  // Choisir un jour PAUSE la lecture : à 1 h par seconde, l'animation
                  // reprenait aussitôt le pas et le saut passait pour inopérant.
                  onClick={() => { wxRt.current.anim.idx = d.idx; wxRt.current.anim.lastInt = -2; wxRt.current.anim.playing = false; setWxPlaying(false); setWxTimeIdx(d.idx); }}
                  className={`min-w-0 flex-1 truncate rounded-md px-1 py-0.5 text-[12px] font-semibold transition-colors ${
                    active ? "bg-or-500 text-rdia-600" : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
          {/* Lecture + curseur (piste = dégradé de température) + horodatage */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => { const p = !wxPlaying; setWxPlaying(p); wxRt.current.anim.playing = p; }}
              className="shrink-0 rounded-md bg-white/10 px-2.5 py-1 text-[13px] font-bold text-white/90 transition-colors hover:bg-white/20"
              aria-label={wxPlaying ? FLUX[lang].wx_pause : FLUX[lang].wx_play}
              title={wxPlaying ? FLUX[lang].wx_pause : FLUX[lang].wx_play}
            >
              {wxPlaying ? "❚❚" : "▶"}
            </button>
            <div className="min-w-0 flex-1">
              <input
                type="range"
                min={0}
                max={wxGrid.times.length - 1}
                step={1}
                value={wxTimeIdx}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  wxRt.current.anim.idx = v;
                  wxRt.current.anim.lastInt = -2; // force la ré-application du pas
                  // Scruter une heure met la lecture en pause, comme choisir un jour.
                  wxRt.current.anim.playing = false;
                  setWxPlaying(false);
                  setWxTimeIdx(v);
                }}
                className="wx-range w-full"
                style={{ background: wxLayers.temp ? WX_GRADIENT : "rgba(255,255,255,.22)" }}
                aria-label={FLUX[lang].wx_forecast}
              />
              {/* Graduation : chaque couleur de la piste ↔ sa température */}
              {wxLayers.temp && (
                <div className="relative mt-0.5 h-3 font-mono text-[9px] leading-none text-white/65">
                  {[-10, 0, 10, 20, 30, 40, 46].map((tp) => {
                    const pc = ((tp - WX_T_MIN) / (WX_T_MAX - WX_T_MIN)) * 100;
                    return (
                      <span
                        key={tp}
                        className="absolute"
                        style={pc < 3 ? { left: 0 } : pc > 97 ? { right: 0 } : { left: `${pc}%`, transform: "translateX(-50%)" }}
                      >
                        {tp}°
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            <span className="shrink-0 whitespace-nowrap font-mono text-[12px] text-white/85">
              {wxFmtTime(wxGrid.times[wxTimeIdx] ?? "", lang)}
            </span>
          </div>
          {/* Échelles compactes des couches actives */}
          {(wxLayers.wind || wxLayers.precip) && (
            <div className="mt-1 flex items-center justify-center gap-4 font-mono text-[10px] text-white/60">
              {wxLayers.wind && <span>{FLUX[lang].wx_wind}</span>}
              {wxLayers.precip && <span>{FLUX[lang].wx_precip_prob} 0-100 %</span>}
            </div>
          )}
        </div>
      )}

      {/* Menu contextuel (Maj + clic droit) : actions sur le point visé */}
      {ctxMenu && (
        <>
          <div
            className="absolute inset-0 z-40"
            onClick={() => setCtxMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }}
          />
          <div
            className="absolute z-50 w-[250px] overflow-hidden rounded-xl py-1.5 shadow-2xl"
            style={{
              ...OVERLAY_STYLE,
              left: Math.min(ctxMenu.x, (containerRef.current?.clientWidth ?? 9999) - 264),
              top: Math.min(ctxMenu.y, (containerRef.current?.clientHeight ?? 9999) - 140),
            }}
          >
            {(can("incidents:create") || role === "superadmin") && (
              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-start text-[14px] font-semibold text-white/90 transition-colors hover:bg-white/10"
                onClick={() => { openWizard(ctxMenu.ll); setCtxMenu(null); }}
              >
                <Icon path={UI_ICONS.plus} size={16} className="shrink-0 text-or-400" />
                {t.report}
              </button>
            )}
            <button
              type="button"
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-start text-[14px] font-semibold text-white/90 transition-colors hover:bg-white/10"
              onClick={() => {
                // Si le clic tombe dans la zone d'une ville (≤ 35 km), la
                // pop-up est titrée de son nom plutôt que des coordonnées.
                setWxPopup({ ll: ctxMenu.ll, place: nearestCity(ctxMenu.ll[0], ctxMenu.ll[1])?.name ?? null });
                setCtxMenu(null);
              }}
            >
              <Icon path={NAV_ICONS.weather} size={16} className="shrink-0 text-or-400" />
              {FLUX[lang].wx_here}
            </button>
            <div className="border-t border-white/10 px-3.5 pb-1 pt-1.5 font-mono text-[11px] text-white/50">
              {ctxMenu.ll[1].toFixed(4)}, {ctxMenu.ll[0].toFixed(4)}
            </div>
          </div>
        </>
      )}

      {/* Pop-up de prévisions météo du point sélectionné */}
      {wxPopup && <WeatherPopup ll={wxPopup.ll} place={wxPopup.place} onClose={() => setWxPopup(null)} />}

      {/* Points de mesure : réordonner (↑/↓) et supprimer (✕) */}
      {pts.length > 0 && (
        <div className="absolute z-10 flex w-[220px] flex-col gap-1 rounded-lg p-2 shadow-lg" style={{ ...OVERLAY_STYLE, bottom: 84, insetInlineStart: 8 }}>
          <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-white/60">{t.map_points}</div>
          {pts.map((p, i) => (
            <div key={`${p[0]},${p[1]},${i}`} className="flex items-center gap-1 text-[10px] text-white/90">
              <span className="w-3 shrink-0 font-bold text-or-400">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-mono">{p[1].toFixed(4)}, {p[0].toFixed(4)}</span>
              <button onClick={() => movePt(i, -1)} disabled={i === 0} className={stepBtn} aria-label={t.map_points}>
                <Icon path={UI_ICONS.caretDown} size={11} strokeWidth={2.5} className="rotate-180" />
              </button>
              <button onClick={() => movePt(i, 1)} disabled={i === pts.length - 1} className={stepBtn} aria-label={t.map_points}>
                <Icon path={UI_ICONS.caretDown} size={11} strokeWidth={2.5} />
              </button>
              <button onClick={() => removePt(i)} className="rounded p-0.5 text-danger-400 transition-colors hover:text-danger-300" aria-label={t.flt_clear}>
                <Icon path={UI_ICONS.close} size={11} strokeWidth={2.5} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Outil de mesure (multi-points, itinéraire routier) */}
      <div className="absolute z-10 flex items-center gap-1.5" style={{ bottom: 46, insetInlineStart: 8 }}>
        <button
          onClick={() => setMeasureOn((o) => !o)}
          className={`${panel} font-bold transition-colors ${measureOn ? "bg-or-500 text-rdia-600" : "text-white/90 hover:text-or-400"}`}
          style={measureOn ? undefined : OVERLAY_STYLE}
        >
          {t.map_measure}
        </button>
        {route && (
          <span className={`${panel} font-mono text-white/90`} style={OVERLAY_STYLE}>
            {route.km.toFixed(1)} km
            {route.min != null ? ` · ${route.min} min` : ""}
            <span className={route.road ? "text-or-400" : "text-white/50"}> · {route.road ? t.map_route : t.map_direct}</span>
          </span>
        )}
        {pts.length > 0 && (
          <button onClick={() => { setPts([]); setRoute(null); }} className={`${panel} font-semibold text-danger-400 hover:text-danger-300`} style={OVERLAY_STYLE}>
            {t.flt_clear}
          </button>
        )}
        {measureOn && pts.length === 0 && (
          <span className={`${panel} text-white/70`} style={OVERLAY_STYLE}>{t.map_measure_hint}</span>
        )}
      </div>

      {/* Position du curseur : latitude / longitude / altitude */}
      <div
        className={`pointer-events-none absolute z-10 flex items-center gap-3 font-mono text-white/90 ${panel}`}
        style={{ ...OVERLAY_STYLE, bottom: 8, insetInlineStart: 8 }}
      >
        <span className="flex gap-1"><span className="text-or-400">{t.wz_lat}</span><span ref={latRef}>—</span></span>
        <span className="flex gap-1"><span className="text-or-400">{t.wz_lng}</span><span ref={lngRef}>—</span></span>
        <span className="flex gap-1"><span className="text-or-400">{t.map_alt}</span><span ref={altRef}>—</span></span>
      </div>
    </div>
  );
}

