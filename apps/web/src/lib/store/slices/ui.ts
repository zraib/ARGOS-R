// ============================================================================
// lib/store/slices/ui.ts — coquille : langue, thème, navigation, toasts, assistant de déclaration, Copilot
//
// Tranche du magasin Zustand. `set`/`get` portent sur l'état COMPLET
// (ArgosState) : une tranche peut lire les autres, jamais les importer.
// ============================================================================

import type { StateCreator } from "zustand";
import type { ArgosState } from "@/lib/store";
import type {
  Incident,
  Lang,
  } from "@/lib/types";
import type { Dict } from "@/lib/i18n/translations";
import type { ModulesDict } from "@/lib/i18n/modules";
import { FR_DICT } from "@/lib/i18n/translations.fr";
import { FR_MODULES } from "@/lib/i18n/modules.fr";
import { loadLangResources } from "@/lib/i18n/loader";
import {
  THEME_KEY,
  LANG_KEY,
  SOUNDS_KEY,
  DEFAULT_SOUNDS,
  NavGroups,
  SoundPrefs,
  toastTimerRef,
  } from "@/lib/store/shared";

export interface UiSlice {
  lang: Lang;
  /**
   * Dictionnaires de la langue ACTIVE, portés par l'état (F-11).
   *
   * Seul le français est lié statiquement ; les autres langues arrivent par
   * import dynamique à la bascule. `setLang` committe dictionnaire ET langue
   * dans un même set() : `dir="rtl"` ne peut donc jamais s'appliquer avant
   * l'arrivée des libellés arabes.
   */
  dict: Dict;
  modulesDict: ModulesDict;
  dark: boolean;
  sbOpen: boolean;
  /**
   * Tiroir de navigation MOBILE (< lg), distinct de `sbOpen`.
   *
   * Sur grand écran, `sbOpen` replie la barre latérale sans jamais la masquer.
   * Sur mobile il n'y a pas la place : la navigation devient un tiroir posé
   * PAR-DESSUS le contenu, fermé par défaut. Deux états séparés, car un
   * opérateur qui replie sa barre au bureau ne doit pas retrouver son tiroir
   * ouvert sur téléphone.
   */
  navOpen: boolean;
  navGroups: NavGroups;
  toast: string | null;
  wizOpen: boolean;
  /** true = la modale Copilot général est ouverte (⌘K / Ctrl+K) */
  copilotOpen: boolean;
  /** Incident en cours d'édition dans l'assistant (null = création). */
  wizEdit: Incident | null;
  /** Coordonnées [lng, lat] pré-remplies quand le wizard est ouvert depuis la carte */
  wizInitLL: [number, number] | null;
  /** Incident parent quand on déclare un incident RATTACHÉ (mêmes étapes, présenté sous le parent). */
  wizParent: Incident | null;
  openWizardNested: (parent: Incident) => void;
  /** Signatures sonores activées sur ce poste (messages, autres notifications). */
  sounds: SoundPrefs;
  setLang: (lang: Lang) => void;
  setSound: (kind: keyof SoundPrefs, on: boolean) => void;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  toggleNav: () => void;
  closeNav: () => void;
  toggleNavGroup: (g: keyof NavGroups) => void;
  openNavGroup: (g: keyof NavGroups) => void;
  showToast: (msg: string) => void;
  openWizard: (initLL?: [number, number]) => void;
  /** Ouvre l'assistant en mode édition (pré-rempli depuis un incident existant). */
  openWizardEdit: (inc: Incident) => void;
  closeWizard: () => void;
  /** Ouvre/ferme la modale Copilot général (⌘K). */
  openCopilot: () => void;
  closeCopilot: () => void;
  toggleCopilot: () => void;
  /**
   * La carte occupe tout l'écran (ADR 0032) : le centre de communication, le
   * copilote et le briefing passent alors AU-DESSUS d'elle au lieu de
   * disparaître dessous.
   */
  mapFull: boolean;
  setMapFull: (on: boolean) => void;
  /** Fenêtre flottante du briefing (ADR 0032) : ouverte ou non, et sur quel incident. */
  briefingOpen: boolean;
  briefingIncident: string | null;
  openBriefing: (incidentId?: string | null) => void;
  closeBriefing: () => void;
}

export const createUiSlice: StateCreator<ArgosState, [], [], UiSlice> = (set, get) => ({
  lang: "fr",
  dict: FR_DICT,
  modulesDict: FR_MODULES,
  dark: true,
  sbOpen: true,
  navOpen: false,
  navGroups: { res: false, dis: false, cmd: false },
  toast: null,
  wizOpen: false,
  copilotOpen: false,
  wizEdit: null,
  wizInitLL: null,
  wizParent: null,
  sounds: DEFAULT_SOUNDS,
  setSound: (kind, on) =>
    set((s) => {
      const sounds = { ...s.sounds, [kind]: on };
      if (typeof window !== "undefined") localStorage.setItem(SOUNDS_KEY, JSON.stringify(sounds));
      return { sounds };
    }),
  setLang: (lang) => {
    if (typeof window !== "undefined") localStorage.setItem(LANG_KEY, lang);
    // Chargement PUIS commit : tant que le dictionnaire demandé n'est pas là,
    // rien ne bouge (ni libellés, ni direction RTL). En cas d'échec réseau on
    // reste simplement sur la langue courante — jamais d'interface muette.
    void loadLangResources(lang)
      .then((res) => set({ lang, dict: res.dict, modulesDict: res.modules }))
      .catch(() => {});
  },
  toggleTheme: () => {
    const dark = !get().dark;
    if (typeof window !== "undefined") {
      localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
      document.documentElement.classList.toggle("dark", dark);
    }
    set({ dark });
  },
  toggleSidebar: () => set((s) => ({ sbOpen: !s.sbOpen })),
  toggleNav: () => set((s) => ({ navOpen: !s.navOpen })),
  closeNav: () => set({ navOpen: false }),
  toggleNavGroup: (g) => set((s) => ({ navGroups: { ...s.navGroups, [g]: !s.navGroups[g] } })),
  openNavGroup: (g) => set((s) => ({ sbOpen: true, navGroups: { ...s.navGroups, [g]: true } })),
  showToast: (msg) => {
    clearTimeout(toastTimerRef.current);
    set({ toast: msg });
    toastTimerRef.current = setTimeout(() => set({ toast: null }), 4000);
  },
  openWizard: (initLL) => set({ wizOpen: true, wizInitLL: initLL ?? null, wizEdit: null, wizParent: null }),
  openWizardEdit: (inc) => set({ wizOpen: true, wizInitLL: null, wizEdit: inc, wizParent: null }),
  // Rattaché : le point de départ est celui du parent, l'opérateur l'ajuste.
  openWizardNested: (parent) => set({ wizOpen: true, wizInitLL: parent.ll, wizEdit: null, wizParent: parent }),
  closeWizard: () => set({ wizOpen: false, wizInitLL: null, wizEdit: null, wizParent: null }),
  openCopilot: () => set({ copilotOpen: true }),
  closeCopilot: () => set({ copilotOpen: false }),
  toggleCopilot: () => set((s) => ({ copilotOpen: !s.copilotOpen })),
  mapFull: false,
  setMapFull: (on) => set({ mapFull: on }),
  briefingOpen: false,
  briefingIncident: null,
  // Sans incident désigné, la fenêtre s'ouvre sur le dernier choisi (ou propose le choix).
  openBriefing: (incidentId) => set((s) => ({ briefingOpen: true, briefingIncident: incidentId ?? s.briefingIncident })),
  closeBriefing: () => set({ briefingOpen: false }),
});
