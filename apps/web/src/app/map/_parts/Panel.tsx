"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import {
  GLASS,
  } from "@/app/map/_parts/shared";


/** Panneau flottant repliable posé sur la carte. */
export function Panel({
  title, children, defaultOpen = true, width, right, bodyClassName,
}: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; width?: number; right?: ReactNode; bodyClassName?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="pointer-events-auto overflow-hidden rounded-xl shadow-lg" style={{ ...GLASS, width }}>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-2 text-[13px] font-bold uppercase tracking-wider text-white/80 transition-colors hover:text-or-400"
        >
          <span className="truncate">{title}</span>
          <Icon path={UI_ICONS.caretDown} size={12} strokeWidth={2.5} className={`shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>
        {right}
      </div>
      {open && <div className={`px-3 pb-3 ${bodyClassName ?? ""}`}>{children}</div>}
    </div>
  );
}
