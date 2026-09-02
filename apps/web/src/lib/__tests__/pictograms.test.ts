import { describe, expect, it } from "vitest";
import { HAZARD_KINDS, HAZARD_PICTOGRAMS, hazardSvgString, type HazardShape } from "@/lib/hazard/pictograms";

// ============================================================================
// Pictogrammes réglementaires (lot N-1) — la CONTRAINTE GÉOMÉTRIQUE.
//
// Le losange ADR occupe une grille de 64 : à la hauteur y, sa demi-largeur
// intérieure vaut 24,5 − |y − 32|. Un symbole qui déborde a été constaté DEUX
// fois pendant le lot N-1, en regardant le rendu et non le code. Ce test rend la
// contrainte mécanique pour les primitives dont l'emprise se calcule (polygone,
// cercle, ellipse, rectangle non tourné). Les tracés `path` ne sont pas bornés
// ici : leur emprise demanderait un interpréteur SVG, et le dire vaut mieux que
// de faire semblant.
// ============================================================================

const demiLargeur = (y: number) => 24.5 - Math.abs(y - 32);
const dedans = (x: number, y: number) => Math.abs(x - 32) <= demiLargeur(y) + 0.6; // tolérance d'un demi-trait

function points(s: HazardShape): [number, number][] {
  switch (s.t) {
    case "polygon":
      return s.points.trim().split(/\s+/).map((p) => p.split(",").map(Number) as [number, number]);
    case "circle":
      return [[s.cx - s.r, s.cy], [s.cx + s.r, s.cy], [s.cx, s.cy - s.r], [s.cx, s.cy + s.r]];
    case "ellipse":
      return [[s.cx - s.rx, s.cy], [s.cx + s.rx, s.cy], [s.cx, s.cy - s.ry], [s.cx, s.cy + s.ry]];
    case "rect":
      return s.rot ? [] : [[s.x, s.y], [s.x + s.w, s.y], [s.x, s.y + s.h], [s.x + s.w, s.y + s.h]];
    case "path":
      return [];
  }
}

describe("pictogrammes de danger", () => {
  it("chaque famille a un pictogramme, un libellé et des formes", () => {
    for (const k of HAZARD_KINDS) {
      expect(HAZARD_PICTOGRAMS[k].ref.length).toBeGreaterThan(3);
      expect(HAZARD_PICTOGRAMS[k].shapes.length).toBeGreaterThan(0);
    }
  });

  // Le CADRE (losange extérieur, losange intérieur, demi-losanges de fond) a
  // ses sommets SUR le bord de la grille : |x−32|+|y−32| = 30. La contrainte ne
  // vaut que pour le SYMBOLE qu'il encadre.
  // Un cadre est un losange CONCENTRIQUE : ≤ 4 sommets dont |x−32|+|y−32| est
  // la même constante (30 pour le bord, ~27 pour le liseré intérieur, et les
  // demi-losanges de fond du pictogramme radioactif).
  const estCadre = (s: HazardShape) => {
    const pts = points(s);
    if (s.t !== "polygon" || pts.length === 0 || pts.length > 4) return false;
    const d = pts.map(([x, y]) => Math.abs(x - 32) + Math.abs(y - 32));
    return d[0] >= 20 && d.every((v) => Math.abs(v - d[0]) <= 0.6);
  };

  // Le fût (« drum ») n'est PAS un losange ADR : c'est le symbole de stockage,
  // dessiné dans un rectangle. Les deux règles du losange ne le concernent pas.
  const LOSANGES = HAZARD_KINDS.filter((k) => k !== "drum");

  it("aucune primitive du SYMBOLE ne déborde du losange", () => {
    const debordements: string[] = [];
    for (const k of LOSANGES) {
      for (const s of HAZARD_PICTOGRAMS[k].shapes) {
        if (estCadre(s)) continue;
        for (const [x, y] of points(s)) if (!dedans(x, y)) debordements.push(`${k}/${s.t} (${x},${y})`);
      }
    }
    expect(debordements).toEqual([]);
  });

  it("chaque pictogramme commence par son cadre", () => {
    for (const k of LOSANGES) expect(estCadre(HAZARD_PICTOGRAMS[k].shapes[0]), k).toBe(true);
  });

  it("le rendu en chaîne est un SVG autonome, à la taille demandée", () => {
    const svg = hazardSvgString("toxic", 40);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('width="40"');
    expect(svg).toContain("</svg>");
  });
});
