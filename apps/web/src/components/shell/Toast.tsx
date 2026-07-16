"use client";

import { useArgos } from "@/lib/store";

/** Toast de confirmation en bas à droite (auto-fermé par le store après 4 s). */
export function Toast() {
  const toast = useArgos((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="carte fixed bottom-4 right-4 z-[60] flex items-center gap-3 px-4 py-3 shadow-lg animate-fade-in-up">
      <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
      <span className="text-sm font-medium text-gray-800 dark:text-rdia-50">{toast}</span>
    </div>
  );
}
