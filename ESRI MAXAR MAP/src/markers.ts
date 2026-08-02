// ============================================================================
// Rendu HTML des marqueurs. Volontairement sans framework CSS : chaque glyphe
// est un fragment HTML autonome, injecté dans l'élément du marqueur MapLibre.
// Un marqueur peut fournir son propre `html` pour court-circuiter ce rendu.
// ============================================================================

import type { LngLat, MapMarker, MarkerShape, MovingMarker } from "./types";

const FONT = "Inter,system-ui,-apple-system,Segoe UI,sans-serif";

/** Couleur d'accent (or) utilisée pour la sélection et les glyphes par défaut. */
export const ACCENT = "#C9A84C";
/** Contour sombre commun à tous les glyphes. */
export const STROKE = "#0f1720";

/** Halo de sélection appliqué au conteneur du glyphe. */
export function selRing(sel: boolean, color = ACCENT): string {
  return sel ? `box-shadow: 0 0 0 3px ${color}, 0 0 12px ${color}CC; border-radius: 9999px;` : "";
}

function glyph(shape: MarkerShape, color: string, sel: boolean): string {
  const ring = selRing(sel);
  switch (shape) {
    case "square":
      return `<div style="width:16px;height:16px;background:${color};border:2px solid ${STROKE};${ring}"></div>`;
    case "diamond":
      return `<div style="width:14px;height:14px;background:${color};border:2px solid ${STROKE};transform:rotate(45deg);${ring}"></div>`;
    case "cross":
      return (
        `<div style="width:18px;height:18px;background:#fff;border-radius:9999px;border:2px solid ${STROKE};display:flex;align-items:center;justify-content:center;${ring}">` +
        `<span style="color:${color};font:900 12px ${FONT};line-height:1;">+</span></div>`
      );
    case "dashed-circle":
      return (
        `<div style="width:20px;height:20px;border:2px dashed ${color};border-radius:9999px;background:${color}40;display:flex;align-items:center;justify-content:center;${ring}">` +
        `<span style="color:${color};font:900 11px ${FONT};line-height:1;">+</span></div>`
      );
    case "triangle":
      // Le halo de sélection est porté par un conteneur : un <svg> ne prend pas
      // de border-radius pour le box-shadow circulaire.
      return (
        `<div style="width:22px;height:20px;${ring}">` +
        `<svg width="22" height="20" viewBox="0 0 22 20" style="display:block;">` +
        `<path d="M11,1 L21,19 L1,19 Z" fill="${color}" stroke="${STROKE}" stroke-width="1.5"></path>` +
        `<text x="11" y="16" text-anchor="middle" font-size="10" font-weight="900" fill="${STROKE}">!</text></svg></div>`
      );
    case "circle":
    default:
      return `<div style="width:16px;height:16px;background:${color};border-radius:9999px;border:2px solid ${STROKE};${ring}"></div>`;
  }
}

function labelHTML(label: string): string {
  return (
    `<span style="font:700 9px ${FONT};color:#fff;text-shadow:0 1px 2px #000;` +
    `background:rgba(11,15,20,.72);padding:0 4px;border-radius:4px;white-space:nowrap;">${label}</span>`
  );
}

/** Rendu par défaut d'un marqueur (statique ou mobile). */
export function markerHTML(m: MapMarker | MovingMarker, sel: boolean): string {
  if (m.html) return m.html;
  const color = m.color ?? ACCENT;
  const shape = m.shape ?? "circle";
  const inner = glyph(shape, color, sel);
  const pulse = m.pulse
    ? `<div style="position:absolute;inset:-5px;border-radius:9999px;background:${color};opacity:.5;animation:emm-ping 1.8s ease-out infinite;"></div>`
    : "";
  const body = pulse
    ? `<div style="position:relative;display:flex;align-items:center;justify-content:center;">${pulse}<div style="position:relative;">${inner}</div></div>`
    : inner;
  return (
    `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">${body}` +
    (m.label ? labelHTML(m.label) : "") +
    "</div>"
  );
}

/** Position le long d'une polyligne à la progression fractionnaire p ∈ [0,1[. */
export function pointAlong(path: LngLat[], p: number): LngLat {
  if (path.length === 0) return [0, 0];
  if (path.length === 1) return path[0];
  const n = path.length - 1;
  const f = Math.min(Math.max(p, 0) * n, n - 0.0001);
  const i = Math.floor(f);
  const r = f - i;
  return [path[i][0] + (path[i + 1][0] - path[i][0]) * r, path[i][1] + (path[i + 1][1] - path[i][1]) * r];
}

/** Injecte une seule fois l'animation du halo pulsé. */
let injected = false;
export function injectKeyframes(): void {
  if (injected || typeof document === "undefined") return;
  injected = true;
  const el = document.createElement("style");
  el.textContent = "@keyframes emm-ping{0%{transform:scale(1);opacity:.5}70%{transform:scale(2);opacity:0}100%{opacity:0}}";
  document.head.appendChild(el);
}
