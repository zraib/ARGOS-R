"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useArgos, useDict, useModules } from "@/lib/store";
import { TILES_AVAILABLE } from "@/lib/map/tiles";
import { Badge, type BadgeType } from "@/components/ui/Badge";
import { ResponsibleCard } from "@/components/responsibility/ResponsibleCard";
import { Icon } from "@/components/ui/Icon";
import { HazardIcon } from "@/components/ui/HazardIcon";
import { FAMILY_PICTOGRAM } from "@/lib/hazard/pictograms";
import { UI_ICONS, TYPE_ICONS } from "@/lib/icons";
import { sevBadge, stBadge, typeLabel, hazardLabel} from "@/lib/helpers";
import { FLUX } from "@/lib/i18n/flux";
import { AircraftPanel } from "@/components/map/AircraftPanel";
import { WindRose } from "@/components/map/WindRose";
import { HOSPITAL_KINDS, hospKind, kindDef } from "@/lib/hospitals";
import { HealthGlyph } from "@/components/health/HealthGlyph";
import {
  GLASS,
  SelInfo,
  SheetTab,
  TreeFamily,
} from "@/app/map/_parts/shared";
import { MapCanvas } from "@/app/map/_parts/MapCanvas";
import { Switch } from "@/app/map/_parts/Switch";
import { PostToolbox, postKindLabel } from "@/components/map/PostToolbox";
import { PlacePostModal } from "@/components/map/PlacePostModal";
import { canEditMap } from "@/lib/roles";
import { PLACED_FILL, placeablePostKinds, placeableResourceKinds } from "@/lib/edit";
import { moduleKeyOpen } from "@/lib/nav";
import { POST_FILL, postCaption, postHolderRole } from "@/lib/posts";
import { corpsLabel, corpsShort } from "@/lib/corps";
import { Panel } from "@/app/map/_parts/Panel";
import { FloodPanel } from "@/app/map/_parts/FloodPanel";
import { FirePanel } from "@/app/map/_parts/FirePanel";
import { FamilyNode } from "@/app/map/_parts/FamilyNode";
import { trackerLabel } from "@/components/map/layers/trackers";
import { contactAge, isStale } from "@/lib/tracking/tracker";

export default function MapPage() {
  const t = useDict();
  const router = useRouter();
  const units = useArgos((s) => s.units);
  const vehRoutes = useArgos((s) => s.vehRoutes);
  const incidentTypes = useArgos((s) => s.incidentTypes);
  const lang = useArgos((s) => s.lang);
  const m = useModules();
  const role = useArgos((s) => s.role);
  const profile = useArgos((s) => s.profile);
  const posts = useArgos((s) => s.posts);
  const shelters = useArgos((s) => s.shelters);
  const trackers = useArgos((s) => s.trackers);
  const responsables = useArgos((s) => s.responsables);
  const mapEdit = useArgos((s) => s.mapEdit);
  const deletePost = useArgos((s) => s.deletePost);
  const placed = useArgos((s) => s.placed);
  const unplaceResource = useArgos((s) => s.unplaceResource);
  // Capacités de la carte (ADR 0018) : mode édition et simulations suivent la
  // matrice rôle → modules comme les écrans — coupées, elles n'apparaissent pas.
  const flags = useArgos((s) => s.flags);
  const roleFeatures = useArgos((s) => s.roleFeatures);
  const myModules = useArgos((s) => s.myModules);
  const capOpen = (k: "mapEdit" | "simFlood" | "simFire" | "simNrbc") => moduleKeyOpen(k, flags, roleFeatures[role], myModules);
  // Le mode en service borne les natures posables : sans nature ni ressource, pas d'édition.
  const editOpen = canEditMap(role, profile) && capOpen("mapEdit");
  const showToast = useArgos((s) => s.showToast);
  const hospitals = useArgos((s) => s.hospitals);
  const layers = useArgos((s) => s.layers);
  const aircraft = useArgos((s) => s.aircraft);
  const toggleLayer = useArgos((s) => s.toggleLayer);
  const selMarker = useArgos((s) => s.selMarker);
  const clearSelection = useArgos((s) => s.clearSelection);
  const map3d = useArgos((s) => s.map3d);
  const mapSat = useArgos((s) => s.mapSat);
  const setMap3d = useArgos((s) => s.setMap3d);
  const setMapSat = useArgos((s) => s.setMapSat);
  const quakes = useArgos((s) => s.quakes);
  const quakesOn = useArgos((s) => s.quakesOn);
  const setQuakesOn = useArgos((s) => s.setQuakesOn);
  const wxLayers = useArgos((s) => s.wxLayers);
  const toggleWxLayer = useArgos((s) => s.toggleWxLayer);
  const fx = FLUX[lang];
  const setSelUnit = useArgos((s) => s.setSelUnit);
  const setSelHosp = useArgos((s) => s.setSelHosp);
  // La carte montre TOUS les incidents actifs (ADR 0020) ; `incidents` reste
  // la liste cantonnée du compte, pour ce qui renvoie à un écran gardé.
  const incidents = useArgos((s) => s.mapIncidents);
  const fieldHosps = useArgos((s) => s.fieldHosps);
  const select = useArgos((s) => s.select);
  const [full, setFull] = useState(false);
  /** Onglet ouvert dans la feuille du bas (sous `lg`) ; `null` = feuille fermée. */
  const [sheet, setSheet] = useState<SheetTab | null>(null);
  const chatWindows = useArgos((s) => s.chatOpen.length);

  // Sous lg, la sélection vit dans la feuille du bas, qui se replie quand une
  // bulle de conversation s'ouvre — c'est depuis elle qu'on vient de presser
  // « Contacter ». Au bureau, c'est le panneau de sélection qui se borne
  // (voir plus bas) : la bulle s'ouvre au niveau des têtes, il s'écarte.
  useEffect(() => {
    if (chatWindows > 0) setSheet(null);
  }, [chatWindows]);
  /**
   * Panneau ouvert dans le trio de gauche (≥ lg) : couches, suivi aérien ou
   * légende — un seul à la fois, fermé par défaut. Les boutons répliquent le
   * style des contrôles natifs MapLibre (blanc, 44 px, rayon 12). Le bouton
   * « nrbc » ne rejoint la pile que lorsqu'un panache est actif.
   */
  const [openPanel, setOpenPanel] = useState<"layers" | "air" | "legend" | "nrbc" | "edit" | "flood" | "fire" | null>(null);
  // Le simulateur attend un clic sur la carte : sous lg, la feuille se replie
  // pour la laisser voir — c'est depuis elle qu'on vient d'armer le point.
  const floodArming = useArgos((s) => s.floodArming);
  const fireArming = useArgos((s) => s.fireArming);
  const morgues = useArgos((s) => s.morgues);
  useEffect(() => {
    if (floodArming || fireArming) setSheet(null);
  }, [floodArming, fireArming]);

  // --- panache NRBC (ADR 0005) ---
  const plumeIncidentId = useArgos((s) => s.plumeIncidentId);
  const plumeData = useArgos((s) => s.plumeData);
  const plumeModels = useArgos((s) => s.plumeModels);
  const plumeEnvelope = useArgos((s) => s.plumeEnvelope);
  const plumeHour = useArgos((s) => s.plumeHour);
  const plumeBusy = useArgos((s) => s.plumeBusy);
  const setPlumeModels = useArgos((s) => s.setPlumeModels);
  const setPlumeEnvelope = useArgos((s) => s.setPlumeEnvelope);
  const setPlumeHour = useArgos((s) => s.setPlumeHour);
  const hidePlume = useArgos((s) => s.hidePlume);
  const plumePlaying = useArgos((s) => s.plumePlaying);
  const setPlumePlaying = useArgos((s) => s.setPlumePlaying);
  const plume3d = useArgos((s) => s.plume3d);
  const plumeSmoke = useArgos((s) => s.plumeSmoke);
  const plumeVigilance = useArgos((s) => s.plumeVigilance);
  const setPlumeVigilance = useArgos((s) => s.setPlumeVigilance);
  const setPlumeSmoke = useArgos((s) => s.setPlumeSmoke);
  const setPlume3d = useArgos((s) => s.setPlume3d);
  const plumeSteps = useArgos((s) => s.plumeSteps);
  const showPlume = useArgos((s) => s.showPlume);
  /** Ordres en cours tracés sur la carte (inbox + outbox, sans doublon). */
  const missionInbox = useArgos((s) => s.missionInbox);
  const missionOutbox = useArgos((s) => s.missionOutbox);
  const missionLines = useMemo(() => {
    const seen = new Set<string>();
    return [...missionInbox, ...missionOutbox].filter((m) => {
      if (seen.has(m.id) || m.payload.kind !== "order") return false;
      seen.add(m.id);
      return true;
    });
  }, [missionInbox, missionOutbox]);

  /** Incidents chimiques actifs : rendent le bouton NRBC découvrable depuis la carte. */
  const nrbcIncidents = useMemo(
    () => incidents.filter((i) => !i.archived && i.nrbc?.family === "C"),
    [incidents],
  );

  // L'opérateur arrive depuis « Voir le panache » : le panneau s'ouvre seul
  // (et se referme si la couche est éteinte pendant qu'il est affiché).
  useEffect(() => {
    setOpenPanel((o) => (plumeIncidentId ? "nrbc" : o === "nrbc" ? null : o));
  }, [plumeIncidentId]);

  // Échap quitte le plein écran.
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  // Toucher un marqueur doit montrer son détail : la feuille s'ouvre sur
  // l'onglet Sélection, et se referme dès que la sélection est levée (sinon
  // l'opérateur garde une feuille vide en travers de la carte).
  useEffect(() => {
    if (selMarker) setSheet("selection");
    else setSheet((s) => (s === "selection" ? null : s));
  }, [selMarker]);

  // Arbre : famille → couche (interrupteur) → éléments réellement créés.
  const families: TreeFamily[] = [
    {
      label: t.fam_forces,
      layers: [
        { key: "units", label: t.lg_units, leaves: units.map((u) => ({ id: u.id, label: `${corpsShort(u.corps)} · ${u.nom}`, kind: "unit" })) },
        // Convois animés : une simulation, servie en profil « demo » seulement —
        // la couche n'apparaît que s'il y a quelque chose à animer.
        ...(vehRoutes.length > 0
          ? [{ key: "vehicles" as const, label: t.lg_veh, leaves: vehRoutes.map((v) => ({ id: v.id, label: `${v.label} · ${v.kind}`, kind: "veh" as const })) }]
          : []),
        // Boîtiers GPS et positions partagées par l'application (ADR 0015) :
        // ce qui émet, où — seuls les traceurs qui ont un fix sont listés.
        {
          key: "trackers",
          label: t.lg_trackers,
          leaves: trackers.filter((x) => !x.archived && x.last).map((x) => ({ id: x.id, label: trackerLabel(x), kind: "trk" as const })),
        },
        {
          // Ce qui SE JOUE, à côté de ce qui EST : les boucles engagent des
          // unités, leur place est donc dans « Forces », pas ailleurs.
          key: "missions",
          label: t.ms_layer,
          leaves: missionLines.map((m) => ({ id: m.id, label: `${m.id} · ${m.label}`, kind: "inc" as const })),
        },
      ],
    },
    {
      label: t.fam_health,
      layers: [
        {
          key: "hospitals",
          label: t.lg_hosp_mil,
          leaves: hospitals.filter((h) => hospKind(h) === "mil").map((h) => ({ id: h.id, label: h.nom, kind: "hosp" })),
        },
        {
          key: "hospitalsCiv",
          label: t.lg_hosp_civ,
          leaves: hospitals
            .filter((h) => hospKind(h) !== "mil")
            .map((h) => ({ id: h.id, label: `${h.nom} · ${h.ville}`, kind: "hosp" })),
        },
        { key: "field", label: t.field, leaves: fieldHosps.map((f) => ({ id: f.nom, label: f.nom, kind: "field" })) },
        // Les sites mortuaires et les morgues mobiles déployées (service morgue).
        {
          key: "morgues",
          label: t.lg_morgues,
          leaves: morgues.filter((s) => !(s.kind === "mobile" && !s.deployment)).map((s) => ({ id: s.id, label: `${s.nom} · ${s.ville}`, kind: "morgue" as const })),
        },
      ],
    },
    {
      // Les abris d'hébergement qui portent une position (ADR 0015).
      label: t.fam_shelter,
      layers: [
        {
          key: "shelters",
          label: t.lg_shelters,
          leaves: shelters.filter((s) => Array.isArray(s.ll)).map((s) => ({ id: s.id, label: `${s.nom} · ${s.ville}`, kind: "shelter" as const })),
        },
      ],
    },
    {
      label: t.fam_air,
      layers: [
        {
          key: "aircraft",
          label: t.lg_aircraft,
          leaves: aircraft.map((a) => ({
            id: a.aircraft.id,
            label: `${a.aircraft.label} · ${a.aircraft.code}`,
            kind: "acft" as const,
          })),
        },
      ],
    },
    {
      label: t.nav_inc,
      layers: [
        {
          key: "incidents",
          label: t.nav_inc,
          leaves: incidents.filter((i) => !i.archived).map((i) => ({ id: i.id, label: `${i.id} · ${i.titre}`, kind: "inc" })),
        },
        {
          // Les postes posés sur la carte (lot #12) : PC, cellules, abris et
          // parcs d'une opération — un lieu chacun, la personne vient du déploiement.
          key: "posts",
          label: t.lg_posts,
          leaves: posts.map((p) => ({ id: p.id, label: `${postKindLabel(p.kind, t, m)} · ${postCaption(p, { shelters, units, responsables }) ?? p.incidentId}`, kind: "post" as const })),
        },
        {
          // Équipes, véhicules et équipements posés sur le terrain (ADR 0018).
          key: "placed",
          label: t.lg_placed,
          leaves: placed.map((p) => ({ id: `${p.kind}:${p.id}`, label: `${p.label} · ${p.ownerLabel}`, kind: "placed" as const })),
        },
      ],
    },
  ];

  // ---- données du panneau de sélection ----
  let selInfo: SelInfo | null = null;
  if (selMarker) {
    const { kind, id } = selMarker;
    if (kind === "unit") {
      const u = units.find((x) => x.id === id);
      if (u) {
        const b: Record<string, { type: BadgeType; label: string }> = {
          ready: { type: "active", label: t.u_ready },
          deployed: { type: "medium", label: t.u_deployed },
          standby: { type: "on_hold", label: t.u_standby },
        };
        selInfo = {
          titre: `${corpsShort(u.corps)} · ${u.nom}`, sub: `${corpsLabel(u.corps ?? "far", t)} · ${u.ville}`, badgeType: b[u.dispo].type, badgeLabel: b[u.dispo].label,
          lines: [{ k: t.commander, v: u.cmdt }, { k: t.effectif, v: String(u.eff) }, { k: t.readiness, v: `${u.readiness} %` }],
          responsible: { kind: "unit", entityId: u.id, incidentId: incidents.find((i) => i.responders?.units?.includes(u.id))?.id },
          action: () => { setSelUnit(u.id); clearSelection(); router.push("/equipes"); },
        };
      }
    } else if (kind === "morgue") {
      const site = morgues.find((x) => x.id === id);
      if (site) {
        selInfo = {
          titre: site.nom, sub: site.ville, badgeType: site.statut === "op" ? "active" : site.statut === "partial" ? "medium" : "on_hold", badgeLabel: m.resp.morgue_statut[site.statut],
          lines: [
            { k: m.morgue.f_type, v: site.type ? m.morgue.types[site.type] : site.kind === "mobile" ? m.morgue.site_mobile : m.morgue.site_fixed },
            { k: m.morgue.col_status, v: m.resp.morgue_statut[site.statut] },
            { k: m.morgue.d_capacity, v: String(site.capacity) },
            { k: m.resp.g_staff, v: String(site.staff) },
            ...(site.deployment?.incidentId ? [{ k: m.morgue.d_incident, v: site.deployment.incidentId }] : []),
          ],
          responsible: { kind: "morgue", entityId: site.id },
          // La fiche complète — type, statut, capacité, corps — s'ouvre dans le service.
          action: () => { clearSelection(); router.push(`/morgue?site=${encodeURIComponent(site.id)}`); },
        };
      }
    } else if (kind === "hosp") {
      const h = hospitals.find((x) => x.id === id);
      if (h) {
        selInfo = {
          titre: h.nom, sub: h.region ? `${h.ville} · ${h.region}` : h.ville, badgeType: "active", badgeLabel: t.op_ok,
          lines: [
            { k: t.lg_health_kind, v: h.type ?? kindDef(hospKind(h)).long },
            { k: t.beds_free, v: `${h.lits - h.occ} / ${h.lits}` },
            { k: t.icu, v: `${h.rea - h.reaOcc} / ${h.rea}` },
            { k: t.med_staff, v: String(h.staff) },
          ],
          responsible: { kind: "hospital", entityId: h.id },
          action: () => { setSelHosp(h.id); clearSelection(); router.push("/hospinet"); },
        };
      }
    } else if (kind === "inc") {
      const i = incidents.find((x) => x.id === id);
      if (i) {
        const sb = sevBadge(i.sev, t);
        selInfo = {
          titre: i.titre, sub: i.region, badgeType: sb.type, badgeLabel: sb.label,
          lines: [{ k: t.col_id, v: i.id }, { k: t.h_typev, v: typeLabel(i.type, incidentTypes, lang) }, { k: t.col_status, v: stBadge(i.st, t).label }, { k: t.col_time, v: i.time }],
        };
      }
    } else if (kind === "placed") {
      const p = placed.find((x) => `${x.kind}:${x.id}` === id);
      if (p) {
        const inc = p.position.incidentId ? incidents.find((i) => i.id === p.position.incidentId) : undefined;
        const kindLabel = p.kind === "teams" ? t.pl_teams : p.kind === "vehicles" ? t.pl_vehicles : t.pl_equipment;
        selInfo = {
          titre: p.label,
          sub: p.sub ? `${kindLabel} · ${p.sub}` : kindLabel,
          badgeType: "active",
          badgeLabel: t.pl_placed,
          lines: [
            { k: t.pl_owner, v: p.ownerLabel },
            ...(inc ? [{ k: t.post_incident, v: `${inc.id} · ${inc.titre}` }] : []),
            { k: t.pl_by, v: `${p.position.by} · ${p.position.at.slice(0, 16).replace("T", " ")}` },
            { k: t.post_coords, v: `${p.position.ll[1].toFixed(4)}, ${p.position.ll[0].toFixed(4)}` },
          ],
          remove:
            mapEdit && editOpen && placeableResourceKinds(role).includes(p.kind)
              ? () => {
                  void unplaceResource(p.kind, p.id)
                    .then(() => {
                      clearSelection();
                      showToast(t.pl_removed);
                    })
                    .catch((err: unknown) => showToast(`${t.toast_fail} — ${err instanceof Error ? err.message : String(err)}`));
                }
              : undefined,
        };
      }
    } else if (kind === "post") {
      const p = posts.find((x) => x.id === id);
      if (p) {
        const inc = incidents.find((i) => i.id === p.incidentId);
        const caption = postCaption(p, { shelters, units, responsables });
        // Qui tient le poste : le déploiement pour un PC ou une cellule
        // (incident + rôle + compte), l'affectation pour un abri ou un parc.
        // Le rôle du compte déployé prime : un poste PCT peut être tenu par le
        // chef de PCT de l'un ou l'autre profil (ADR 0022).
        const holder = p.matricule
          ? responsables.find((x) => x.kind === "incident" && x.entityId === p.incidentId && x.matricule.toLowerCase() === p.matricule?.toLowerCase())
          : undefined;
        const responsible =
          p.kind === "shelter" || p.kind === "equipment"
            ? { kind: p.kind, entityId: p.entityId ?? "", incidentId: p.incidentId }
            : { kind: "incident" as const, entityId: p.incidentId, role: holder?.role ?? postHolderRole(p.kind), matricule: p.matricule };
        selInfo = {
          titre: caption ? `${postKindLabel(p.kind, t, m)} · ${caption}` : postKindLabel(p.kind, t, m),
          sub: inc ? `${inc.id} · ${inc.titre}` : p.incidentId,
          badgeType: "active",
          badgeLabel: postKindLabel(p.kind, t, m),
          lines: [
            { k: t.post_incident, v: p.incidentId },
            { k: t.post_coords, v: `${p.ll[1].toFixed(4)}, ${p.ll[0].toFixed(4)}` },
          ],
          responsible,
          remove:
            mapEdit && editOpen && placeablePostKinds(role, profile).includes(p.kind)
              ? () => {
                  void deletePost(p.id)
                    .then(() => {
                      clearSelection();
                      showToast(t.post_removed);
                    })
                    .catch((err: unknown) => showToast(`${t.toast_fail} — ${err instanceof Error ? err.message : String(err)}`));
                }
              : undefined,
        };
      }
    } else if (kind === "shelter") {
      const s = shelters.find((x) => x.id === id);
      if (s) {
        const taux = s.capacity > 0 ? Math.round((s.occupants / s.capacity) * 100) : 0;
        selInfo = {
          titre: s.nom, sub: s.ville, badgeType: taux >= 100 ? "high" : taux >= 80 ? "medium" : "active", badgeLabel: `${taux} %`,
          lines: [
            { k: t.capacity, v: String(s.capacity) },
            { k: t.occupancy, v: `${s.occupants} / ${s.capacity}` },
            { k: t.staff, v: String(s.staff) },
          ],
          responsible: { kind: "shelter", entityId: s.id, incidentId: posts.find((p) => p.kind === "shelter" && p.entityId === s.id)?.incidentId },
          action: () => { clearSelection(); router.push("/opsnet"); },
        };
      }
    } else if (kind === "trk") {
      const x = trackers.find((y) => y.id === id);
      if (x && x.last) {
        const muet = isStale(x);
        selInfo = {
          titre: x.label, sub: x.source === "app" ? `${t.trk_map_app} · ${x.account ?? ""}` : `${t.trk_map_device} · ${x.imei}`,
          badgeType: x.last.priority === "panic" ? "high" : muet ? "on_hold" : "active",
          badgeLabel: x.last.priority === "panic" ? t.trk_map_panic : muet ? t.trk_map_stale : t.trk_map_live,
          lines: [
            { k: t.trk_last_seen, v: contactAge(x) },
            { k: t.trk_speed, v: `${Math.round(x.last.speedKmh)} km/h` },
            { k: t.trk_heading, v: `${Math.round(x.last.headingDeg)}°` },
            { k: t.post_coords, v: `${x.last.ll[1].toFixed(4)}, ${x.last.ll[0].toFixed(4)}` },
            ...(x.incidentId ? [{ k: t.post_incident, v: x.incidentId }] : []),
          ],
          action: () => { clearSelection(); router.push("/traceurs"); },
        };
      }
    } else if (kind === "veh") {
      const v = vehRoutes.find((x) => x.id === id);
      if (v) selInfo = { titre: v.label, sub: v.kind, badgeType: "active", badgeLabel: t.u_deployed, lines: [{ k: t.col_status, v: "—" }] };
    } else if (kind === "field") {
      const f = fieldHosps.find((x) => x.nom === id);
      if (f) {
        selInfo = {
          titre: f.nom, sub: t.field, badgeType: f.statut === "op" ? "active" : "on_hold", badgeLabel: f.statut === "op" ? t.op_ok : t.op_partial,
          lines: [{ k: t.capacity, v: `${f.cap} ${t.beds.toLowerCase()}` }, { k: t.occupancy, v: `${Math.round((f.occ / f.cap) * 100)} %` }, { k: t.since, v: f.depuis }],
        };
      }
    }
  }

  // Cibles de 44 px sous lg (§ tactile) ; densité d'origine à partir de lg.
  const seg = (on: boolean) => `min-h-11 px-4 py-2.5 text-[14px] font-bold transition-colors lg:min-h-0 ${on ? "bg-or-500 text-rdia-600" : "text-white/90 hover:text-or-400"}`;
  const legend: [ReactNode, string][] = [
    [<rect key="u" x={-4} y={-4} width={8} height={8} fill="#C9A84C" />, t.lg_units],
    [<path key="i" d="M0,-6 L6,5 L-6,5 Z" fill="#EF4444" />, t.nav_inc],
    ...(vehRoutes.length > 0 ? [[<path key="v" d="M0,-5 L5,0 L0,5 L-5,0 Z" fill="#3B82F6" />, t.lg_veh] as [ReactNode, string]] : []),
    [<rect key="p" x={-7} y={-4} width={14} height={8} rx={2} fill={POST_FILL.opcom} stroke="#0f1f14" />, t.lg_posts],
    [<rect key="pl" x={-7} y={-4} width={14} height={8} rx={4} fill={PLACED_FILL.teams} stroke="#0f1f14" />, t.lg_placed],
    [<circle key="s" r={5} fill="#15803d" stroke="#fff" strokeWidth={1.5} />, t.lg_shelters],
    [<circle key="m" r={5} fill="#64748b" stroke="#fff" strokeWidth={1.5} />, t.lg_morgues],
    [<circle key="k" r={5} fill="#C9A84C" stroke="#fff" strokeWidth={1.5} />, t.lg_trackers],
    [<path key="a" d="M-8,4 L-3,-2 L2,3 L8,-4" fill="none" stroke="#C9A84C" strokeWidth={2} strokeDasharray="3 2" />, t.lg_acft_trails],
  ];

  // ---- corps des panneaux ----
  // Rendus une seule fois puis placés soit dans les panneaux flottants (≥ lg),
  // soit dans la feuille du bas (< lg) : aucune fonctionnalité n'est dupliquée
  // ni perdue d'un côté ou de l'autre du point de rupture.
  const layersBody = (
    // Pas de hauteur maximale sous lg : c'est la feuille qui défile.
    <div className="flex flex-col overflow-x-hidden lg:max-h-[36vh] lg:overflow-y-auto">
      {families.map((f) => (
        <FamilyNode
          key={f.label}
          family={f}
          layers={layers}
          toggleLayer={toggleLayer}
          selMarker={selMarker}
          select={select}
        />
      ))}
      {/* Couche sismique (EMSC) — indépendante de LayerState (flux externe) */}
      <div className="mt-1 flex items-center gap-1.5 border-t border-white/10 py-0.5 pt-1.5">
        <span className="w-[10px]" />
        <button onClick={() => setQuakesOn(!quakesOn)} className={`min-w-0 flex-1 truncate text-start text-[14px] transition-colors ${quakesOn ? "text-white/90" : "text-white/45"}`}>
          {t.nav_seismic}
          <span className="ms-1 text-white/40">({quakes.length})</span>
        </button>
        <button onClick={() => setQuakesOn(!quakesOn)} aria-label={t.nav_seismic} className="cible-tactile flex items-center justify-center"><Switch on={quakesOn} /></button>
      </div>

      {/* Couches météo (grille de conditions actuelles) — superposables */}
      <div className="mt-1 border-t border-white/10 pt-1.5">
        <div className="py-0.5 text-[14px] font-bold text-white/90">{t.nav_weather}</div>
        {([["temp", fx.wx_temp], ["wind", fx.wx_wind], ["precip", fx.wx_precip]] as const).map(([k, label]) => (
          <div key={k} className="flex items-center gap-1.5 py-0.5 ps-3">
            <button onClick={() => toggleWxLayer(k)} className={`min-w-0 flex-1 truncate text-start text-[14px] transition-colors ${wxLayers[k] ? "text-white/90" : "text-white/45"}`}>
              {label}
            </button>
            <button onClick={() => toggleWxLayer(k)} aria-label={label} className="cible-tactile flex items-center justify-center"><Switch on={wxLayers[k]} /></button>
          </div>
        ))}
      </div>
    </div>
  );

  const legendBody = (
    <div className="flex flex-col gap-2 overflow-x-hidden text-[14px] text-white/80 lg:max-h-[46vh] lg:overflow-y-auto">
      {legend.map(([shape, label]) => (
        <div key={label} className="flex items-center gap-2">
          <svg width={14} height={14} viewBox="-7 -7 14 14">{shape}</svg>
          <span>{label}</span>
        </div>
      ))}
      {/* Établissements de santé : six symboles distincts —
          hexagone = militaire, cercle = civil, pointillé = campagne. */}
      <div className="mt-1 border-t border-white/12 pt-2">
        <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-white/50">{t.lg_health_net}</div>
        <div className="flex flex-col gap-1.5">
          {HOSPITAL_KINDS.map((k) => (
            <div key={k.kind} className="flex items-center gap-2">
              <HealthGlyph kind={k.kind} size={17} />
              <span>{k.long}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  /**
   * Panneau du panache NRBC : choix des référentiels (combinables), enveloppe
   * prudente, échéance H+0…H+6 et méta du vent. Le bandeau « Estimation — pas
   * une mesure » est permanent (doctrine d'honnêteté) : un gabarit de
   * planification n'est jamais présenté comme une observation.
   */
  const nrbcBody = !plumeIncidentId ? (
    // Aucun panache affiché : le panneau devient le point d'entrée — il liste
    // les incidents chimiques en cours et active le panache d'un clic (la
    // carte vole alors vers l'incident au bon zoom via showPlume).
    <div className="flex flex-col gap-2 text-[14px] text-white/80">
      <div className="text-[12px] text-white/60">
        {nrbcIncidents.length > 0 ? t.nrbc_pick : t.nrbc_none_active}
      </div>
      {nrbcIncidents.map((i) => (
        <button
          key={i.id}
          onClick={() => showPlume(i.id)}
          className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-white/12 px-2.5 py-2 text-start transition-colors hover:border-or-400/60 hover:bg-white/5 lg:min-h-0"
        >
          {/* La liste des panaches disponibles : le pictogramme y dit la
              famille sans qu'il faille ouvrir la fiche. */}
          {i.nrbc ? (
            <HazardIcon kind={FAMILY_PICTOGRAM[i.nrbc.family]} size={20} className="shrink-0" label={hazardLabel(FAMILY_PICTOGRAM[i.nrbc.family], t)} />
          ) : (
            <Icon path={UI_ICONS.nrbc} size={15} className="shrink-0 text-or-400" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-white">{i.titre}</span>
            <span className="block text-[11px] text-white/50">{i.id} · {i.region}</span>
          </span>
        </button>
      ))}
    </div>
  ) : (
    <div className="flex flex-col gap-3 text-[14px] text-white/80">
      <div className="rounded-lg bg-or-500/20 px-2.5 py-1.5 text-[12px] font-bold uppercase tracking-wider text-or-300">
        {t.nrbc_estimate}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-semibold text-white">{plumeIncidentId}</span>
        {plumeData?.substance && (
          <span className="shrink-0 text-[12px] text-white/60">
            {plumeData.substance.labels[lang]} · UN {plumeData.substance.un}
          </span>
        )}
      </div>
      {plumeData?.substance && !plumeData.substance.ergVerified && (
        <div className="text-[11px] font-semibold text-or-300">{t.nrbc_unverified}</div>
      )}

      <div>
        <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-white/50">{t.nrbc_models}</div>
        <div className="flex flex-col gap-1.5">
          <button className="flex min-h-11 items-center justify-between gap-2 lg:min-h-0" onClick={() => setPlumeModels({ atp45: !plumeModels.atp45 })}>
            <span>{t.nrbc_model_atp45}</span>
            <Switch on={plumeModels.atp45} />
          </button>
          <button
            className="flex min-h-11 items-center justify-between gap-2 disabled:opacity-40 lg:min-h-0"
            disabled={plumeData !== null && plumeData.substance === null}
            title={plumeData && plumeData.substance === null ? t.nrbc_no_substance : undefined}
            onClick={() => setPlumeModels({ erg: !plumeModels.erg })}
          >
            <span>{t.nrbc_model_erg}</span>
            <Switch on={plumeModels.erg} />
          </button>
          <button className="flex min-h-11 items-center justify-between gap-2 lg:min-h-0" onClick={() => setPlumeEnvelope(!plumeEnvelope)}>
            <span>{t.nrbc_envelope}</span>
            <Switch on={plumeEnvelope} />
          </button>
        </div>
        {plumeData && plumeData.substance === null && (
          <div className="mt-1.5 text-[11px] text-white/50">{t.nrbc_no_substance}</div>
        )}
      </div>

      {/* Lecture animée + nappe 3D (lots V1 et V2). Le bouton ▶ n'apparaît
          qu'une fois les sept échéances préchargées : proposer une lecture qui
          n'a rien à lire serait pire que de la cacher. */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn-primaire cible-tactile flex items-center gap-1.5 text-xs disabled:opacity-40"
          disabled={plumeSteps.length === 0}
          onClick={() => setPlumePlaying(!plumePlaying)}
        >
          <Icon path={plumePlaying ? UI_ICONS.close : UI_ICONS.plane} size={13} />
          {plumePlaying ? t.nrbc_stop : t.nrbc_play}
        </button>
        {/* Fumée ou formes. Le CONTOUR du gabarit reste tracé dans les deux
            cas : le nuage se regarde, la ligne se mesure. */}
        {/* Le grand cercle de vigilance recouvre tout à l'échelle d'une ville :
            on doit pouvoir le retirer sans perdre le panache. */}
        <button className="flex min-h-11 items-center gap-2 lg:min-h-0" onClick={() => setPlumeVigilance(!plumeVigilance)}>
          <span className="text-[13px]">{t.nrbc_vigilance}</span>
          <Switch on={plumeVigilance} />
        </button>
        <button className="flex min-h-11 items-center gap-2 lg:min-h-0" onClick={() => setPlumeSmoke(!plumeSmoke)}>
          <span className="text-[13px]">{t.nrbc_smoke}</span>
          <Switch on={plumeSmoke} />
        </button>
        <button className="flex min-h-11 items-center gap-2 lg:min-h-0" onClick={() => setPlume3d(!plume3d)}>
          <span className="text-[13px]">{t.nrbc_volume}</span>
          <Switch on={plume3d} />
        </button>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[12px] font-bold uppercase tracking-wider text-white/50">{t.nrbc_hour}</span>
          <span className="font-mono text-[13px] font-bold text-or-300">H+{plumeHour}{plumeBusy ? "…" : ""}</span>
        </div>
        <input
          type="range"
          min={0}
          max={6}
          step={1}
          value={plumeHour}
          onChange={(e) => setPlumeHour(Number(e.target.value))}
          className="w-full accent-or-500"
          aria-label={t.nrbc_hour}
        />
      </div>

      {plumeData &&
        (plumeData.wind ? (
          <div className="flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-2 text-[13px]">
            {/* La flèche pointe VERS où va le vent (direction météo + 180°). */}
            <svg width={16} height={16} viewBox="0 0 24 24" className="shrink-0 text-or-300" style={{ transform: `rotate(${(plumeData.wind.fromDeg + 180) % 360}deg)` }}>
              <path d="M12 3v18 M6 9l6-6 6 6" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="min-w-0 flex-1">
              {t.nrbc_wind} {plumeData.wind.speedKmh} km/h · {plumeData.wind.fromDeg}° · {plumeData.wind.isDay ? t.nrbc_day : t.nrbc_night}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-white/45">{plumeData.wind.time.slice(11, 16)} UTC</span>
          </div>
        ) : (
          <div className="rounded-lg bg-white/5 px-2.5 py-2 text-[12px] text-white/60">{t.nrbc_wind_na}</div>
        ))}

      <div className="flex flex-col gap-1.5 border-t border-white/12 pt-2">
        {(
          [
            ["#EF4444", t.nrbc_lvl_danger],
            ["#F97316", t.nrbc_lvl_protection],
            ["#FACC15", t.nrbc_lvl_vigilance],
          ] as const
        ).map(([color, label]) => (
          <div key={label} className="flex items-center gap-2 text-[13px]">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: color, opacity: 0.75 }} />
            <span>{label}</span>
          </div>
        ))}
      </div>

      <button className="btn-secondaire min-h-11 w-full text-[14px] lg:min-h-0" onClick={hidePlume}>
        {t.flt_clear}
      </button>
    </div>
  );

  const selectionBody = selInfo && (
    <div className="flex flex-col gap-2">
      <div className="text-[14px] text-white/60">{selInfo.sub}</div>
      <div><Badge type={selInfo.badgeType} label={selInfo.badgeLabel} /></div>
      <div className="flex flex-col gap-1">
        {selInfo.lines.map((ln, i) => (
          <div key={i} className="flex items-center justify-between gap-2 border-b border-white/12 py-1 text-[14px]">
            <span className="min-w-0 text-white/60">{ln.k}</span>
            <span className="min-w-0 text-end font-semibold text-white">{ln.v}</span>
          </div>
        ))}
      </div>
      {selInfo.responsible && <ResponsibleCard tone="dark" {...selInfo.responsible} hideIfNone={selInfo.responsible.kind === "hospital"} />}
      {selInfo.remove && (
        <button className="btn-secondaire min-h-11 w-full text-[14px] text-danger-400 lg:min-h-0" onClick={selInfo.remove}>
          {t.post_remove}
        </button>
      )}
      {selInfo.action && <button className="btn-secondaire min-h-11 w-full text-[14px] lg:min-h-0" onClick={selInfo.action}>{t.view}</button>}
    </div>
  );

  // Onglets de la feuille : l'onglet « sélection » n'existe que s'il y a une
  // sélection — son libellé est alors le nom de l'élément (aucune clé i18n
  // supplémentaire n'est nécessaire).
  const sheetTabs: { key: SheetTab; label: string; body: ReactNode }[] = [
    { key: "layers", label: t.layers, body: layersBody },
    { key: "aircraft", label: t.acft_panel, body: <AircraftPanel /> },
    { key: "legend", label: t.legend, body: legendBody },
  ];
  if (editOpen) sheetTabs.push({ key: "edit", label: t.map_edit_mode, body: <PostToolbox /> });
  if (capOpen("simFlood")) sheetTabs.push({ key: "flood", label: t.flood_panel, body: <FloodPanel /> });
  if (capOpen("simFire")) sheetTabs.push({ key: "fire", label: t.fire_panel, body: <FirePanel /> });
  if (selInfo) sheetTabs.push({ key: "selection", label: selInfo.titre, body: selectionBody });
  const openTab = sheetTabs.find((x) => x.key === sheet) ?? null;

  // Les marges négatives annulent exactement le rembourrage de <main>
  // (`p-3 sm:p-4 lg:p-6`) : figées à `-m-6`, elles débordaient de 24 px à
  // 375 px et faisaient défiler la page horizontalement.
  const frameCls = full
    ? "fixed inset-0 z-[9999] bg-rdia-900"
    : "relative -m-3 h-[calc(100%+1.5rem)] animate-fade-in sm:-m-4 sm:h-[calc(100%+2rem)] lg:-m-6 lg:h-[calc(100%+3rem)]";

  return (
    <section
      className={`carte-page ${frameCls}`}
      style={{ background: "#10202f" }}
    >
      <MapCanvas />
      <PlacePostModal />

      {/* Surcouches : tout est posé sur la carte, chaque panneau est repliable */}
      <div className="pointer-events-none absolute inset-0 z-20">
        {/* Colonne gauche (≥ lg) : couches (arbre) + suivi aérien + légende.
            Sous lg ces trois panneaux sont dans la feuille du bas. */}
        {/* Trio de gauche (≥ lg) : trois boutons au style des contrôles natifs ;
            le panneau choisi s'ouvre à côté avec l'animation « bulle », un seul
            à la fois. Sous lg, ces contenus restent dans la feuille du bas. */}
        <div className="absolute top-3 hidden items-start gap-2 lg:flex" style={{ insetInlineStart: 12 }}>
          <div className="pointer-events-auto flex flex-col overflow-hidden rounded-xl bg-white shadow-md">
            {(
              [
                { key: "layers" as const, icon: UI_ICONS.layers, label: t.layers },
                { key: "air" as const, icon: UI_ICONS.plane, label: t.acft_panel },
                { key: "legend" as const, icon: UI_ICONS.legend, label: t.legend },
                // Crues : prévisions Flood Hub et simulateur d'inondation (ADR 0010) —
                // réservé à la conduite par la matrice (ADR 0018).
                ...(capOpen("simFlood") ? [{ key: "flood" as const, icon: TYPE_ICONS.flood, label: t.flood_panel }] : []),
                // Feux de forêt : simulateur de propagation du front (ADR 0011).
                ...(capOpen("simFire") ? [{ key: "fire" as const, icon: TYPE_ICONS.wildfire, label: t.fire_panel }] : []),
                // Le mode édition n'existe que pour qui a quelque chose à poser
                // (ADR 0018) : l'API refuserait de toute façon le reste.
                ...(editOpen ? [{ key: "edit" as const, icon: UI_ICONS.edit, label: t.map_edit_mode }] : []),
                // Le bouton NRBC existe dès qu'un incident chimique est en cours
                // (ou qu'un panache est déjà affiché) : la capacité se découvre
                // depuis la carte, sans passer par la fiche incident.
                ...(capOpen("simNrbc") && (plumeIncidentId || nrbcIncidents.length > 0)
                  ? [{ key: "nrbc" as const, icon: UI_ICONS.nrbc, label: t.nrbc_panel }]
                  : []),
              ]
            ).map((b) => (
              <button
                key={b.key}
                onClick={() => setOpenPanel((o) => (o === b.key ? null : b.key))}
                aria-label={b.label}
                aria-expanded={openPanel === b.key}
                title={b.label}
                className={`flex h-11 w-11 items-center justify-center border-b border-gray-200 transition-colors last:border-0 ${
                  openPanel === b.key ? "bg-or-500/15 text-or-600" : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <Icon path={b.icon} size={22} strokeWidth={2} />
              </button>
            ))}
          </div>

          {openPanel && (
            // `key` relance l'animation bulle à chaque changement de panneau.
            <div key={openPanel} className="anim-bulle panneau-sombre pointer-events-auto w-[300px] overflow-hidden rounded-xl shadow-lg" style={GLASS}>
              <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
                <Icon
                  path={openPanel === "layers" ? UI_ICONS.layers : openPanel === "air" ? UI_ICONS.plane : openPanel === "nrbc" ? UI_ICONS.nrbc : openPanel === "edit" ? UI_ICONS.edit : openPanel === "flood" ? TYPE_ICONS.flood : openPanel === "fire" ? TYPE_ICONS.wildfire : UI_ICONS.legend}
                  size={14}
                  className="shrink-0 text-or-400"
                />
                <span className="min-w-0 flex-1 truncate text-[13px] font-bold uppercase tracking-wider text-white/85">
                  {openPanel === "layers" ? t.layers : openPanel === "air" ? t.acft_panel : openPanel === "nrbc" ? t.nrbc_panel : openPanel === "edit" ? t.map_edit_mode : openPanel === "flood" ? t.flood_panel : openPanel === "fire" ? t.fire_panel : t.legend}
                </span>
                <button
                  onClick={() => setOpenPanel(null)}
                  aria-label={t.flt_clear}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-[16px] leading-none text-white/45 transition-colors hover:text-or-400"
                >
                  ×
                </button>
              </div>
              <div className="max-h-[62vh] overflow-y-auto px-3 pb-3 pt-2">
                {openPanel === "layers" ? layersBody : openPanel === "air" ? <AircraftPanel /> : openPanel === "nrbc" ? nrbcBody : openPanel === "edit" ? <PostToolbox /> : openPanel === "flood" ? <FloodPanel /> : openPanel === "fire" ? <FirePanel /> : legendBody}
              </div>
            </div>
          )}
        </div>

        {/* AUCUN fond de carte configuré : la carte est vide, et il faut le
            dire — sans ce message, un opérateur croit à une zone sans donnée.
            L'origine du fond (externe ou souverain) n'est pas signalée à
            l'écran ; elle est figée à la construction (`NEXT_PUBLIC_MAP_TILES`,
            ADR 0014). */}
        {!TILES_AVAILABLE && (
          <div
            className="pointer-events-none absolute bottom-3 z-30 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-or-300 shadow-lg"
            style={{ ...GLASS, insetInlineStart: 12 }}
          >
            <Icon path={UI_ICONS.shield} size={13} className="shrink-0" />
            <span>{t.map_tiles_none}</span>
          </div>
        )}

        {/* Rose des vents : visible dès que le relief est actif ou que la lecture
            animée tourne — c'est là que le panneau NRBC est replié et que la
            dérive de la fumée a besoin d'être expliquée. */}
        <WindRose />

        {/* Panache actif sous lg : la feuille ne porte pas (encore) ses réglages,
            mais le bandeau d'honnêteté et l'extinction restent accessibles. */}
        {plumeIncidentId && (
          <div className="pointer-events-auto absolute inset-x-3 top-16 z-30 flex items-center gap-2 rounded-xl px-3 py-2 shadow-lg lg:hidden" style={GLASS}>
            <Icon path={UI_ICONS.nrbc} size={16} className="shrink-0 text-or-400" />
            <span className="min-w-0 flex-1 truncate text-[12px] font-bold uppercase tracking-wider text-or-300">
              {t.nrbc_estimate}
            </span>
            <button
              onClick={hidePlume}
              aria-label={t.flt_clear}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[16px] leading-none text-white/60 transition-colors hover:text-or-400"
            >
              ×
            </button>
          </div>
        )}

        {/* Colonne droite : contrôles de carte (toutes tailles) + sélection (≥ lg) */}
        <div className="absolute top-3 flex max-w-[calc(100%-1.5rem)] flex-col items-end gap-2 lg:w-[300px]" style={{ insetInlineEnd: 12 }}>
          <div className="pointer-events-auto flex flex-wrap justify-end gap-2">
            <div className="flex overflow-hidden rounded-lg shadow-md" style={GLASS}>
              <button className={seg(!map3d)} onClick={() => setMap3d(false)}>2D</button>
              <button className={seg(map3d)} onClick={() => setMap3d(true)}>3D</button>
            </div>
            <div className="flex overflow-hidden rounded-lg shadow-md" style={GLASS}>
              <button className={seg(mapSat)} onClick={() => setMapSat(true)}>{t.base_sat}</button>
              <button className={seg(!mapSat)} onClick={() => setMapSat(false)}>{t.base_plan}</button>
            </div>
            <button
              onClick={() => setFull((f) => !f)}
              title={full ? t.wz_exit_full : t.wz_fullscreen}
              aria-label={full ? t.wz_exit_full : t.wz_fullscreen}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-white/90 shadow-md transition-colors hover:text-or-400 lg:h-[30px] lg:w-[30px]"
              style={GLASS}
            >
              <Icon path={full ? UI_ICONS.close : UI_ICONS.expand} size={15} strokeWidth={2} />
            </button>
          </div>

          {/* Bouton flottant d'ouverture de la feuille — sous lg uniquement. */}
          <button
            onClick={() => setSheet((s) => (s ? null : "layers"))}
            title={t.layers}
            aria-label={t.layers}
            aria-expanded={sheet !== null}
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-lg text-white/90 shadow-md transition-colors hover:text-or-400 lg:hidden"
            style={GLASS}
          >
            <Icon path={sheet ? UI_ICONS.close : UI_ICONS.sliders} size={18} strokeWidth={2} />
          </button>

          {selInfo && (
            <div className="hidden lg:block">
              {/* Une bulle ouverte monte jusqu'à 532 px du bas : le panneau se
                  borne à ce qui reste au-dessus, et défile — plutôt que de
                  passer sous la conversation qu'on vient d'ouvrir. */}
              <Panel
                title={selInfo.titre}
                width={240}
                bodyClassName={chatWindows > 0 ? "max-h-[calc(100dvh-620px)] overflow-y-auto overscroll-contain" : undefined}
                right={
                  <button className="me-2 rounded-lg p-1 text-white/60 transition-colors hover:text-or-400" onClick={clearSelection} aria-label={t.cancel}>
                    <Icon path={UI_ICONS.close} size={13} strokeWidth={2} />
                  </button>
                }
              >
                {selectionBody}
              </Panel>
            </div>
          )}
        </div>

      </div>

      {/* Feuille ancrée en bas (< lg) : mêmes panneaux, en onglets. Elle ne
          couvre jamais plus de 62 % de la hauteur utile et laisse donc voir la
          carte pendant qu'on bascule une couche. Rendue hors de la surcouche
          `z-20` : il lui faut passer devant les boutons flottants (Copilot,
          conversations, `z-40`), sinon ils se posent au milieu du contenu. */}
      {openTab && (
        <div className="panneau-sombre pointer-events-auto absolute inset-x-0 bottom-0 z-[60] flex max-h-[62dvh] flex-col overflow-hidden rounded-t-2xl shadow-2xl lg:hidden" style={GLASS}>
          <div className="flex shrink-0 items-center gap-1 border-b border-white/12 ps-1">
            {/* Onglets défilables : quatre libellés ne tiennent pas à 375 px. */}
            <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
              {sheetTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setSheet(tab.key)}
                  className={`min-h-11 max-w-[45vw] shrink-0 truncate rounded-t-lg px-3 text-[13px] font-bold uppercase tracking-wider transition-colors ${
                    tab.key === openTab.key ? "bg-white/10 text-or-400" : "text-white/60 hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setSheet(null)}
              aria-label={t.cancel}
              className="cible-tactile flex shrink-0 items-center justify-center rounded-lg text-white/70 transition-colors hover:text-or-400"
            >
              <Icon path={UI_ICONS.close} size={16} strokeWidth={2} />
            </button>
          </div>
          {/* Seule la feuille défile ; `overscroll-contain` évite d'entraîner
              la carte quand on arrive en bout de liste. */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            {openTab.body}
          </div>
        </div>
      )}
    </section>
  );
}
