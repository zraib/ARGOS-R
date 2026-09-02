import { describe, expect, it } from "vitest";
import { CARDINALS_EN, CARDINALS_FR, LOW_WIND_KMH, cardinal } from "@/lib/map/wind";

describe("rose des vents", () => {
  it("l'ouest s'écrit O en français et W en anglais", () => {
    expect(cardinal(270, "fr")).toBe("O");
    expect(cardinal(270, "en")).toBe("W");
    expect(cardinal(270, "ar")).toBe("W");
  });
  it("339° est NNO, 0° et 360° sont N, 90° est E", () => {
    expect(cardinal(339, "fr")).toBe("NNO");
    expect(cardinal(0, "fr")).toBe("N");
    expect(cardinal(360, "fr")).toBe("N");
    expect(cardinal(90, "fr")).toBe("E");
  });
  it("seize branches dans chaque langue, seuil de vent faible à 10 km/h", () => {
    expect(CARDINALS_FR).toHaveLength(16);
    expect(CARDINALS_EN).toHaveLength(16);
    expect(LOW_WIND_KMH).toBe(10);
  });
});
