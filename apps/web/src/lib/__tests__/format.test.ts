import { describe, expect, it } from "vitest";
import { tpl } from "@/lib/i18n/format";

describe("tpl — gabarits de dictionnaire", () => {
  it("remplace chaque marqueur, autant de fois qu'il apparaît", () => {
    expect(tpl("{n} lits · {n} unités · {p}%", { n: 12, p: 40 })).toBe("12 lits · 12 unités · 40%");
  });
  it("laisse visible un marqueur sans valeur plutôt que de le masquer", () => {
    expect(tpl("Saturation à {t}", {})).toBe("Saturation à {t}");
  });
});
