import type { SVGProps } from "react";

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "path"> {
  /** Un ou plusieurs tracés SVG `d` séparés par des espaces (sous-tracés). */
  path: string;
  size?: number;
  strokeWidth?: number;
}

/**
 * Rendu d'icône en trait (viewBox 24×24). Les tracés sont dans lib/icons.ts.
 * Un seul <path> contient tous les sous-tracés ; identique aux glyphes du
 * prototype (qui regroupent plusieurs traits dans un seul `d`).
 */
export function Icon({ path, size = 18, strokeWidth = 1.8, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      <path d={path} />
    </svg>
  );
}
