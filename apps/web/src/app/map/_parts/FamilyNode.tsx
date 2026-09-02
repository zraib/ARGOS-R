"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import type { LayerState } from "@/lib/store";
import type { MarkerKind } from "@/lib/types";
import {
  TreeFamily,
} from "@/app/map/_parts/shared";
import { Switch } from "@/app/map/_parts/Switch";
import { LayerNode } from "@/app/map/_parts/LayerNode";

/** Nœud « famille » de l'arbre des couches : repliable + interrupteur global. */
export function FamilyNode({
  family, layers, toggleLayer, selMarker, select,
}: {
  family: TreeFamily; layers: LayerState; toggleLayer: (k: keyof LayerState) => void;
  selMarker: { kind: MarkerKind; id: string } | null; select: (k: MarkerKind, id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const anyOn = family.layers.some((l) => layers[l.key]);
  const setAll = (v: boolean) => family.layers.forEach((l) => { if (layers[l.key] !== v) toggleLayer(l.key); });
  return (
    <div>
      <div className="flex items-center gap-1.5 py-1">
        <button onClick={() => setOpen((o) => !o)} className="cible-tactile flex items-center justify-center text-white/60 transition-colors hover:text-or-400" aria-label={family.label}>
          <Icon path={UI_ICONS.caretDown} size={11} strokeWidth={2.5} className={`transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>
        <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-white/90">{family.label}</span>
        <button onClick={() => setAll(!anyOn)} aria-label={family.label} className="cible-tactile flex items-center justify-center"><Switch on={anyOn} /></button>
      </div>
      {open && (
        <div className="ms-2 flex flex-col border-s border-white/15 ps-1.5">
          {family.layers.map((l) => (
            <LayerNode
              key={l.key}
              layer={l}
              on={layers[l.key]}
              toggle={() => toggleLayer(l.key)}
              selMarker={selMarker}
              select={select}
            />
          ))}
        </div>
      )}
    </div>
  );
}
