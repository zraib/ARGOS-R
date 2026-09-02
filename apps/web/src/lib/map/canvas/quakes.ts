// ============================================================================
// lib/map/canvas/quakes.ts — séismes (bandeau, popup, style des points)
// Fonctions PURES extraites de MapCanvas.tsx : aucun état React, aucune
// référence à la carte vivante. Testables seules (vitest).
// ============================================================================

import maplibregl from "maplibre-gl";

/** Heure locale compacte pour le bandeau séisme. */
export function qLocalTime(iso: string, lang: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const locale = lang === "ar" ? "ar-MA" : lang === "en" ? "en-GB" : "fr-FR";
  return d.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

/** Échappe le texte externe (EMSC) avant injection HTML dans la popup. */
export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));
}

/** Couleur hex du bandeau selon la magnitude. */
export function qMagHex(m: number): { bg: string; fg: string } {
  if (m >= 5) return { bg: "#ef4444", fg: "#ffffff" };
  if (m >= 4) return { bg: "#C9A84C", fg: "#12210f" };
  if (m >= 3) return { bg: "#fbbf24", fg: "#3a2f0a" };
  return { bg: "#9ca3af", fg: "#1f2937" };
}

// Style de la couche sismique (partagé setupStyle / animation de pulsation).
export const QUAKE_COLOR: maplibregl.DataDrivenPropertyValueSpecification<string> =
  ["step", ["get", "mag"], "#94a3b8", 3, "#fbbf24", 4, "#f59e0b", 5, "#ef4444"];
export const QUAKE_HALO_R: maplibregl.DataDrivenPropertyValueSpecification<number> =
  ["interpolate", ["linear"], ["get", "mag"], 3, 12, 5, 30, 7, 52];
export const QUAKE_DOT_R: maplibregl.DataDrivenPropertyValueSpecification<number> =
  ["interpolate", ["linear"], ["get", "mag"], 2, 5, 5, 13, 7, 22];
