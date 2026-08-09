import type { HospitalKind } from "@/lib/types";
import { kindDef } from "@/lib/hospitals";

/**
 * Symbole d'un établissement de santé — réplique en SVG le marqueur posé sur
 * la carte (lib/map/markers.ts) pour que légendes, filtres et cartographie
 * partagent exactement la même grammaire visuelle :
 *   hexagone = militaire · cercle = civil · pointillé = hôpital de campagne.
 */
export function HealthGlyph({ kind, size = 18 }: { kind: HospitalKind; size?: number }) {
  const d = kindDef(kind);
  const mil = d.reseau === "militaire";
  const dash = d.campagne ? "2.6 2" : undefined;
  const glyphColor = mil ? "#F5DE9B" : d.color;
  // Hexagone pointe en haut, inscrit dans le carré 24×24 (mêmes proportions
  // que le clip-path du marqueur de carte).
  const hex = "M12 1.2 22 7v10l-10 5.8L2 17V7z";

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
      {mil ? (
        <>
          <path d={hex} fill="#1B4D2E" stroke={d.color} strokeWidth={2.2} strokeDasharray={dash} strokeLinejoin="round" />
        </>
      ) : (
        <circle cx={12} cy={12} r={10.2} fill="#ffffff" stroke={d.color} strokeWidth={2.4} strokeDasharray={dash} />
      )}
      <g transform="translate(12 12) scale(0.42) translate(-13 -10)">
        {d.campagne ? (
          <g transform="translate(3 0) scale(1.05)">
            <path fill={glyphColor} d="M10 3.2 2.4 15.6h4.9L10 10.4l2.7 5.2h4.9z" />
            <path fill={mil ? "#1B4D2E" : "#ffffff"} d="M9.2 11.2h1.6v1.5h1.5v1.6h-1.5v1.5H9.2v-1.5H7.7v-1.6h1.5z" />
          </g>
        ) : (
          <>
            <path
              fillRule="evenodd"
              fill={glyphColor}
              d="M8,10 m-8,0 a8,8 0 1,0 16,0 a8,8 0 1,0 -16,0 M10.8,10 m-5.8,0 a5.8,5.8 0 1,0 11.6,0 a5.8,5.8 0 1,0 -11.6,0"
            />
            <path fill={glyphColor} d="M19 5.5h4v3h3v4h-3v3h-4v-3h-3v-4h3z" />
          </>
        )}
      </g>
    </svg>
  );
}
