"use client";

import { useArgos, useDict, useModules } from "@/lib/store";
import { POST_DRAG_MIME, POST_FILL, POST_KINDS } from "@/lib/posts";
import { Switch } from "@/app/map/_parts/Switch";
import type { PostKind } from "@/lib/types";

// ============================================================================
// Boîte à outils du mode édition (lot #12) — Super Administrateur seulement.
//
// Deux gestes pour poser un poste, parce que le glisser-déposer HTML5
// n'existe pas au doigt : glisser un chip sur la carte, OU choisir le chip
// (il s'arme) puis cliquer la carte. Dans les deux cas le point lâché ouvre la
// modale de pose ; c'est elle qui rattache le poste à une opération.
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

  return (
    <div className="flex flex-col gap-3 text-[14px] text-white/85">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-white/90">{t.map_edit_mode}</span>
        <button
          type="button"
          onClick={() => setMapEdit(!mapEdit)}
          aria-label={t.map_edit_mode}
          aria-pressed={mapEdit}
          className="cible-tactile flex items-center justify-center"
        >
          <Switch on={mapEdit} />
        </button>
      </div>
      <p className="text-[12px] leading-snug text-white/60">{t.map_edit_hint}</p>

      {mapEdit && (
        <div className="grid grid-cols-2 gap-2">
          {POST_KINDS.map((k) => {
            const armed = armedPost === k;
            return (
              <button
                key={k}
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(POST_DRAG_MIME, k);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => armPost(armed ? null : k)}
                aria-pressed={armed}
                className={`flex min-h-11 cursor-grab items-center gap-2 rounded-lg border px-2 py-2 text-start text-[13px] font-semibold transition-colors active:cursor-grabbing ${
                  armed ? "border-or-400 bg-or-500/20 text-or-300" : "border-white/15 bg-white/5 text-white/85 hover:bg-white/10"
                }`}
              >
                <span className="h-3 w-3 shrink-0 rounded-sm border border-black/40" style={{ background: POST_FILL[k] }} aria-hidden="true" />
                <span className="min-w-0 truncate">{postKindLabel(k, t, m)}</span>
              </button>
            );
          })}
        </div>
      )}

      {mapEdit && armedPost && <p className="text-[12px] font-semibold text-or-300">{t.map_edit_armed}</p>}
    </div>
  );
}
