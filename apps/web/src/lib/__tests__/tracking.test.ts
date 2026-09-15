import { describe, expect, it } from "vitest";
import { STALE_MS, contactAge, isStale, type Tracker } from "@/lib/tracking/tracker";

const base: Tracker = { id: "trk-1", imei: "356307042441013", source: "device", label: "Amb 04", target: null, incidentId: null, archived: false, createdBy: "x", createdAt: "", last: null, lastSeenAt: null, trail: [] };

describe("traceurs — muet ou vivant", () => {
  it("jamais vu → muet ; archivé → jamais muet", () => {
    expect(isStale(base)).toBe(true);
    expect(isStale({ ...base, archived: true })).toBe(false);
  });
  it("le seuil est 15 minutes, pas une minute de plus", () => {
    const recent = new Date(Date.now() - STALE_MS + 60_000).toISOString();
    const vieux = new Date(Date.now() - STALE_MS - 60_000).toISOString();
    expect(isStale({ ...base, lastSeenAt: recent })).toBe(false);
    expect(isStale({ ...base, lastSeenAt: vieux })).toBe(true);
  });
  it("l'ancienneté se lit en s / min / h / j", () => {
    const il_y_a = (ms: number) => ({ ...base, lastSeenAt: new Date(Date.now() - ms).toISOString() });
    expect(contactAge(il_y_a(30_000))).toMatch(/^\d+ s$/);
    expect(contactAge(il_y_a(5 * 60_000))).toBe("5 min");
    expect(contactAge(il_y_a(3 * 3_600_000))).toBe("3 h");
    expect(contactAge(il_y_a(2 * 86_400_000))).toBe("2 j");
    expect(contactAge(base)).toBe("—");
  });
});
