import { describe, expect, it } from "vitest";
import { isPostKind, nearestIncident, postCaption } from "@/lib/posts";
import type { Incident, Unit } from "@/lib/types";
import type { Shelter } from "@/lib/data/modules";

const shelters = [{ id: "A1", nom: "École Taïbi", ville: "Amizmiz" } as Shelter];
const units = [{ id: "U2", nom: "3e Bataillon du Génie" } as Unit];
const inc = (id: string, ll: [number, number], archived = false) => ({ id, ll, archived } as unknown as Incident);

describe("postes d'opération", () => {
  it("ne reconnaît que les natures connues", () => {
    expect(isPostKind("opcom")).toBe(true);
    expect(isPostKind("bunker")).toBe(false);
    expect(isPostKind(3)).toBe(false);
  });
  it("le marqueur dit le libellé donné, sinon l'entité représentée, sinon rien", () => {
    expect(postCaption({ kind: "opcom", label: "PC avancé" }, { shelters, units })).toBe("PC avancé");
    expect(postCaption({ kind: "shelter", entityId: "A1" }, { shelters, units })).toBe("École Taïbi");
    expect(postCaption({ kind: "equipment", entityId: "U2" }, { shelters, units })).toBe("3e Bataillon du Génie");
    expect(postCaption({ kind: "tacom" }, { shelters, units })).toBeUndefined();
  });
  it("propose l'opération active la plus proche du point, jamais une archivée", () => {
    const list = [inc("A", [-7.6, 33.58]), inc("B", [-8.0, 31.63]), inc("C", [-7.61, 33.59], true)];
    expect(nearestIncident([-7.62, 33.6], list)?.id).toBe("A");
    expect(nearestIncident([-7.9, 31.5], list)?.id).toBe("B");
    expect(nearestIncident([-7.6, 33.58], [inc("C", [-7.6, 33.58], true)])).toBeUndefined();
  });
});
