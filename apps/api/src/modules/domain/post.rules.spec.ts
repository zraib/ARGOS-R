import { checkPost } from "@/modules/domain/post.rules";

describe("règles d'un poste posé sur la carte", () => {
  const exists = { shelter: (id: string) => id === "A1", unit: (id: string) => id === "U2" };

  it("un PC ou une cellule se pose sans entité — et n'en garde aucune", () => {
    expect(checkPost({ kind: "opcom", entityId: "A1" }, exists)).toEqual({ ok: true, entityId: undefined });
    expect(checkPost({ kind: "bluecell" }, exists)).toEqual({ ok: true, entityId: undefined });
  });

  it("un abri exige un abri existant", () => {
    expect(checkPost({ kind: "shelter" }, exists)).toMatchObject({ ok: false });
    expect(checkPost({ kind: "shelter", entityId: "A9" }, exists)).toMatchObject({ ok: false, reason: "Abri inconnu : A9" });
    expect(checkPost({ kind: "shelter", entityId: " A1 " }, exists)).toEqual({ ok: true, entityId: "A1" });
  });

  it("un parc exige l'unité qui le détient", () => {
    expect(checkPost({ kind: "equipment", entityId: "U9" }, exists)).toMatchObject({ ok: false, reason: "Unité inconnue : U9" });
    expect(checkPost({ kind: "equipment", entityId: "U2" }, exists)).toEqual({ ok: true, entityId: "U2" });
  });
});
