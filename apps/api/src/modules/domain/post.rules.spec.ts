import { checkPost, type PostLookup } from "@/modules/domain/post.rules";

describe("règles d'un poste posé sur la carte", () => {
  const lookup: PostLookup = {
    shelter: (id) => id === "A1",
    unit: (id) => id === "U2",
    account: (m, role) => (m === "o.chraibi" && role === "opcom") || (m === "s.bennani" && (role === "tacom" || role === "bluecell")),
    placedAccount: (m) => (m === "s.bennani" ? "INC-1" : undefined),
    placedEntity: (kind, id) => (kind === "shelter" && id === "A1" ? "INC-1" : undefined),
  };

  it("un PC ou une cellule désigne LE compte qui le tient, et ce compte doit tenir le rôle", () => {
    expect(checkPost({ kind: "opcom" }, lookup)).toMatchObject({ ok: false });
    expect(checkPost({ kind: "opcom", matricule: "s.bennani" }, lookup)).toMatchObject({ ok: false, reason: "s.bennani n'est pas un compte OPCOM." });
    expect(checkPost({ kind: "opcom", matricule: " o.chraibi " }, lookup)).toEqual({ ok: true, matricule: "o.chraibi" });
    // Un compte à deux rôles déployables se pose sous l'un OU l'autre.
    expect(checkPost({ kind: "bluecell", matricule: "y.tazi" }, { ...lookup, placedAccount: () => undefined, account: (m, r) => m === "y.tazi" && r === "bluecell" })).toEqual({ ok: true, matricule: "y.tazi" });
  });

  it("une instance déjà posée ne se pose pas deux fois — c'est un conflit, pas une erreur de saisie", () => {
    expect(checkPost({ kind: "tacom", matricule: "s.bennani" }, lookup)).toMatchObject({ ok: false, conflict: true, reason: "s.bennani est déjà posé sur INC-1 : retirez ce poste d'abord." });
    expect(checkPost({ kind: "shelter", entityId: "A1" }, lookup)).toMatchObject({ ok: false, conflict: true });
  });

  it("un abri exige un abri existant, un parc l'unité qui le détient", () => {
    expect(checkPost({ kind: "shelter" }, lookup)).toMatchObject({ ok: false });
    expect(checkPost({ kind: "shelter", entityId: "A9" }, lookup)).toMatchObject({ ok: false, reason: "Abri inconnu : A9" });
    expect(checkPost({ kind: "shelter", entityId: "A1" }, { ...lookup, placedEntity: () => undefined })).toEqual({ ok: true, entityId: "A1" });
    expect(checkPost({ kind: "equipment", entityId: "U9" }, lookup)).toMatchObject({ ok: false, reason: "Unité inconnue : U9" });
    expect(checkPost({ kind: "equipment", entityId: "U2" }, lookup)).toEqual({ ok: true, entityId: "U2" });
  });
});
