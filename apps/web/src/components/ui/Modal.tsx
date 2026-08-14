"use client";

import { useEffect, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";

const SIZES = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  "2xl": "max-w-6xl",
} as const;

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  size?: keyof typeof SIZES;
  children: ReactNode;
}

/** Recrée le <Modal> d'AminDesign : voile, panneau rounded-2xl, fermeture par Échap. */
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full ${SIZES[size]} max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-100 bg-white p-6 shadow-2xl animate-fade-in-up dark:border-rdia-600 dark:bg-rdia-700`}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-rdia-600 dark:text-rdia-50">{title}</h2>
          <button
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-or-500 dark:hover:bg-rdia-600"
            onClick={onClose}
            aria-label="Fermer"
          >
            <Icon path={UI_ICONS.close} size={16} strokeWidth={2} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
