"use client";

import type { MarkerKind } from "@/lib/types";
import {
  TreeLeaf,
  } from "@/app/map/_parts/shared";


/** Ligne d'un élément : cliquer sélectionne le marqueur et recentre la carte. */
export function LeafRow({ leaf, sel, select }: { leaf: TreeLeaf; sel: boolean; select: (k: MarkerKind, id: string) => void }) {
  return (
    // Sous lg la ligne monte à 44 px : au doigt, une ligne de 20 px est
    // impossible à viser sans toucher sa voisine.
    <button
      onClick={() => select(leaf.kind, leaf.id)}
      className={`flex min-h-11 w-full items-center gap-1.5 truncate rounded px-1 py-0.5 text-start text-[14px] transition-colors lg:min-h-0 lg:text-[13px] ${
        sel ? "bg-or-500/20 text-or-300" : "text-white/70 hover:bg-white/10 hover:text-white"
      }`}
    >
      <span className={`h-1 w-1 shrink-0 rounded-full ${sel ? "bg-or-400" : "bg-white/40"}`} />
      <span className="truncate">{leaf.label}</span>
    </button>
  );
}
