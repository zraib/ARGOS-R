"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import type { MarkerKind } from "@/lib/types";
import {
  TreeLayer,
  } from "@/app/map/_parts/shared";
import { Switch } from "@/app/map/_parts/Switch";
import { LeafRow } from "@/app/map/_parts/LeafRow";

/** Nœud « couche » : interrupteur d'affichage + liste repliable des éléments. */
export function LayerNode({
  layer, on, toggle, selMarker, select,
}: {
  layer: TreeLayer; on: boolean; toggle: () => void;
  selMarker: { kind: MarkerKind; id: string } | null; select: (k: MarkerKind, id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const has = layer.leaves.length > 0;
  return (
    <div>
      <div className="flex items-center gap-1 py-0.5">
        <button
          onClick={() => setOpen((o) => !o)}
          disabled={!has}
          className="cible-tactile flex items-center justify-center text-white/50 transition-colors hover:text-or-400 disabled:opacity-0"
          aria-label={layer.label}
        >
          <Icon path={UI_ICONS.caretDown} size={10} strokeWidth={2.5} className={`transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>
        <button onClick={toggle} className={`min-w-0 flex-1 truncate text-start text-[14px] transition-colors ${on ? "text-white/90" : "text-white/45"}`}>
          {layer.label}
          {has && <span className="ms-1 text-white/40">({layer.leaves.length})</span>}
        </button>
        <button onClick={toggle} aria-label={layer.label} className="cible-tactile flex items-center justify-center"><Switch on={on} /></button>
      </div>
      {open && has && (
        <div className="ms-2 flex max-h-40 flex-col overflow-y-auto overflow-x-hidden border-s border-white/15 ps-1.5">
          {layer.leaves.map((l) => (
            <LeafRow key={`${l.kind}-${l.id}`} leaf={l} select={select} sel={selMarker?.kind === l.kind && selMarker.id === l.id} />
          ))}
        </div>
      )}
    </div>
  );
}
