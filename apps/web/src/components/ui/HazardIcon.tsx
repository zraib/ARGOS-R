import { HAZARD_PICTOGRAMS, type HazardKind, type HazardShape } from "@/lib/hazard/pictograms";

// ============================================================================
// Rendu React des pictogrammes de danger (lot N-1)
//
// Le composant `Icon` du reste de l'application rend un tracé MONOCHROME en
// trait, teinté par `currentColor`. Une étiquette ADR ne s'y prête pas : elle
// est définie par ses aplats — losange blanc, moitié jaune, symbole noir. La
// reteinter la rendrait fausse, et une signalisation fausse affirme quelque
// chose plutôt que de se taire.
//
// La géométrie vient de `lib/hazard/pictograms.ts`, partagée avec les marqueurs
// de carte. Ce fichier ne fait que la traduire en JSX.
// ============================================================================

function Shape({ s, k }: { s: HazardShape; k: number }) {
  const fill = "fill" in s && s.fill !== undefined ? s.fill : "none";
  const stroke = "stroke" in s ? s.stroke : undefined;
  const sw = "sw" in s ? s.sw : undefined;
  const cap = "cap" in s ? s.cap : undefined;
  const common = { fill, stroke, strokeWidth: sw, strokeLinecap: cap };

  switch (s.t) {
    case "polygon":
      return <polygon key={k} points={s.points} {...common} />;
    case "path":
      return <path key={k} d={s.d} {...common} />;
    case "circle":
      return <circle key={k} cx={s.cx} cy={s.cy} r={s.r} {...common} />;
    case "ellipse":
      return <ellipse key={k} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} {...common} />;
    case "rect":
      return (
        <rect
          key={k}
          x={s.x}
          y={s.y}
          width={s.w}
          height={s.h}
          rx={s.rx}
          transform={s.rot ? `rotate(${s.rot} ${s.x + s.w / 2} ${s.y + s.h / 2})` : undefined}
          {...common}
        />
      );
  }
}

/**
 * Pictogramme de danger normalisé.
 *
 * `label` remplace la référence de classe pour les lecteurs d'écran quand le
 * contexte la porte déjà. Sans `label`, la référence ADR fait office de nom
 * accessible — « ADR 6.1 — matière toxique » dit ce que le dessin dit.
 */
export function HazardIcon({
  kind,
  size = 22,
  label,
  className,
}: {
  kind: HazardKind;
  size?: number;
  label?: string;
  className?: string;
}) {
  const p = HAZARD_PICTOGRAMS[kind];
  const name = label ?? p.ref;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label={name}
      // Le losange blanc doit rester lisible sur fond sombre comme sur fond
      // clair : l'ombre porte le contraste sans toucher aux aplats normalisés.
      style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,.45))" }}
    >
      <title>{name}</title>
      {p.shapes.map((s, k) => (
        <Shape key={k} s={s} k={k} />
      ))}
    </svg>
  );
}
