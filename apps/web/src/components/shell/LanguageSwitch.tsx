"use client";

import { useArgos } from "@/lib/store";
import type { Lang } from "@/lib/types";

const LANGS: Lang[] = ["fr", "ar", "en"];

/** Sélecteur segmenté FR / AR / EN réutilisé par la carte de connexion et la barre latérale. */
export function LanguageSwitch({ variant = "sidebar" }: { variant?: "sidebar" | "login" }) {
  const lang = useArgos((s) => s.lang);
  const setLang = useArgos((s) => s.setLang);

  return (
    <div className="flex gap-1">
      {LANGS.map((l) => {
        const active = lang === l;
        const inactive =
          variant === "login"
            ? "bg-gray-100 text-gray-400 hover:text-or-500 dark:bg-rdia-600 dark:text-rdia-200"
            : "bg-gray-100 text-gray-500 hover:text-or-500 dark:bg-or-500/5 dark:text-rdia-200 dark:hover:text-or-300";
        return (
          <button
            key={l}
            onClick={() => setLang(l)}
            className={`flex-1 rounded-md py-1.5 text-[10px] font-bold uppercase transition-colors ${
              active ? "bg-or-500 text-rdia-600" : inactive
            }`}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}
