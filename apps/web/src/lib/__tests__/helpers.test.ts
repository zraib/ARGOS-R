import { describe, expect, it } from "vitest";
import { llToSvg, occBarClass, sevBadge, stBadge, svgToLL } from "@/lib/helpers";
import { FR_DICT } from "@/lib/i18n/translations.fr";

describe("helpers", () => {
  it("svg ↔ [lng, lat] : aller-retour stable", () => {
    const { x, y } = llToSvg([-7.59, 33.57]);
    const [lng, lat] = svgToLL(x, y);
    expect(lng).toBeCloseTo(-7.59, 1);
    expect(lat).toBeCloseTo(33.57, 1);
  });
  it("les classes d'occupation changent aux seuils", () => {
    expect(occBarClass(50)).not.toBe(occBarClass(95));
  });
  it("chaque gravité et chaque statut a un libellé non vide", () => {
    for (const s of ["high", "medium", "low"] as const) expect(sevBadge(s, FR_DICT).label).not.toBe("");
    for (const s of ["open", "prog", "closed"] as const) expect(stBadge(s, FR_DICT).label).not.toBe("");
  });
});
