// ============================================================================
// ARGOS — gate de sécurité ABAC : cantonnement au périmètre affecté
//
// Le RBAC seul dit « ce rôle peut modifier un hôpital ». Ces tests prouvent que
// l'API dit en plus « mais seulement CELUI qui lui est affecté » — sans quoi
// « Responsable Hôpital » vaudrait droit de modification sur tout le réseau.
//
// Trois propriétés vérifiées :
//   1. un responsable agit sur SON entité ;
//   2. il est refusé (403) sur toute autre ;
//   3. un responsable SANS affectation est refusé (default-deny) — un compte
//      mal configuré ne vaut jamais passe-partout.
// ============================================================================

import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";
import { UsersService } from "@/modules/iam/users.service";

describe("ABAC — cantonnement des responsables à leur entité", () => {
  let app: INestApplication;
  let users: UsersService;
  const base = () => request(app.getHttpServer());

  const tokenFor = async (username: string, role: string): Promise<string> => {
    const res = await base().post("/api/auth/dev-token").send({ username, role }).expect(201);
    return res.body.access_token as string;
  };

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    users = app.get(UsersService);

    // Un responsable rattaché à l'hôpital H4 (HM Avicenne, Marrakech).
    users.create("superadmin", "test", {
      matricule: "resp.h4",
      nom: "Alami",
      prenom: "Karim",
      roles: ["resp_hospital"],
      assignments: { hospital: "H4" },
    });
    // Un responsable du même type, SANS affectation (compte mal configuré).
    // On force l'état en contournant la validation de création, qui l'interdit.
    const orphan = users.create("superadmin", "test", {
      matricule: "resp.orphelin",
      nom: "Sans",
      prenom: "Affectation",
      roles: ["resp_hospital"],
      assignments: { hospital: "H1" },
    });
    const registry = (users as unknown as { users: { id: string; assignments?: unknown }[] }).users;
    const orphanRecord = registry.find((u) => u.id === orphan.user.id);
    if (orphanRecord) orphanRecord.assignments = undefined;
  });

  afterAll(async () => {
    await app.close();
  });

  it("la portée affectée est exposée dans /iam/me", async () => {
    const tok = await tokenFor("resp.h4", "resp_hospital");
    const res = await base().get("/api/iam/me").set("Authorization", `Bearer ${tok}`).expect(200);
    expect(res.body.scope).toEqual({ hospital: "H4" });
  });

  it("un responsable met à jour SON établissement (200)", async () => {
    const tok = await tokenFor("resp.h4", "resp_hospital");
    const res = await base()
      .patch("/api/hospitals/H4")
      .set("Authorization", `Bearer ${tok}`)
      .send({ occ: 401, staff: 570 })
      .expect(200);
    expect(res.body.id).toBe("H4");
    expect(res.body.occ).toBe(401);
    expect(res.body.staff).toBe(570);
  });

  it("HORS PÉRIMÈTRE : le même responsable est refusé sur un autre établissement (403)", async () => {
    const tok = await tokenFor("resp.h4", "resp_hospital");
    await base()
      .patch("/api/hospitals/H1")
      .set("Authorization", `Bearer ${tok}`)
      .send({ occ: 1 })
      .expect(403);
  });

  it("l'établissement hors périmètre n'a PAS été modifié", async () => {
    const tok = await tokenFor("admin", "admin");
    const res = await base().get("/api/hospitals").set("Authorization", `Bearer ${tok}`).expect(200);
    const h1 = (res.body as { id: string; occ: number }[]).find((h) => h.id === "H1");
    expect(h1?.occ).not.toBe(1);
  });

  it("DEFAULT-DENY : un responsable sans affectation est refusé (403)", async () => {
    const tok = await tokenFor("resp.orphelin", "resp_hospital");
    await base()
      .patch("/api/hospitals/H4")
      .set("Authorization", `Bearer ${tok}`)
      .send({ occ: 2 })
      .expect(403);
  });

  it("le cantonnement s'applique aussi aux unités et aux abris", async () => {
    // Un responsable d'unité affecté à U2 (seed) — cf. users.service.
    const unitTok = await tokenFor("s.bennani", "resp_unit");
    await base().patch("/api/units/U2").set("Authorization", `Bearer ${unitTok}`).send({ readiness: 81 }).expect(200);
    await base().patch("/api/units/U1").set("Authorization", `Bearer ${unitTok}`).send({ readiness: 10 }).expect(403);

    // Un responsable d'abri affecté à AB-02.
    users.create("superadmin", "test", {
      matricule: "resp.ab02",
      nom: "Ouazzani",
      roles: ["resp_shelter"],
      assignments: { shelter: "AB-02" },
    });
    const shTok = await tokenFor("resp.ab02", "resp_shelter");
    const ok = await base()
      .patch("/api/shelters/AB-02")
      .set("Authorization", `Bearer ${shTok}`)
      .send({ occupants: 430, supplies: "low", needs: "Vivres, couvertures" })
      .expect(200);
    expect(ok.body.occupants).toBe(430);
    await base().patch("/api/shelters/AB-01").set("Authorization", `Bearer ${shTok}`).send({ occupants: 1 }).expect(403);
  });

  it("le responsable de morgue tient SON registre, et pas celui d'un autre site", async () => {
    users.create("superadmin", "test", {
      matricule: "resp.m3",
      nom: "Sabri",
      roles: ["resp_morgue"],
      assignments: { morgue: "M3" },
    });
    const tok = await tokenFor("resp.m3", "resp_morgue");

    const admitted = await base()
      .post("/api/morgues/M3/records")
      .set("Authorization", `Bearer ${tok}`)
      .send({ reference: "AH-2026-777", incidentId: "INC-2607", foundAt: "Douar Imi N'Tala", sex: "f" })
      .expect(201);
    expect(admitted.body.status).toBe("unidentified");
    const rid = admitted.body.id as string;

    // Identification sans identité confirmée → 409 (invariant DVI).
    await base()
      .patch(`/api/morgues/M3/records/${rid}`)
      .set("Authorization", `Bearer ${tok}`)
      .send({ status: "identified" })
      .expect(409);

    // Parcours complet : prélèvements → identifié → restitué.
    await base().patch(`/api/morgues/M3/records/${rid}`).set("Authorization", `Bearer ${tok}`).send({ status: "in_progress", samples: ["dna"] }).expect(200);
    await base().patch(`/api/morgues/M3/records/${rid}`).set("Authorization", `Bearer ${tok}`).send({ status: "identified", identifiedAs: "Mme K. Ait Bella" }).expect(200);
    const released = await base()
      .patch(`/api/morgues/M3/records/${rid}`)
      .set("Authorization", `Bearer ${tok}`)
      .send({ status: "released", releasedTo: "Famille Ait Bella (frère)" })
      .expect(200);
    expect(released.body.status).toBe("released");

    // Dossier clos : plus aucune modification (409).
    await base().patch(`/api/morgues/M3/records/${rid}`).set("Authorization", `Bearer ${tok}`).send({ ageRange: "30-40" }).expect(409);

    // HORS PÉRIMÈTRE : le site M2 lui est interdit.
    await base()
      .post("/api/morgues/M2/records")
      .set("Authorization", `Bearer ${tok}`)
      .send({ reference: "MK-2026-999" })
      .expect(403);
    await base().patch("/api/morgues/M2").set("Authorization", `Bearer ${tok}`).send({ staff: 1 }).expect(403);
  });

  it("le responsable d'équipement gère LE PARC de son unité", async () => {
    users.create("superadmin", "test", {
      matricule: "resp.parc",
      nom: "Kabbaj",
      roles: ["resp_equipment"],
      assignments: { equipment: "U2" },
    });
    const tok = await tokenFor("resp.parc", "resp_equipment");

    const created = await base()
      .post("/api/equipment-parks/U2/items")
      .set("Authorization", `Bearer ${tok}`)
      .send({ desig: "Compresseur pneumatique", cat: "Génie", stock: 4, threshold: 2, cond: "ok" })
      .expect(201);
    // Le libellé d'unité est posé par le serveur, jamais par le client.
    expect(created.body.unitId).toBe("U2");
    expect(created.body.unit).toBe("3e Bataillon du Génie");

    const eid = created.body.id as string;
    await base().patch(`/api/equipment-parks/U2/items/${eid}`).set("Authorization", `Bearer ${tok}`).send({ stock: 2, cond: "repair" }).expect(200);
    await base().delete(`/api/equipment-parks/U2/items/${eid}`).set("Authorization", `Bearer ${tok}`).expect(200);

    // HORS PÉRIMÈTRE : le parc d'une autre unité lui est interdit.
    await base()
      .post("/api/equipment-parks/U1/items")
      .set("Authorization", `Bearer ${tok}`)
      .send({ desig: "Intrusion", cat: "X", stock: 1, threshold: 1, cond: "ok" })
      .expect(403);
    // EQ-1012 appartient au parc de U1 : inatteignable même via SON parc.
    await base().patch("/api/equipment-parks/U1/items/EQ-1012").set("Authorization", `Bearer ${tok}`).send({ stock: 0 }).expect(403);
    await base().patch("/api/equipment-parks/U2/items/EQ-1012").set("Authorization", `Bearer ${tok}`).send({ stock: 0 }).expect(404);
  });

  it("un rôle NON rattaché n'est pas cantonné : le superadmin passe partout", async () => {
    const tok = await tokenFor("m.zraib", "superadmin");
    await base().patch("/api/hospitals/H1").set("Authorization", `Bearer ${tok}`).send({ staff: 830 }).expect(200);
    await base().patch("/api/hospitals/H7").set("Authorization", `Bearer ${tok}`).send({ staff: 150 }).expect(200);
  });

  it("le RBAC reste appliqué en amont : un rôle sans la permission est refusé (403)", async () => {
    const tok = await tokenFor("morgue", "resp_morgue");
    await base().patch("/api/hospitals/H4").set("Authorization", `Bearer ${tok}`).send({ occ: 3 }).expect(403);
  });

  it("un responsable gère les services de SON établissement (CRUD complet)", async () => {
    const tok = await tokenFor("resp.h4", "resp_hospital");

    const created = await base()
      .post("/api/hospitals/H4/wards")
      .set("Authorization", `Bearer ${tok}`)
      .send({ nom: "Unité de grands brûlés", lits: 18, occ: 4, statut: "open", chef: "Cne. S. Idrissi" })
      .expect(201);
    expect(created.body.hid).toBe("H4");

    const wid = created.body.id as string;
    const patched = await base()
      .patch(`/api/hospitals/H4/wards/${wid}`)
      .set("Authorization", `Bearer ${tok}`)
      .send({ occ: 17, statut: "saturated" })
      .expect(200);
    expect(patched.body.statut).toBe("saturated");

    await base().delete(`/api/hospitals/H4/wards/${wid}`).set("Authorization", `Bearer ${tok}`).expect(200);
    const after = await base().get("/api/hospitals/H4/wards").set("Authorization", `Bearer ${tok}`).expect(200);
    expect((after.body as { id: string }[]).some((w) => w.id === wid)).toBe(false);
  });

  it("HORS PÉRIMÈTRE : il ne peut pas ouvrir de service ailleurs (403)", async () => {
    const tok = await tokenFor("resp.h4", "resp_hospital");
    await base()
      .post("/api/hospitals/H1/wards")
      .set("Authorization", `Bearer ${tok}`)
      .send({ nom: "Intrusion", lits: 10, occ: 0, statut: "open" })
      .expect(403);
  });

  it("un service d'un AUTRE établissement n'est pas modifiable même en connaissant son id", async () => {
    const tok = await tokenFor("resp.h4", "resp_hospital");
    // W-101 appartient à H1 : la route est cantonnée à H4 → 403 avant toute lecture.
    await base()
      .patch("/api/hospitals/H1/wards/W-101")
      .set("Authorization", `Bearer ${tok}`)
      .send({ occ: 0 })
      .expect(403);
    // Et le passer par SON établissement ne le rattrape pas : 404, car le
    // service n'appartient pas à H4.
    await base()
      .patch("/api/hospitals/H4/wards/W-101")
      .set("Authorization", `Bearer ${tok}`)
      .send({ occ: 0 })
      .expect(404);
  });

  it("la réaffectation prend effet SANS reconnexion (portée relue à chaque requête)", async () => {
    const tok = await tokenFor("resp.h4", "resp_hospital");
    const target = users.list().find((u) => u.matricule === "resp.h4");
    expect(target).toBeDefined();

    // Avec le MÊME jeton, on bascule le responsable de H4 vers H5.
    users.update("superadmin", target!.id, { assignments: { hospital: "H5" } });

    await base().patch("/api/hospitals/H4").set("Authorization", `Bearer ${tok}`).send({ occ: 9 }).expect(403);
    await base().patch("/api/hospitals/H5").set("Authorization", `Bearer ${tok}`).send({ occ: 9 }).expect(200);
  });
});

describe("Rattachement — validation à la création et à la modification", () => {
  let app: INestApplication;
  let users: UsersService;

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    users = app.get(UsersService);
  });

  afterAll(async () => {
    await app.close();
  });

  it("refuse un rôle « responsable » sans entité affectée", () => {
    expect(() =>
      users.create("superadmin", "test", { matricule: "v.sans", nom: "Sans", roles: ["resp_shelter"] }),
    ).toThrow(/exige d'affecter une entité/);
  });

  it("refuse une affectation qu'aucun rôle du compte ne couvre", () => {
    expect(() =>
      users.create("superadmin", "test", {
        matricule: "v.orphelin",
        nom: "Orphelin",
        roles: ["bluecell"],
        assignments: { hospital: "H1" },
      }),
    ).toThrow(/aucun rôle du compte n'en est responsable/);
  });

  it("accepte un compte cumulant deux responsabilités", () => {
    const { user } = users.create("superadmin", "test", {
      matricule: "v.double",
      nom: "Double",
      roles: ["resp_unit", "resp_morgue"],
      assignments: { unit: "U1", morgue: "M1" },
    });
    expect(user.assignments).toEqual({ unit: "U1", morgue: "M1" });
  });

  it("purge la portée quand le rôle « responsable » est retiré", () => {
    const { user } = users.create("superadmin", "test", {
      matricule: "v.mute",
      nom: "Mute",
      roles: ["resp_unit"],
      assignments: { unit: "U1" },
    });
    const after = users.update("superadmin", user.id, { roles: ["bluecell"] });
    expect(after.assignments).toBeUndefined();
  });

  it("exige une entité quand un rôle « responsable » est AJOUTÉ à un compte existant", () => {
    const { user } = users.create("superadmin", "test", {
      matricule: "v.promu",
      nom: "Promu",
      roles: ["bluecell"],
    });
    expect(() => users.update("superadmin", user.id, { roles: ["resp_hospital"] })).toThrow(
      /exige d'affecter une entité/,
    );
  });
});
