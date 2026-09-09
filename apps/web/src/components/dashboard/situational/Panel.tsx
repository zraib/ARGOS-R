"use client";

import { type ReactNode } from "react";
import { cn } from "@/components/dashboard/situational/shared";

/**
 * Panneau de la conscience situationnelle.
 *
 * Il se présente EXACTEMENT comme les tuiles du tableau de bord qui
 * l'entourent (`DashTile`) : la carte du produit, un filet de séparation gris,
 * un titre `text-sm font-semibold` en vert militaire, une méta discrète à
 * droite.
 *
 * Ont disparu : le trait d'accent coloré au-dessus du titre — vert, rouge ou
 * doré selon le panneau —, la pastille de lettre en capitales dorées à fort
 * interlettrage, et le titre en graisse et taille propres. Aucun de ces trois
 * éléments n'existe ailleurs dans l'application ; ensemble ils faisaient de ce
 * panneau une pièce rapportée.
 */
export function Panel({
  title, right, children, className,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("carte flex min-h-0 w-full flex-col", className)}>
      <header className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-2.5 dark:border-rdia-700/50 sm:px-5">
        <h3 className="min-w-0 truncate text-sm font-semibold text-rdia-600 dark:text-rdia-50">{title}</h3>
        {right && (
          <span className="shrink-0 text-xs text-gray-500 dark:text-rdia-300">{right}</span>
        )}
      </header>
      <div className="min-h-0 flex-1 px-4 py-3 sm:px-5 sm:py-3.5">{children}</div>
    </section>
  );
}
