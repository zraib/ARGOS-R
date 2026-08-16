"use client";

import { useEffect, useRef, useState } from "react";
import { useArgos } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import type { Lang } from "@/lib/types";

const OPTIONS: { id: Lang; label: string; flag: string }[] = [
  { id: "fr", label: "Français", flag: "FR" },
  { id: "ar", label: "العربية", flag: "AR" },
  { id: "en", label: "English", flag: "EN" },
];

/** Sélecteur de langue en icône globe → liste déroulante (FR / AR / EN). */
export function LanguageMenu() {
  const lang = useArgos((s) => s.lang);
  const setLang = useArgos((s) => s.setLang);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Langue / Language / اللغة"
        aria-haspopup="menu"
        aria-expanded={open}
        className="cible-tactile flex items-center justify-center gap-1 rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-or-500 lg:p-1.5 dark:text-rdia-200 dark:hover:bg-rdia-700/60 dark:hover:text-or-400"
      >
        <Icon path={UI_ICONS.globe} size={18} />
        <span className="text-[10px] font-bold uppercase">{lang}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 top-full z-50 mt-1.5 w-40 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-xl dark:border-rdia-600 dark:bg-rdia-700"
          style={{ insetInlineEnd: 0 }}
        >
          {OPTIONS.map((o) => (
            <button
              key={o.id}
              role="menuitem"
              onClick={() => { setLang(o.id); setOpen(false); }}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors ${
                lang === o.id
                  ? "bg-or-500/10 text-or-600 dark:text-or-400"
                  : "text-gray-600 hover:bg-gray-100 dark:text-rdia-100 dark:hover:bg-rdia-600/50"
              }`}
            >
              <span className="w-6 shrink-0 text-[10px] font-bold uppercase text-gray-400 dark:text-rdia-300">{o.flag}</span>
              <span className="flex-1 text-start" dir={o.id === "ar" ? "rtl" : "ltr"}>{o.label}</span>
              {lang === o.id && <Icon path={UI_ICONS.check} size={13} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
