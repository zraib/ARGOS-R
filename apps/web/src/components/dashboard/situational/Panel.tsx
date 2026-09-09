"use client";

import { type ReactNode } from "react";
import { cn, PanelId, TOKEN, type ToneFill } from "@/components/dashboard/situational/shared";

/**
 * Panneau encadré de la conscience situationnelle.
 *
 * Il s'habille comme TOUTES les cartes de l'application : la classe `.carte`
 * (bord, fond, ombre, et surtout son pendant sombre). Auparavant il peignait
 * `bg-white/85` sans variante sombre — les panneaux restaient donc blancs au
 * milieu d'un poste de commandement en vert militaire.
 *
 * L'accent n'est plus un hexadécimal libre mais un TON du projet : le halo, le
 * filet de tête et la bordure en découlent, et aucun écran ne peut introduire
 * une couleur qui n'existe pas dans `tailwind.config.ts`.
 */
const HALO: Record<ToneFill, string> = {
  or: TOKEN.or500,
  danger: TOKEN.danger500,
  green: TOKEN.green500,
  rdia: TOKEN.rdia600,
  gray: TOKEN.gray500,
};

export function Panel({
  id, title, right, ton = "or", children, className,
}: {
  id: PanelId;
  title: string;
  right?: ReactNode;
  /** Ton du panneau, pris dans la palette du projet. */
  ton?: ToneFill;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "carte group relative isolate flex min-h-0 w-full flex-col overflow-hidden transition-transform duration-300 hover:-translate-y-0.5",
        className,
      )}
    >
      {/* Filet d'accent en tête : la seule signature graphique conservée. Le
          balayage lumineux au survol et le halo flou ont été retirés — ils
          n'apprenaient rien et ne se retrouvaient nulle part ailleurs. */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-4 top-0 h-[3px] w-14 rounded-b"
        style={{ background: `linear-gradient(90deg, ${HALO[ton]}, transparent)` }}
      />

      <header className="relative z-10 flex items-center justify-between gap-2 border-b border-gray-100 px-4 pb-2.5 pt-3 dark:border-rdia-600 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded-md border border-or-500/40 bg-or-500/10 px-1.5 py-0.5 text-[9.5px] font-black uppercase tracking-[0.2em] text-or-600 dark:text-or-400">
            {id}
          </span>
          <h3 className="min-w-0 truncate text-[12.5px] font-bold tracking-tight text-rdia-600 dark:text-rdia-50 sm:text-[13px]">
            {title}
          </h3>
        </div>
        <div className="shrink-0 text-[10px] font-semibold text-or-600/85 dark:text-or-400/85 sm:text-[10.5px]">
          {right}
        </div>
      </header>

      <div className="relative z-10 min-h-0 flex-1 px-4 py-3 sm:px-5 sm:py-3.5">{children}</div>
    </section>
  );
}
