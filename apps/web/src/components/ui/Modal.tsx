"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { useArgos } from "@/lib/store";

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
 * La pile des modales ouvertes, dans l'ordre d'ouverture. Seule celle du
 * dessus répond à Échap et tient le piège à focus : sans cela, une modale
 * ouverte depuis une autre (le bilan des victimes depuis la fiche d'incident,
 * la création d'un hôpital depuis un compte) fermait les deux d'un coup, et
 * la modale du dessous ramenait le focus chez elle à chaque tabulation.
 */
const PILE: symbol[] = [];

/**
 * Recrée le <Modal> d'AminDesign : voile, panneau rounded-2xl, fermeture par Échap.
 * Adaptatif : feuille ancrée en bas et pleine largeur sous `sm`, boîte centrée
 * au-dessus. Hauteur bornée en `dvh` (la barre d'adresse mobile rétracte `vh`),
 * en-tête figé pour que la fermeture reste atteignable pendant le défilement.
 *
 * RENDUE DANS <body> (portail), jamais dans l'élément qui l'ouvre : une modale
 * ouverte depuis une autre restait autrement enfermée dans la surface de la
 * première — recadrée, tronquée, à faire défiler dans une boîte — parce qu'un
 * ancêtre à `overflow` ou à `backdrop-filter` devient le bloc contenant d'un
 * `position: fixed`. Chaque modale a désormais tout l'écran ; la dernière
 * ouverte passe au-dessus.
 */
export function Modal({ open, title, onClose, size = "lg", children }: ModalProps) {
  const mapFull = useArgos((st) => st.mapFull);
  const panneau = useRef<HTMLDivElement>(null);
  const id = useRef<symbol>(Symbol("modal"));
  // Le portail n'a de cible qu'après le montage : au rendu serveur, rien.
  const [monte, setMonte] = useState(false);
  useEffect(() => setMonte(true), []);
  /**
   * `onClose` gardé dans une RÉFÉRENCE, et l'effet ne dépend que de `open`.
   *
   * La plupart des appelants passent une fonction fléchée définie dans leur
   * corps de rendu : son identité change à chaque rendu, donc à chaque frappe.
   * Avec `onClose` en dépendance, l'effet se démontait puis se remontait à
   * chaque caractère tapé — rendant le focus au déclencheur, puis le posant sur
   * le premier élément focalisable de la boîte. Le curseur sautait hors du
   * champ en cours de saisie, dans TOUTES les modales de l'application.
   *
   * La référence est mise à jour à chaque rendu : la fermeture appelle donc
   * toujours la version courante, sans que l'installation ne rejoue.
   */
  const fermer = useRef(onClose);
  fermer.current = onClose;

  useEffect(() => {
    if (!open) return;
    const moi = id.current;
    PILE.push(moi);
    const auDessus = () => PILE[PILE.length - 1] === moi;

    // Le focus est RENDU à l'élément qui a ouvert la modale : sans cela il
    // retombe sur <body> à la fermeture, et la navigation au clavier repart du
    // haut de la page — on perd sa place à chaque consultation.
    const declencheur = document.activeElement as HTMLElement | null;

    // Le fond ne défile plus derrière la modale : le geste de molette y était
    // capté par la page et non par la boîte, qui semblait alors figée.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = () =>
      Array.from(
        panneau.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null);

    const onKey = (e: KeyboardEvent) => {
      // Une modale en couvre une autre : seule celle du dessus répond.
      if (!auDessus()) return;
      if (e.key === "Escape") {
        fermer.current();
        return;
      }
      // PIÈGE À FOCUS. Sans lui, la tabulation sort de la modale et parcourt la
      // page qu'elle recouvre : un utilisateur au clavier se retrouve à piloter
      // un écran qu'il ne voit plus.
      if (e.key !== "Tab") return;
      const f = focusables();
      if (f.length === 0) return;
      const premier = f[0];
      const dernier = f[f.length - 1];
      const actif = document.activeElement;
      if (e.shiftKey && (actif === premier || !panneau.current?.contains(actif))) {
        e.preventDefault();
        dernier.focus();
      } else if (!e.shiftKey && actif === dernier) {
        e.preventDefault();
        premier.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    // Le focus entre dans la boîte à l'ouverture, sinon le lecteur d'écran
    // continue d'annoncer la page du dessous.
    const t = window.setTimeout(() => {
      if (panneau.current?.contains(document.activeElement)) return;
      (focusables()[0] ?? panneau.current)?.focus();
    }, 0);

    return () => {
      const k = PILE.indexOf(moi);
      if (k >= 0) PILE.splice(k, 1);
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
      document.body.style.overflow = overflow;
      // Le focus ne revient au déclencheur que s'il était encore DANS la boîte ;
      // s'il est déjà ailleurs (un champ en cours de saisie), on ne le vole pas.
      if (panneau.current?.contains(document.activeElement)) declencheur?.focus?.();
    };
  }, [open]);

  if (!open || !monte) return null;

  return createPortal(
    // Au-dessus de la carte en plein écran (z-9999) quand elle l'est (ADR 0032) :
    // une modale ouverte depuis la carte — déclarer un incident, voir une fiche — reste visible.
    <div className={`fixed inset-0 flex items-end justify-center sm:items-center sm:p-4 ${mapFull ? "z-[10005]" : "z-50"}`}>
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panneau}
        tabIndex={-1}
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
        {/* Seul le corps défile, et VERTICALEMENT seulement : un axe `visible`
            à côté d'un axe `auto` devient `auto` lui aussi, et tout enfant trop
            large ouvrait un défilement horizontal au lieu d'être contenu.
            `overscroll-contain` empêche l'entraînement de la page derrière la
            modale sur mobile. */}
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pb-4 sm:px-6 sm:pb-6">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
