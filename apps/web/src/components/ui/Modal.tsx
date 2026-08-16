"use client";

import { useEffect, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";

// Largeurs maximales appliquées seulement à partir de `sm` : sous ce seuil la
// modale occupe toute la largeur de l'écran (feuille ancrée en bas).
const SIZES = {
  sm: "sm:max-w-md",
  md: "sm:max-w-xl",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
  "2xl": "sm:max-w-6xl",
} as const;

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  size?: keyof typeof SIZES;
  children: ReactNode;
}

/**
 * Recrée le <Modal> d'AminDesign : voile, panneau rounded-2xl, fermeture par Échap.
 * Adaptatif : feuille ancrée en bas et pleine largeur sous `sm`, boîte centrée
 * au-dessus. Hauteur bornée en `dvh` (la barre d'adresse mobile rétracte `vh`),
 * en-tête figé pour que la fermeture reste atteignable pendant le défilement.
 */
export function Modal({ open, title, onClose, size = "lg", children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-gray-100 bg-white shadow-2xl animate-fade-in-up sm:rounded-2xl dark:border-rdia-600 dark:bg-rdia-700 ${SIZES[size]}`}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-4 pb-3 pt-4 sm:border-b-0 sm:px-6 sm:pb-5 sm:pt-6 dark:border-rdia-600">
          <h2 className="min-w-0 truncate text-base font-bold text-rdia-600 dark:text-rdia-50">{title}</h2>
          <button
            className="cible-tactile -me-1.5 flex shrink-0 items-center justify-center rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-or-500 dark:hover:bg-rdia-600"
            onClick={onClose}
            aria-label="Fermer"
          >
            <Icon path={UI_ICONS.close} size={16} strokeWidth={2} />
          </button>
        </div>
        {/* Seul le corps défile : `overscroll-contain` empêche l'entraînement de
            la page située derrière la modale sur mobile. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-6 sm:pb-6">
          {children}
        </div>
      </div>
    </div>
  );
}
