import { describe, expect, it } from "vitest";
import { parseSatUrl, quadrantOf } from "@/lib/map/satFallback";

// Imagerie souveraine : une tuile absente se découpe dans son parent (RIF).
describe("repli d'imagerie sur la tuile parente", () => {
  it("lit l'URL du protocole et rien d'autre", () => {
    expect(parseSatUrl("iris-sat://14/8017/6570")).toEqual({ z: 14, x: 8017, y: 6570 });
    expect(parseSatUrl("iris-sat://14/8017/6570.jpg")).toEqual({ z: 14, x: 8017, y: 6570 });
    expect(parseSatUrl("https://server.arcgisonline.com/x/14/8017/6570")).toBeNull();
  });
  it("le quart utile du parent : un niveau au-dessus, la moitié ; deux niveaux, le quart", () => {
    expect(quadrantOf(0, 0, 1)).toEqual({ sx: 0, sy: 0, size: 128 });
    expect(quadrantOf(1, 0, 1)).toEqual({ sx: 128, sy: 0, size: 128 });
    expect(quadrantOf(1, 1, 1)).toEqual({ sx: 128, sy: 128, size: 128 });
    // 8017 = 4·2004 + 1, 6570 = 4·1642 + 2 : colonne 1, ligne 2 d'un parent découpé en 4 × 4.
    expect(quadrantOf(8017, 6570, 2)).toEqual({ sx: 64, sy: 128, size: 64 });
  });
});
