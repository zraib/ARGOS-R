// Aides partagées par les composants de SituationalAwarenessPanel.tsx (extraites, exportées).
import type { ModulesDict } from "@/lib/i18n/modules";
import { UI_ICONS, KPI_ICONS, FLUX_ICONS, TYPE_ICONS } from "@/lib/icons";
import type { GlobalAlertLevel } from "@/lib/ai/situational/types";

export const ICONS: Record<string, string> = { ...FLUX_ICONS, ...KPI_ICONS, ...UI_ICONS, ...TYPE_ICONS };

export type IconName = keyof typeof ICONS;

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// ========================================================================
// Conscience Situationnelle IA · REDESIGN (version 2)
// ------------------------------------------------------------------------
// Direction · COMMAND-CENTER (militaire ARGOS) :
//   - Header MAITRISÉ : bandeau niveau global + score GAUGE circulaire + synthèse
//   - Panneaux encadrés (style panels command) · chaque section = panel indépendant
//   - Header panel : badge id · title · right meta
//   - Texture grid fine + halo accent glow hover + micro-interactions
//   - Palette STRICTEMENT celle du projet : rdia · or · danger · green · gray,
//     par les tokens de `tailwind.config.ts` — voir TOKEN ci-dessous.
// ========================================================================

/**
 * Valeurs LITTÉRALES des tokens du projet (`tailwind.config.ts`).
 *
 * Un SVG et un dégradé CSS ne savent pas lire une classe Tailwind : il leur
 * faut une couleur écrite. Elles sont donc déclarées ICI, une fois, à
 * l'identique des tokens — et non semées en hexadécimal dans les composants,
 * où elles avaient dérivé vers une palette parallèle (ambre, émeraude, violet)
 * étrangère au reste de l'application.
 */
export const TOKEN = {
  rdia300: "#4A6741", // rdia-300 · rgb(74 103 65)
  rdia600: "#1B4D2E", // rdia-600 · rgb(27 77 46)
  or300: "#E8C96A", //   or-300   · rgb(232 201 106)
  or500: "#C9A84C", //   or-500   · rgb(201 168 76)
  or600: "#A88B3D", //   or-600   · rgb(168 139 61)
  or700: "#7E6A32", //   or-700   · rgb(126 106 50)
  danger100: "#FEE2E2", // danger-100
  danger500: "#EF4444", // danger-500 · rgb(239 68 68)
  danger600: "#DC2626", // danger-600 · rgb(220 38 38)
  green500: "#22C55E", // green-500 (Tailwind, employé par tout le module)
  green600: "#16A34A", // green-600 — même valeur que `satStroke` d'OPSnet
  gray500: "#6B7280", // gray-500 — état neutre
} as const;

export const LEVEL_META: Record<
  GlobalAlertLevel,
  {
    dot: string; tint: string; border: string; bg: string; labelKey: keyof ModulesDict["situational"]; scoreFill: string; scoreHex: string;
    banner: string; bannerBg: string; bannerText: string;
    accent: string;
    badgeTint: string;
  }
> = {
  calme: {
    dot: "bg-green-500", tint: "text-green-700 dark:text-green-400",
    bg: "bg-green-50/40 dark:bg-green-500/[0.05]",
    border: "border-green-500/[0.22]",
    labelKey: "level_calme", scoreFill: "bg-green-500", scoreHex: TOKEN.green500,
    banner: "border-green-600/50",
    bannerBg: "bg-gradient-to-r from-green-600/10 via-or-500/[0.06] to-transparent dark:from-green-600/15 dark:via-or-500/[0.08]",
    bannerText: "text-green-800 dark:text-green-300",
    accent: TOKEN.green600,
    badgeTint: "rgba(34,197,94,0.14)",
  },
  surveillance: {
    dot: "bg-or-500", tint: "text-or-700 dark:text-or-300",
    bg: "bg-or-500/[0.06] dark:bg-or-500/[0.08]",
    border: "border-or-500/[0.36]",
    labelKey: "level_surveillance", scoreFill: "bg-or-500", scoreHex: TOKEN.or500,
    banner: "border-or-500/50",
    bannerBg: "bg-gradient-to-r from-or-500/12 via-or-500/[0.06] to-transparent dark:from-or-500/18 dark:via-or-500/[0.08]",
    bannerText: "text-or-700 dark:text-or-300",
    accent: TOKEN.or500,
    badgeTint: "rgba(201,168,76,0.18)",
  },
  vigilance: {
    dot: "bg-or-600", tint: "text-or-700 dark:text-or-300",
    bg: "bg-or-600/[0.08] dark:bg-or-600/[0.10]",
    border: "border-or-500/[0.48]",
    labelKey: "level_vigilance", scoreFill: "bg-or-600", scoreHex: TOKEN.or600,
    banner: "border-or-500/60",
    bannerBg: "bg-gradient-to-r from-or-600/18 via-or-500/10 to-transparent dark:from-or-600/25 dark:via-or-500/12",
    bannerText: "text-or-700 dark:text-or-300",
    accent: TOKEN.or600,
    badgeTint: "rgba(168,139,61,0.20)",
  },
  alerte_rouge: {
    dot: "bg-danger-500", tint: "text-danger-600 dark:text-danger-400",
    bg: "bg-danger-500/[0.07] dark:bg-danger-500/[0.10]",
    border: "border-or-500/[0.36]",
    labelKey: "level_alerte_rouge", scoreFill: "bg-danger-500", scoreHex: TOKEN.danger600,
    banner: "border-or-500/50",
    bannerBg: "bg-gradient-to-r from-danger-600/14 via-or-500/[0.09] to-transparent dark:from-danger-600/26 dark:via-or-500/10",
    bannerText: "text-danger-600 dark:text-danger-400",
    accent: TOKEN.danger600,
    badgeTint: "rgba(239,68,68,0.18)",
  },
};

export const NIV_COLORS: Record<"faible" | "modere" | "eleve" | "critique", string> = {
  faible: TOKEN.green500, modere: TOKEN.gray500, eleve: TOKEN.or500, critique: TOKEN.danger500,
};

/** Clé du libellé de niveau dans `ModulesDict["situational"]`. */
export const NIV_KEY: Record<"faible" | "modere" | "eleve" | "critique", keyof ModulesDict["situational"]> = {
  faible: "niv_faible", modere: "niv_modere", eleve: "niv_eleve", critique: "niv_critique",
};

export const NIV_TXT_CLS: Record<"faible" | "modere" | "eleve" | "critique", string> = {
  faible: "bg-green-500/10 text-green-700 dark:text-green-400",
  modere: "bg-rdia-500/10 text-rdia-700 dark:text-rdia-300",
  eleve: "bg-or-500/10 text-or-700 dark:text-or-300",
  critique: "bg-danger-500/10 text-danger-700 dark:text-danger-300",
};

export const IMPACT_FILL: Record<"haut" | "moyen" | "faible", string> = {
  haut: TOKEN.danger500, moyen: TOKEN.or500, faible: TOKEN.green500,
};

export const IMPACT_CLS: Record<"haut" | "moyen" | "faible", string> = {
  haut: "bg-danger-500/12 text-danger-700 dark:text-danger-300",
  moyen: "bg-or-500/12 text-or-700 dark:text-or-300",
  faible: "bg-green-500/12 text-green-700 dark:text-green-400",
};

// ---------- Panel (Section encadrée PREMIUM Editorial Executive) ----------
export type PanelId = "A" | "B" | "C" | "D" | "E" | "F" | "G";

export type Props = { className?: string; bare?: boolean };

// ---------- helpers ----------
export function fmtDur(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "0 min";
  if (min >= 60 * 48) return "> 48 h";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m}`;
}

export function fmtTimeHhMm(tsMs: number): string {
  return new Date(tsMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ---------- Anticipations ForeBars redesign · cartes 4 rows ----------------
export type ToneFill = "rdia" | "or" | "danger" | "green" | "gray";

// Le ton `rdia` peignait du GRIS : il porte désormais la couleur du token dont
// il porte le nom, et l'état neutre a son propre ton.
export const TONE_HEX: Record<ToneFill, string> = {
  rdia: TOKEN.rdia600, or: TOKEN.or500, danger: TOKEN.danger500, green: TOKEN.green500, gray: TOKEN.gray500,
};

/**
 * Habillage d'un ton, EN CLASSES — la façon dont le reste de l'application
 * colore un élément (voir `StatTile`, `EtatUnite` d'OPSnet, `occBarClass`).
 *
 * Les tuiles se peignaient jusqu'ici en style en ligne, à partir d'une couleur
 * et de suffixes d'opacité (`${hex}28`, `${hex}09`, `boxShadow ${hex}aa`). Elles
 * avaient donc un bord, un fond et une ombre teintés que l'on ne trouve sur
 * aucune autre carte du produit. Ici, un ton donne la pastille d'icône, la
 * couleur de chiffre, le remplissage de barre et le badge — rien d'autre.
 */
export const TONE_CLS: Record<ToneFill, { chip: string; text: string; fill: string; badge: string }> = {
  or: {
    chip: "bg-or-500/15 text-or-500",
    text: "text-or-600 dark:text-or-400",
    fill: "bg-or-500",
    badge: "bg-or-500/12 text-or-700 dark:text-or-300",
  },
  danger: {
    chip: "bg-danger-500/10 text-danger-500",
    text: "text-danger-600 dark:text-danger-400",
    fill: "bg-danger-500",
    badge: "bg-danger-500/12 text-danger-700 dark:text-danger-300",
  },
  green: {
    chip: "bg-green-500/10 text-green-600",
    text: "text-green-700 dark:text-green-400",
    fill: "bg-green-500",
    badge: "bg-green-500/12 text-green-700 dark:text-green-400",
  },
  rdia: {
    chip: "bg-rdia-500/10 text-rdia-500 dark:text-rdia-200",
    text: "text-rdia-600 dark:text-rdia-100",
    fill: "bg-rdia-500",
    badge: "bg-rdia-500/10 text-rdia-700 dark:text-rdia-300",
  },
  gray: {
    chip: "bg-gray-400/20 text-gray-500 dark:text-rdia-200",
    text: "text-gray-600 dark:text-rdia-200",
    fill: "bg-gray-400",
    badge: "bg-gray-400/15 text-gray-600 dark:text-rdia-300",
  },
};

/** Surface d'une tuile posée DANS un panneau — la même que les blocs de chiffres d'Hospinet. */
export const TUILE = "rounded-lg bg-gray-50 p-3 dark:bg-rdia-800/50";

/** Impact d'un facteur critique → ton du projet. */
export const IMPACT_TONE: Record<"haut" | "moyen" | "faible", ToneFill> = {
  haut: "danger", moyen: "or", faible: "green",
};

/** Niveau de risque → ton du projet (mêmes seuils que `satTint`). */
export const NIV_TONE: Record<"faible" | "modere" | "eleve" | "critique", ToneFill> = {
  critique: "danger", eleve: "or", modere: "gray", faible: "green",
};

export type BarRow = {
  icon: IconName; label: string; main: string; sub?: string;
  pct: number; tone: ToneFill;
};
