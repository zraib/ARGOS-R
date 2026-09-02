// Aides partagées par les composants de SituationalAwarenessPanel.tsx (extraites, exportées).
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
//   - Palette stricte : rdia · or · danger · green · gray (inchangée)
// ========================================================================

export const LEVEL_META: Record<
  GlobalAlertLevel,
  {
    dot: string; tint: string; border: string; bg: string; label: string; scoreFill: string; scoreHex: string;
    banner: string; bannerBg: string; bannerText: string;
    accent: string;
    badgeTint: string;
  }
> = {
  calme: {
    dot: "bg-green-500", tint: "text-green-700 dark:text-green-400",
    bg: "bg-green-50/40 dark:bg-green-500/[0.05]",
    border: "border-green-500/[0.22]",
    label: "Calme", scoreFill: "bg-green-500", scoreHex: "#10B981",
    banner: "border-[#4B7A51]/50",
    bannerBg: "bg-gradient-to-r from-[#4B7A51]/10 via-[#C9A84C]/6 to-transparent dark:from-[#4B7A51]/15 dark:via-[#C9A84C]/8",
    bannerText: "text-[#2E5332] dark:text-[#BFDCC4]",
    accent: "#4B7A51",
    badgeTint: "rgba(16,185,129,0.16)",
  },
  surveillance: {
    dot: "bg-or-500", tint: "text-or-600 dark:text-or-400",
    bg: "bg-or-500/5 dark:bg-or-500/[0.08]",
    border: "border-[#C9A84C]/[0.36]",
    label: "Surveillance", scoreFill: "bg-[#C9A84C]", scoreHex: "#C9A84C",
    banner: "border-[#C9A84C]/50",
    bannerBg: "bg-gradient-to-r from-or-500/15 to-transparent dark:from-or-500/20",
    bannerText: "text-or-600 dark:text-or-300",
    accent: "#C9A84C",
    badgeTint: "rgba(201,168,76,0.20)",
  },
  vigilance: {
    dot: "bg-[#D97706]", tint: "text-[#8A4A06]",
    bg: "bg-amber-500/5 dark:bg-amber-500/[0.08]",
    border: "border-[#C9A84C]/[0.48]",
    label: "Vigilance renforcée", scoreFill: "bg-[#D97706]", scoreHex: "#D97706",
    banner: "border-[#C9A84C]/60",
    bannerBg: "bg-gradient-to-r from-[#D97706]/18 via-[#C9A84C]/10 to-transparent dark:from-[#D97706]/25 dark:via-[#C9A84C]/12",
    bannerText: "text-[#8A4A06] dark:text-[#F6D28A]",
    accent: "#D97706",
    badgeTint: "rgba(217,119,6,0.22)",
  },
  alerte_rouge: {
    dot: "bg-[#B91C1C]", tint: "text-[#7F1D1D]",
    bg: "bg-danger-500/5 dark:bg-danger-500/[0.09]",
    border: "border-[#C9A84C]/[0.36]",
    label: "Alerte rouge", scoreFill: "bg-[#EF4444]", scoreHex: "#B91C1C",
    banner: "border-[#C9A84C]/50",
    bannerBg: "bg-gradient-to-r from-[#B91C1C]/14 via-[#C9A84C]/9 to-transparent dark:from-[#B91C1C]/26 dark:via-[#C9A84C]/10",
    bannerText: "text-[#7F1D1D] dark:text-[#F6BABA]",
    accent: "#B91C1C",
    badgeTint: "rgba(185,28,28,0.20)",
  },
};

export const NIV_COLORS: Record<"faible" | "modere" | "eleve" | "critique", string> = {
  faible: "#10B981", modere: "#4B5563", eleve: "#F59E0B", critique: "#EF4444",
};

export const NIV_TXT: Record<"faible" | "modere" | "eleve" | "critique", string> = {
  faible: "Faible", modere: "Modéré", eleve: "Élevé", critique: "Critique",
};

export const NIV_TXT_CLS: Record<"faible" | "modere" | "eleve" | "critique", string> = {
  faible: "bg-green-500/10 text-green-700 dark:text-green-400",
  modere: "bg-rdia-500/10 text-rdia-700 dark:text-rdia-300",
  eleve: "bg-or-500/10 text-or-700 dark:text-or-300",
  critique: "bg-danger-500/10 text-danger-700 dark:text-danger-300",
};

export const IMPACT_FILL: Record<"haut" | "moyen" | "faible", string> = {
  haut: "#EF4444", moyen: "#F59E0B", faible: "#10B981",
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
export type ToneFill = "rdia" | "or" | "danger" | "green";

export const TONE_HEX: Record<ToneFill, string> = {
  rdia: "#4B5563", or: "#F59E0B", danger: "#EF4444", green: "#10B981",
};

export type BarRow = {
  icon: IconName; label: string; main: string; sub?: string;
  pct: number; tone: ToneFill;
};
