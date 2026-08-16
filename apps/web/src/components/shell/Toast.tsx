"use client";

import { useArgos } from "@/lib/store";

/** Toast de confirmation en bas à droite (auto-fermé par le store après 4 s). */
export function Toast() {
  const toast = useArgos((s) => s.toast);
  if (!toast) return null;
  return (
    <div
      // Ancré aux deux bords sur mobile : une notification calée à droite avec
      // un texte long déborderait de l'écran. `end-4` (et non `right-4`) suit
      // le sens de lecture — en arabe la notification part de la gauche.
      className="carte fixed inset-x-3 bottom-3 z-[60] flex items-center gap-3 px-4 py-3 shadow-lg animate-fade-in-up sm:inset-x-auto sm:bottom-4 sm:end-4 sm:max-w-md"
      style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
      role="status"
      aria-live="polite"
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
      <span className="text-sm font-medium text-gray-800 dark:text-rdia-50">{toast}</span>
    </div>
  );
}
