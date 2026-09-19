import { describe, expect, it } from "vitest";
import { isPostKind, nearestIncident, parsePostPick, pickGroups, postCaption } from "@/lib/posts";
import type { DeployableAccount, Incident, IncidentPost, Responsible, Unit } from "@/lib/types";
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
    // Un PC ou une cellule : le nom du compte qui le tient, sinon son matricule.
    const responsables = [{ kind: "incident", entityId: "INC-1", role: "tacom", matricule: "s.bennani", nom: "Cdt. S. Bennani" } as Responsible];
    expect(postCaption({ kind: "tacom", matricule: "S.Bennani" }, { shelters, units, responsables })).toBe("Cdt. S. Bennani");
    expect(postCaption({ kind: "tacom", matricule: "x.inconnu" }, { shelters, units, responsables })).toBe("x.inconnu");
  });

  it("un choix transporté par le glisser-déposer se relit, et rien d'autre", () => {
    expect(parsePostPick(JSON.stringify({ kind: "opcom", title: "Col. Chraibi", matricule: "o.chraibi" }))).toEqual({ kind: "opcom", title: "Col. Chraibi", matricule: "o.chraibi", entityId: undefined });
    expect(parsePostPick(JSON.stringify({ kind: "shelter", title: "École", entityId: "A1" }))?.entityId).toBe("A1");
    expect(parsePostPick(JSON.stringify({ kind: "opcom", title: "sans compte" }))).toBeNull();
    expect(parsePostPick("pas du JSON")).toBeNull();
  });

  it("les instances se listent par nature : disponibles d'abord, déployées ailleurs ensuite, déjà posées en dernier", () => {
    const accounts: DeployableAccount[] = [
      { matricule: "s.bennani", nom: "Cdt. S. Bennani", grade: "Commandant", roles: ["tacom", "bluecell"], currentIncidentId: "INC-2" },
      { matricule: "y.tazi", nom: "Cne. Y. Tazi", grade: "Capitaine", roles: ["bluecell"], currentIncidentId: null },
      { matricule: "o.chraibi", nom: "Colonel Chraibi", roles: ["opcom"], currentIncidentId: null },
    ];
    const posts = [{ id: "P1", incidentId: "INC-1", kind: "opcom", ll: [0, 0], matricule: "o.chraibi" } as IncidentPost, { id: "P2", incidentId: "INC-1", kind: "shelter", ll: [0, 0], entityId: "A1" } as IncidentPost];
    const groups = pickGroups({ accounts, shelters, units, posts }, "Parc");
    const g = (k: string) => groups.find((x) => x.kind === k)!;
    expect(g("opcom").items.map((i) => [i.pick.matricule, i.placedOn])).toEqual([["o.chraibi", "INC-1"]]);
    // Un compte à deux rôles apparaît sous les deux ; le disponible passe devant le déployé.
    expect(g("bluecell").items.map((i) => i.pick.matricule)).toEqual(["y.tazi", "s.bennani"]);
    expect(g("tacom").items[0]).toMatchObject({ pick: { kind: "tacom", matricule: "s.bennani" }, deployedOn: "INC-2" });
    expect(g("shelter").items[0]).toMatchObject({ pick: { entityId: "A1" }, placedOn: "INC-1" });
    expect(g("equipment").items[0].pick).toEqual({ kind: "equipment", title: "Parc — 3e Bataillon du Génie", entityId: "U2" });
  });
  it("propose l'opération active la plus proche du point, jamais une archivée", () => {
    const list = [inc("A", [-7.6, 33.58]), inc("B", [-8.0, 31.63]), inc("C", [-7.61, 33.59], true)];
    expect(nearestIncident([-7.62, 33.6], list)?.id).toBe("A");
    expect(nearestIncident([-7.9, 31.5], list)?.id).toBe("B");
    expect(nearestIncident([-7.6, 33.58], [inc("C", [-7.6, 33.58], true)])).toBeUndefined();
  });
});

describe("qui tient chaque nature de poste", () => {
  it("les PC du profil direx sont tenus par leur chef ; un PCT ou un PCO par le chef de l'un ou l'autre profil", async () => {
    const { holdsPost, postHolderRole } = await import("@/lib/posts");
    expect(holdsPost(["pcfar_chef"], "pcfar")).toBe(true);
    expect(holdsPost(["pcfar_ops"], "pcfar")).toBe(false);
    expect(holdsPost(["pco_chef"], "pco")).toBe(true);
    expect(holdsPost(["pco"], "pco")).toBe(true);
    expect(holdsPost(["opcom"], "opcom")).toBe(true);
    expect(holdsPost(["opcom"], "shelter")).toBe(false);
    expect(postHolderRole("pcf")).toBe("pcf_chef");
    expect(postHolderRole("tacom")).toBe("tacom");
    expect(postHolderRole("equipment")).toBeUndefined();
    // La boîte à outils groupe les comptes par nature tenue : un chef de PC FAR apparaît sous « PC FAR ».
    const accounts = [{ matricule: "c.pcfar", nom: "Colonel El Amrani", roles: ["pcfar_chef"], currentIncidentId: null }];
    const g = pickGroups({ accounts, shelters, units, posts: [] }, "Parc").find((x) => x.kind === "pcfar");
    expect(g?.items.map((i) => i.pick.matricule)).toEqual(["c.pcfar"]);
  });
});
