import { describe, expect, it } from "vitest";
import { mergeNotice, noticeTime, unseenNotices } from "@/lib/notices";
import type { Notice } from "@/lib/types";

const n = (id: string): Notice => ({ id, at: "2026-09-10T08:05:00Z", kind: "incident_declared", incidentId: "INC-1", titre: "Crue", region: "Casablanca-Settat", ll: [-7.6, 33.58], sev: "medium", type: "flood" });

describe("alertes adressées", () => {
  it("ne compte que celles qui n'ont pas été ouvertes", () => {
    expect(unseenNotices([n("a"), n("b"), n("c")], ["b"]).map((x) => x.id)).toEqual(["a", "c"]);
  });
  it("une alerte reçue se place en tête, jamais deux fois", () => {
    const base = [n("a")];
    expect(mergeNotice(base, n("b")).map((x) => x.id)).toEqual(["b", "a"]);
    expect(mergeNotice(base, n("a")).map((x) => x.id)).toEqual(["a"]);
  });
  it("l'heure se lit en local, et un horodatage illisible ne casse rien", () => {
    expect(noticeTime("2026-09-10T08:05:00")).toBe("08:05");
    expect(noticeTime("n'importe quoi")).toBe("—");
  });
});
