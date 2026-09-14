"use client";

import { useArgos } from "@/lib/store";

/**
 * Toast de confirmation (auto-fermé par le store après 4 s).
 *
 * EN HAUT, centré, sous l'en-tête. Le bas de l'écran appartient à la rangée
 * des boutons flottants (Copilot, conversations) et aux fenêtres qui montent
 * au-dessus d'elle : y poser le toast le faisait recouvrir. Le centrage est
 * physique (`left-1/2`), identique dans les deux sens de lecture. Quand une
 * alerte sismique occupe déjà cette place, le toast descend d'un cran.
 */
export function Toast() {
  const toast = useArgos((s) => s.toast);
  const alerte = useArgos((s) => s.quakeAlert !== null);
  if (!toast) return null;
  return (
    <div
      className={`carte fixed left-1/2 z-[61] flex w-[min(92vw,28rem)] -translate-x-1/2 items-center gap-3 px-4 py-3 shadow-lg animate-fade-in-up ${
        alerte ? "top-[15rem]" : "top-[4.25rem] lg:top-[4.75rem]"
      }`}
      role="status"
      aria-live="polite"
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
      <span className="text-sm font-medium text-gray-800 dark:text-rdia-50">{toast}</span>
    </div>
  );
}
