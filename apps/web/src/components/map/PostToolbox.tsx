"use client";

import { useEffect, useMemo, useState } from "react";
import { useArgos, useDict, useModules } from "@/lib/store";
import { POST_DRAG_MIME, POST_FILL, pickGroups, type PickItem } from "@/lib/posts";
import { PLACED_FILL, RESOURCE_DRAG_MIME, placeablePostKinds, placeableResourceKinds, type ResourcePick } from "@/lib/edit";
import type { PlaceableKind, PlaceableResource } from "@/lib/types";
import { isOnlineAs } from "@/lib/responsibles";
import { Switch } from "@/app/map/_parts/Switch";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import type { PostKind } from "@/lib/types";

// ============================================================================
// Boîte à outils du mode édition (lot #12) — PAR RÔLE depuis l'ADR 0018.
//
// Il n'y a pas UN OPCOM, UN TACOM, UNE cellule : il y en a plusieurs, et
// plusieurs abris, plusieurs parcs. La boîte liste donc les INSTANCES, par
// nature — chaque compte tenant le rôle (avec l'opération qu'il sert déjà),
// chaque abri, chaque parc — et dit pour chacune si elle est disponible,
// déployée ailleurs, ou déjà posée. Deux gestes pour poser, parce que le
// glisser-déposer HTML5 n'existe pas au doigt : glisser le chip sur la carte,
// OU le choisir (il s'arme) puis cliquer la carte.
//
// Le contenu suit le rôle (`lib/edit.ts`) : le stratégique ne voit que les
// OPCOM, l'OPCOM son dispositif tactique ; le TACOM et les cellules voient
// leurs RESSOURCES (équipes, véhicules, équipements) à poser sur le terrain —
// l'API dit lesquelles (`/resources/placeable`), selon le mode et l'opération.
// ============================================================================

export function postKindLabel(kind: PostKind, t: ReturnType<typeof useDict>, m: ReturnType<typeof useModules>): string {
  if (kind === "shelter") return t.post_kind_shelter;
  if (kind === "equipment") return t.post_kind_equipment;
  // Les PC du profil « direx » (ADR 0022) sont tenus par leur chef ; le poste porte le nom du PC.
  if (kind === "pcfar") return t.post_kind_pcfar;
  if (kind === "pcf") return t.post_kind_pcf;
  return m.roles[kind];
}

export function PostToolbox() {
  const t = useDict();
  const m = useModules();
  const mapEdit = useArgos((s) => s.mapEdit);
  const setMapEdit = useArgos((s) => s.setMapEdit);
  const armedPost = useArgos((s) => s.armedPost);
  const armPost = useArgos((s) => s.armPost);
  const accounts = useArgos((s) => s.deployable);
  const loadDeployable = useArgos((s) => s.loadDeployable);
  const shelters = useArgos((s) => s.shelters);
  const units = useArgos((s) => s.units);
  const posts = useArgos((s) => s.posts);
  const online = useArgos((s) => s.rtOnline);
  const role = useArgos((s) => s.role);
  const placeable = useArgos((s) => s.placeable);
  const loadPlaceable = useArgos((s) => s.loadPlaceable);
  const armedResource = useArgos((s) => s.armedResource);
  const armResource = useArgos((s) => s.armResource);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const postKinds = placeablePostKinds(role);
  const resourceKinds = placeableResourceKinds(role);

  // Les comptes déployables et les ressources posables se lisent quand le
  // mode s'allume — pas avant : la liste n'a de sens que pour qui va poser.
  useEffect(() => {
    if (!mapEdit) return;
    if (postKinds.length > 0) void loadDeployable();
    if (resourceKinds.length > 0) void loadPlaceable();
  }, [mapEdit, loadDeployable, loadPlaceable, postKinds.length, resourceKinds.length]);

  const groups = useMemo(
    () => pickGroups({ accounts, shelters, units, posts }, t.post_kind_equipment).filter((g) => postKinds.includes(g.kind)),
    [accounts, shelters, units, posts, t.post_kind_equipment, postKinds],
  );
  const resourceGroups = useMemo(
    () => resourceKinds.map((kind) => ({ kind, items: placeable.filter((r) => r.kind === kind).sort((a, b) => Number(a.placed) - Number(b.placed) || a.label.localeCompare(b.label, "fr")) })),
    [placeable, resourceKinds],
  );
  const resourceKindLabel = (k: PlaceableKind) => (k === "teams" ? t.pl_teams : k === "vehicles" ? t.pl_vehicles : t.pl_equipment);
  const resourcePick = (r: PlaceableResource): ResourcePick => ({ kind: r.kind, id: r.id, title: r.label });
  const isArmedResource = (r: PlaceableResource) => !!armedResource && armedResource.kind === r.kind && armedResource.id === r.id;
  const q = query.trim().toLocaleLowerCase("fr");
  const matches = (i: PickItem) => !q || `${i.pick.title} ${i.sub ?? ""}`.toLocaleLowerCase("fr").includes(q);
  const isArmed = (i: PickItem) => !!armedPost && armedPost.kind === i.pick.kind && armedPost.matricule === i.pick.matricule && armedPost.entityId === i.pick.entityId;

  return (
    <div className="flex flex-col gap-3 text-[14px] text-white/85">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-white/90">{t.map_edit_mode}</span>
        <button type="button" onClick={() => setMapEdit(!mapEdit)} aria-label={t.map_edit_mode} aria-pressed={mapEdit} className="cible-tactile flex items-center justify-center">
          <Switch on={mapEdit} />
        </button>
      </div>
      {postKinds.length > 0 && <p className="text-[12px] leading-snug text-white/60">{t.map_edit_hint}</p>}

      {mapEdit && (
        <>
          <input
            className="w-full rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-[13px] text-white placeholder:text-white/40 focus:border-or-400 focus:outline-none"
            placeholder={t.post_search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {groups.map((g) => {
            const items = g.items.filter(matches);
            const libres = g.items.filter((i) => !i.placedOn && !i.deployedOn).length;
            const ouvert = open[g.kind] ?? (!!q || g.items.length <= 4);
            return (
              <div key={g.kind} className="border-t border-white/10 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen((o) => ({ ...o, [g.kind]: !ouvert }))}
                  aria-expanded={ouvert}
                  className="flex w-full items-center gap-2 text-start"
                >
                  <Icon path={UI_ICONS.chevronRight} size={10} strokeWidth={2.5} className="shrink-0 transition-transform" style={{ transform: ouvert ? "rotate(90deg)" : undefined }} />
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm border border-black/40" style={{ background: POST_FILL[g.kind] }} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-semibold text-white/90">{postKindLabel(g.kind, t, m)}</span>
                  <span className="shrink-0 text-[11px] text-white/50">
                    {libres} {libres > 1 ? t.post_available_many : t.post_available} · {g.items.length}
                  </span>
                </button>
                {ouvert && (
                  <div className="mt-1.5 flex flex-col gap-1">
                    {items.length === 0 && <p className="ps-4 text-[12px] text-white/45">{t.post_none_kind}</p>}
                    {items.map((i) => {
                      const key = i.pick.matricule ?? i.pick.entityId ?? i.pick.title;
                      const armed = isArmed(i);
                      const inactif = !!i.placedOn;
                      // Présent sous CE rôle : connecté comme OPCOM, on n'est pas là comme cellule.
                      const present = !!i.pick.matricule && isOnlineAs(online, i.pick.matricule, g.kind);
                      return (
                        <button
                          key={key}
                          type="button"
                          draggable={!inactif}
                          disabled={inactif}
                          title={i.placedOn ? `${t.post_placed_on} ${i.placedOn}` : i.deployedOn ? `${t.post_deployed_on} ${i.deployedOn}` : undefined}
                          onDragStart={(e) => {
                            e.dataTransfer.setData(POST_DRAG_MIME, JSON.stringify(i.pick));
                            e.dataTransfer.effectAllowed = "copy";
                          }}
                          onClick={() => armPost(armed ? null : i.pick)}
                          aria-pressed={armed}
                          className={`flex min-h-11 items-center gap-2 rounded-lg border px-2 py-1.5 text-start transition-colors ${
                            inactif
                              ? "cursor-not-allowed border-white/10 bg-white/[0.03] text-white/35"
                              : armed
                                ? "cursor-grab border-or-400 bg-or-500/20 text-or-300 active:cursor-grabbing"
                                : "cursor-grab border-white/15 bg-white/5 text-white/85 hover:bg-white/10 active:cursor-grabbing"
                          }`}
                        >
                          {i.pick.matricule && (
                            <span className={`h-2 w-2 shrink-0 rounded-full ${present ? "bg-green-500" : "bg-gray-500"}`} aria-hidden="true" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold">{i.pick.title}</span>
                            <span className="block truncate text-[11px] text-white/50">
                              {i.placedOn
                                ? `${t.post_placed_on} ${i.placedOn}`
                                : i.deployedOn
                                  ? `${t.post_deployed_on} ${i.deployedOn}`
                                  : (i.sub ?? t.post_available)}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {mapEdit && resourceKinds.length > 0 && (
        <div className="border-t border-white/10 pt-2">
          <p className="mb-1 text-[12px] font-bold uppercase tracking-wider text-white/50">{t.pl_section}</p>
          <p className="mb-2 text-[12px] leading-snug text-white/60">{t.pl_place_hint}</p>
          {placeable.length === 0 && <p className="ps-4 text-[12px] text-white/45">{t.pl_none}</p>}
          {resourceGroups.map((g) => {
            const items = g.items.filter((r) => !q || `${r.label} ${r.ownerLabel} ${r.sub ?? ""}`.toLocaleLowerCase("fr").includes(q));
            const libres = g.items.filter((r) => !r.placed).length;
            const ouvert = open[`res:${g.kind}`] ?? (!!q || g.items.length <= 4);
            if (g.items.length === 0) return null;
            return (
              <div key={g.kind} className="border-t border-white/10 pt-2">
                <button type="button" onClick={() => setOpen((o) => ({ ...o, [`res:${g.kind}`]: !ouvert }))} aria-expanded={ouvert} className="flex w-full items-center gap-2 text-start">
                  <Icon path={UI_ICONS.chevronRight} size={10} strokeWidth={2.5} className="shrink-0 transition-transform" style={{ transform: ouvert ? "rotate(90deg)" : undefined }} />
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/40" style={{ background: PLACED_FILL[g.kind] }} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-semibold text-white/90">{resourceKindLabel(g.kind)}</span>
                  <span className="shrink-0 text-[11px] text-white/50">
                    {libres} {libres > 1 ? t.post_available_many : t.post_available} · {g.items.length}
                  </span>
                </button>
                {ouvert && (
                  <div className="mt-1.5 flex flex-col gap-1">
                    {items.map((r) => {
                      const armed = isArmedResource(r);
                      return (
                        <button
                          key={`${r.kind}:${r.id}`}
                          type="button"
                          draggable={!r.placed}
                          disabled={r.placed}
                          title={r.placed ? t.pl_placed : undefined}
                          onDragStart={(e) => {
                            e.dataTransfer.setData(RESOURCE_DRAG_MIME, JSON.stringify(resourcePick(r)));
                            e.dataTransfer.effectAllowed = "copy";
                          }}
                          onClick={() => armResource(armed ? null : resourcePick(r))}
                          aria-pressed={armed}
                          className={`flex min-h-11 items-center gap-2 rounded-lg border px-2 py-1.5 text-start transition-colors ${
                            r.placed
                              ? "cursor-not-allowed border-white/10 bg-white/[0.03] text-white/35"
                              : armed
                                ? "cursor-grab border-or-400 bg-or-500/20 text-or-300 active:cursor-grabbing"
                                : "cursor-grab border-white/15 bg-white/5 text-white/85 hover:bg-white/10 active:cursor-grabbing"
                          }`}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold">{r.label}</span>
                            <span className="block truncate text-[11px] text-white/50">{r.placed ? t.pl_placed : `${r.ownerLabel}${r.sub ? ` · ${r.sub}` : ""}`}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {mapEdit && (armedPost || armedResource) && (
        <p className="text-[12px] font-semibold text-or-300">
          {t.map_edit_armed} — {armedPost?.title ?? armedResource?.title}
        </p>
      )}
    </div>
  );
}
