"use client";

import { useEffect, useMemo, useState } from "react";
import { useArgos, useDict, useModules } from "@/lib/store";
import { POST_DRAG_MIME, POST_FILL, pickGroups, type PickItem } from "@/lib/posts";
import { isOnlineAs } from "@/lib/responsibles";
import { Switch } from "@/app/map/_parts/Switch";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import type { PostKind } from "@/lib/types";

// ============================================================================
// Boîte à outils du mode édition (lot #12) — Super Administrateur seulement.
//
// Il n'y a pas UN OPCOM, UN TACOM, UNE cellule : il y en a plusieurs, et
// plusieurs abris, plusieurs parcs. La boîte liste donc les INSTANCES, par
// nature — chaque compte tenant le rôle (avec l'opération qu'il sert déjà),
// chaque abri, chaque parc — et dit pour chacune si elle est disponible,
// déployée ailleurs, ou déjà posée. Deux gestes pour poser, parce que le
// glisser-déposer HTML5 n'existe pas au doigt : glisser le chip sur la carte,
// OU le choisir (il s'arme) puis cliquer la carte.
// ============================================================================

export function postKindLabel(kind: PostKind, t: ReturnType<typeof useDict>, m: ReturnType<typeof useModules>): string {
  return kind === "shelter" ? t.post_kind_shelter : kind === "equipment" ? t.post_kind_equipment : m.roles[kind];
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
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  // Les comptes déployables se lisent quand le mode s'allume — pas avant :
  // la liste n'a de sens que pour qui va poser.
  useEffect(() => {
    if (mapEdit) void loadDeployable();
  }, [mapEdit, loadDeployable]);

  const groups = useMemo(() => pickGroups({ accounts, shelters, units, posts }, t.post_kind_equipment), [accounts, shelters, units, posts, t.post_kind_equipment]);
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
      <p className="text-[12px] leading-snug text-white/60">{t.map_edit_hint}</p>

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

      {mapEdit && armedPost && (
        <p className="text-[12px] font-semibold text-or-300">
          {t.map_edit_armed} — {armedPost.title}
        </p>
      )}
    </div>
  );
}
