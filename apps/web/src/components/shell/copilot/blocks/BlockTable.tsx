"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

/** Cadre commun des tableaux structurés d'une réponse. */
export function BlockTable({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-gray-100 dark:border-rdia-700">
      <div className="flex items-center gap-1.5 bg-gray-50 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:bg-rdia-700/40 dark:text-rdia-300">
        <Icon path={icon} size={12} />
        {title}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          {children}
        </table>
      </div>
    </div>
  );
}
