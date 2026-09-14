"use client";

import { useDict } from "@/lib/store";
import { tpl } from "@/lib/i18n/format";

/** « Untel écrit… » — trois points qui respirent (voir `.anim-frappe`), et la phrase pour le lecteur d'écran. */
export function TypingIndicator({ nom, tone = "light" }: { nom: string; tone?: "light" | "dark" }) {
  const t = useDict();
  return (
    <div
      className={`flex items-center gap-2 text-[11px] ${tone === "dark" ? "text-white/70" : "text-gray-500 dark:text-rdia-300"}`}
      role="status"
      aria-live="polite"
    >
      <span className="anim-frappe inline-flex items-center gap-1 rounded-2xl bg-white px-2.5 py-2 text-or-500 shadow-sm dark:bg-rdia-700" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="min-w-0 truncate">{tpl(t.ch_typing, { nom })}</span>
    </div>
  );
}
