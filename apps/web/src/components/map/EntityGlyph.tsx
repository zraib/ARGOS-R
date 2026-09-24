/**
 * Symboles des unités, des abris et des sites mortuaires — répliques en SVG
 * des marqueurs posés sur la carte (lib/map/markers.ts), comme `HealthGlyph`
 * pour les établissements de santé : la légende montre ce que la carte
 * montre (ADR 0036). La légende dessinait encore un carré pour les unités et
 * deux pastilles rondes pour les abris et les morgues, formes abandonnées
 * sur la carte depuis l'ADR 0029.
 *   bouclier = unité · tente = abri · plaque = site mortuaire · plaque sur roues = morgue mobile.
 */
export type EntityGlyphKind = "unit" | "shelter" | "morgue" | "morgue_mobile";

const SVG_STYLE = { display: "block", flexShrink: 0 } as const;
/** Le dessin 24 × 24 du marqueur, ramené au centre de sa pastille. */
const DANS_PASTILLE = "translate(12 12) scale(0.62) translate(-12 -12)";

export function EntityGlyph({ kind, size = 17 }: { kind: EntityGlyphKind; size?: number }) {
  if (kind === "unit") {
    // Le bouclier de l'unité, à la couleur des FAR (chaque corps a la sienne sur la carte).
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={SVG_STYLE}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="#C9A84C" stroke="#0f1f14" strokeWidth={1.6} strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === "shelter") {
    // Pastille claire cerclée de vert (place disponible), tente de la même couleur.
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={SVG_STYLE}>
        <rect x={1.5} y={1.5} width={21} height={21} rx={5} fill="#ffffff" stroke="#15803d" strokeWidth={2.4} />
        <g transform={DANS_PASTILLE}>
          <path d="M12 3L2 21h20L12 3z" fill="#15803d" stroke="#0f1f14" strokeWidth={1.6} strokeLinejoin="round" />
          <path d="M12 12l4 9H8z" fill="#0f1f14" opacity={0.55} />
        </g>
      </svg>
    );
  }
  const mobile = kind === "morgue_mobile";
  // Plaque ardoise pour un site fixe ; pastille ambre, plaque sur roues, pour une morgue mobile déployée.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={SVG_STYLE}>
      {mobile ? (
        <circle cx={12} cy={12} r={10.5} fill="#d97706" stroke="#0f1f14" strokeWidth={1.8} />
      ) : (
        <rect x={1.5} y={1.5} width={21} height={21} rx={3.5} fill="#64748b" stroke="#0f1f14" strokeWidth={1.8} />
      )}
      <g transform={DANS_PASTILLE} fill="none" stroke="#ffffff" strokeWidth={1.9} strokeLinecap="round">
        {mobile ? (
          <>
            <path d="M2 15V7h11v8 M13 10h4l3 3v2 M6 8h3 M7.5 6.5v3" />
            <circle cx={7} cy={18} r={2} />
            <circle cx={17} cy={18} r={2} />
            <path d="M9 18h6" />
          </>
        ) : (
          <path d="M3 21h18 M5 21V11h14v10 M12 3v6 M9 6h6 M9 15h2v6h-2z M13 15h2v6h-2z" />
        )}
      </g>
    </svg>
  );
}
