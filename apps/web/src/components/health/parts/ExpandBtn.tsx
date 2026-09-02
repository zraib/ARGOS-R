"use client";

import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";


// ===========================================================================
// Bouton expand (⤢) / close (✕) · pattern LocationPreviewMap
// ===========================================================================
export 
function ExpandBtn({
  expanded,
  onClick,
  title,
}: {
  expanded: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={
        expanded
          ? "absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-rdia-700 shadow-lg transition-colors hover:bg-gray-100 dark:bg-rdia-700 dark:text-white dark:hover:bg-rdia-600"
          : "absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-md border border-gray-100 bg-white/85 text-gray-500 shadow-sm backdrop-blur transition-all hover:border-gray-200 hover:text-gray-800 dark:border-rdia-500 dark:bg-rdia-700/85 dark:text-rdia-200 dark:hover:bg-rdia-700 dark:hover:text-white"
      }
    >
      <Icon
        path={expanded ? UI_ICONS.close : UI_ICONS.expand}
        size={expanded ? 17 : 13}
        strokeWidth={2}
      />
    </button>
  );
}
