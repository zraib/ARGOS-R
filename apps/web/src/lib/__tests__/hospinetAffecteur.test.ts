import { describe, expect, it } from "vitest";
import { rankHospitals } from "@/lib/ai/llmHospinetAffecteur";
import type { Hospital } from "@/lib/types";

// Le classement Hospinet est ANTÉRIEUR à ce filet : on épingle ses propriétés
// visibles avant toute découpe de `assistant.ts` ou du store.
const hop = (id: string, ll: [number, number], lits: number, occ: number): Hospital => ({
  id, nom: id, ville: "—", lits, occ, rea: 10, reaOcc: 4, staff: 50, amb: 2, heli: 0, x: 0, y: 0, ll,
});
const CASA: [number, number] = [-7.59, 33.57];
const TANGER: [number, number] = [-5.8, 35.77];

describe("rankHospitals", () => {
  it("exclut durement un hôpital saturé (≥ 96 %)", () => {
    const r = rankHospitals({ ll: CASA, victims: 20, services: ["urgences"] }, [hop("sature", CASA, 100, 97), hop("ok", CASA, 100, 60)]);
    expect(r.rows.map((x) => x.score >= 0 && x)).toBeTruthy();
    expect(JSON.stringify(r.rows)).not.toContain('"sature"');
  });

  it("respecte le rayon", () => {
    const r = rankHospitals({ ll: CASA, victims: 20, services: ["urgences"], radiusKm: 50 }, [hop("loin", TANGER, 200, 40), hop("pres", CASA, 200, 40)]);
    expect(JSON.stringify(r.rows)).not.toContain('"loin"');
  });

  it("rend les lignes triées par score décroissant", () => {
    const r = rankHospitals({ ll: CASA, victims: 20, services: ["urgences"] }, [hop("a", CASA, 100, 90), hop("b", CASA, 100, 60), hop("c", TANGER, 100, 60)]);
    const scores = r.rows.map((x) => x.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});
