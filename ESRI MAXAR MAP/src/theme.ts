// Styles des surcouches posées sur la carte. Tout est en style inline : le
// composant ne dépend d'aucun framework CSS et s'intègre tel quel dans un
// projet Tailwind, CSS Modules, styled-components ou CSS classique.
//
// Ton neutre (ardoise très sombre) et volontairement pas teinté : sur de
// l'imagerie satellite, un panneau coloré se confond avec le terrain et devient
// illisible.

import type { CSSProperties } from "react";

export const OVERLAY: CSSProperties = {
  background: "rgba(11,15,20,0.92)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 8,
  boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
  color: "rgba(255,255,255,0.9)",
  fontFamily: "Inter,system-ui,-apple-system,Segoe UI,sans-serif",
  fontSize: 11,
};

export const PANEL: CSSProperties = {
  ...OVERLAY,
  padding: "6px 10px",
};

/** Bouton d'une surcouche, état inactif. */
export const BTN: CSSProperties = {
  ...PANEL,
  cursor: "pointer",
  fontWeight: 700,
  lineHeight: 1.4,
};

/** Bouton d'une surcouche, état actif (accent or). */
export const BTN_ON: CSSProperties = {
  ...BTN,
  background: "#C9A84C",
  color: "#0f1720",
  border: "1px solid #C9A84C",
};

export const ACCENT_TEXT: CSSProperties = { color: "#C9A84C" };
export const MUTED_TEXT: CSSProperties = { color: "rgba(255,255,255,0.55)" };
export const DANGER_TEXT: CSSProperties = { color: "#F87171" };

export const MONO: CSSProperties = {
  fontFamily: "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
};

/** Couleur du tracé de mesure / itinéraire. */
export const MEASURE_COLOR = "#38BDF8";
