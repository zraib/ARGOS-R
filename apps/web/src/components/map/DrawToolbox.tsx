"use client";

import { useState } from "react";
import { useArgos, useDict } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { DRAWING_COLORS, DEFAULT_DRAWING_COLOR, canEditDrawing, formatDistance } from "@/lib/map/drawings";
import type { DrawTool } from "@/lib/store/slices/drawings";
import type { Drawing } from "@/lib/types";

// ============================================================================
// Le panneau « Dessin » de la carte : les outils (sélection, point, cercle,
// polygone), la liste des croquis, et la fiche du croquis sélectionné (nom,
// couleur, note, rayon, suppression). La géométrie se dessine et s'édite sur la
// carte elle-même (MapCanvas) ; ici on nomme, on colore, on retire.
// ============================================================================

const TOOLS: { tool: DrawTool; icon: string }[] = [
  { tool: "select", icon: UI_ICONS.target },
  { tool: "point", icon: UI_ICONS.drawPoint },
  { tool: "circle", icon: UI_ICONS.drawCircle },
  { tool: "polygon", icon: UI_ICONS.drawPolygon },
];

export function DrawToolbox() {
  const t = useDict();
  const drawings = useArgos((s) => s.drawings);
  const tool = useArgos((s) => s.drawTool);
  const setDrawTool = useArgos((s) => s.setDrawTool);
  const selectedId = useArgos((s) => s.drawSelected);
  const selectDrawing = useArgos((s) => s.selectDrawing);
  const updateDrawing = useArgos((s) => s.updateDrawing);
  const deleteDrawing = useArgos((s) => s.deleteDrawing);
  const showToast = useArgos((s) => s.showToast);
  const role = useArgos((s) => s.role);
  const sessionUser = useArgos((s) => s.sessionUser);
  const [confirm, setConfirm] = useState<string | null>(null);
  const selected = drawings.find((d) => d.id === selectedId) ?? null;
  const toolLabel = (k: DrawTool) => (k === "select" ? t.dr_tool_select : k === "point" ? t.dr_tool_point : k === "circle" ? t.dr_tool_circle : t.dr_tool_polygon);
  const kindLabel = (k: Drawing["kind"]) => (k === "point" ? t.dr_kind_point : k === "circle" ? t.dr_kind_circle : t.dr_kind_polygon);
  // Modifier et retirer : l'auteur, ou le Super Administrateur — ce que l'API applique ; les autres lisent.
  const canEdit = (d: Drawing) => canEditDrawing(d, role, sessionUser?.matricule);

  const remove = async (d: Drawing) => {
    if (await deleteDrawing(d.id)) showToast(t.dr_deleted);
    setConfirm(null);
  };

  return (
    <div className="flex flex-col gap-3 text-[14px] text-white/85">
      <p className="text-[12px] leading-snug text-white/60">{t.dr_hint}</p>
      <div className="grid grid-cols-4 gap-1.5">
        {TOOLS.map(({ tool: k, icon }) => (
          <button
            key={k}
            type="button"
            onClick={() => setDrawTool(tool === k ? "select" : k)}
            aria-pressed={tool === k}
            title={toolLabel(k)}
            className={`cible-tactile flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] font-semibold transition-colors ${
              tool === k ? "border-or-400 bg-or-500/20 text-or-300" : "border-white/15 text-white/70 hover:border-or-400/60 hover:text-white"
            }`}
          >
            <Icon path={icon} size={16} strokeWidth={2} />
            {toolLabel(k)}
          </button>
        ))}
      </div>
      {tool && tool !== "select" && <p className="text-[11px] font-semibold text-or-300">{t.dr_drawing_hint}</p>}

      {selected && (
        <div className="flex flex-col gap-2 rounded-lg border border-or-400/40 bg-white/5 p-2.5">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-white/50">
            <span>{kindLabel(selected.kind)} · {selected.id}</span>
            <span>{t.dr_by} {selected.updatedBy}</span>
          </div>
          <label className="text-[11px] font-semibold text-white/60">
            {t.dr_name}
            <input
              className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-[13px] text-white focus:border-or-400 focus:outline-none disabled:opacity-60"
              value={selected.label}
              maxLength={80}
              disabled={!canEdit(selected)}
              onChange={(e) => void updateDrawing(selected.id, { label: e.target.value })}
            />
          </label>
          <label className="text-[11px] font-semibold text-white/60">
            {t.dr_note}
            <input
              className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-[13px] text-white focus:border-or-400 focus:outline-none disabled:opacity-60"
              value={selected.note ?? ""}
              maxLength={500}
              disabled={!canEdit(selected)}
              onChange={(e) => void updateDrawing(selected.id, { note: e.target.value })}
            />
          </label>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-white/60">{t.dr_color}</span>
            {DRAWING_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                aria-pressed={(selected.color ?? DEFAULT_DRAWING_COLOR) === c}
                disabled={!canEdit(selected)}
                onClick={() => void updateDrawing(selected.id, { color: c })}
                className={`h-6 w-6 rounded-full border-2 ${(selected.color ?? DEFAULT_DRAWING_COLOR) === c ? "border-white" : "border-transparent"}`}
                style={{ background: c }}
              />
            ))}
          </div>
          {selected.kind === "circle" && selected.radiusM && (
            <div className="flex items-center gap-2 text-[12px]">
              <span className="font-semibold text-white/60">{t.dr_radius}</span>
              <input
                type="number"
                min={1}
                className="w-28 rounded-lg border border-white/15 bg-white/5 px-2 py-1 font-mono text-[12px] text-white focus:border-or-400 focus:outline-none"
                value={Math.round(selected.radiusM)}
                disabled={!canEdit(selected)}
                onChange={(e) => {
                  const r = Math.max(1, Number(e.target.value) || 1);
                  void updateDrawing(selected.id, { radiusM: r });
                }}
              />
              <span className="text-white/50">m · {formatDistance(selected.radiusM)}</span>
            </div>
          )}
          <p className="text-[11px] leading-snug text-white/50">{canEdit(selected) ? t.dr_label_hint : t.dr_readonly}</p>
          {canEdit(selected) &&
            (confirm === selected.id ? (
              <div className="flex gap-2">
                <button type="button" className="btn-secondaire flex-1 text-xs" onClick={() => setConfirm(null)}>{t.cancel}</button>
                <button type="button" className="flex-1 rounded-lg bg-danger-500 px-3 py-1.5 text-xs font-semibold text-white" onClick={() => void remove(selected)}>{t.confirm}</button>
              </div>
            ) : (
              <button type="button" className="flex items-center justify-center gap-1.5 rounded-lg border border-danger-500/50 px-3 py-1.5 text-xs font-semibold text-danger-400 hover:bg-danger-500/10" onClick={() => setConfirm(selected.id)}>
                <Icon path={UI_ICONS.trash} size={13} /> {t.dr_delete}
              </button>
            ))}
        </div>
      )}

      <div className="border-t border-white/10 pt-2">
        <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-white/50">
          <span>{t.dr_list}</span>
          <span>{drawings.length}</span>
        </div>
        {drawings.length === 0 && <p className="text-[12px] text-white/45">{t.dr_none}</p>}
        <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
          {drawings.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => {
                selectDrawing(d.id);
                if (!tool) setDrawTool("select");
              }}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-start text-[13px] transition-colors ${d.id === selectedId ? "bg-or-500/20 text-white" : "text-white/80 hover:bg-white/5"}`}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/40" style={{ background: d.color ?? DEFAULT_DRAWING_COLOR }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{d.label || "—"}</span>
              <span className="shrink-0 text-[10px] uppercase text-white/45">{kindLabel(d.kind)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
