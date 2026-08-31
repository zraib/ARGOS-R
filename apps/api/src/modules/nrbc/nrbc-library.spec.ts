import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";
import { SUBSTANCES } from "@/modules/nrbc/infrastructure/substances.data";

// ============================================================================
// N-3 — la bibliothèque de substances
//
// Ce que ces tests protègent n'est pas le contenu des fiches — il changera au
// fur et à mesure des vérifications — mais deux propriétés dont dépend la
// sûreté de l'outil :
//
//   1. la RECHERCHE trouve par numéro, parce que c'est ce qui est lu sur une
//      citerne ; un intervenant n'a pas le nom français sous les yeux ;
//   2. une substance SANS distances ERG ne fait pas dessiner un périmètre
//      inventé — le gabarit est simplement absent.
// ============================================================================

describe("N-3 — bibliothèque de substances dangereuses", () => {
  let app: INestApplication;
  const base = () => request(app.getHttpServer());
  let tok: string;
  const auth = () => ({ Authorization: `Bearer ${tok}` });

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    const res = await base().post("/api/auth/dev-token").send({ username: "m.zraib", role: "superadmin" }).expect(201);
    tok = res.body.access_token as string;
  });

  afterAll(async () => app.close());

  // --- cohérence du catalogue ----------------------------------------------

  it("les identifiants, numéros ONU et numéros CAS sont uniques", () => {
    // Un doublon d'identifiant ONU ferait remonter la mauvaise fiche à la
    // recherche par étiquette — l'usage le plus probable sur intervention.
    const ids = SUBSTANCES.map((s) => s.id);
    const uns = SUBSTANCES.map((s) => s.un);
    const cas = SUBSTANCES.map((s) => s.cas).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(uns).size).toBe(uns.length);
    expect(new Set(cas).size).toBe(cas.length);
  });

  it("toute substance porte une fiche opérationnelle complète", () => {
    for (const s of SUBSTANCES) {
      expect(s.sheet).toBeDefined();
      for (const k of ["appearance", "behaviour", "health", "fire", "reactivity", "ppe"] as const) {
        expect(s.sheet?.[k]?.length ?? 0).toBeGreaterThan(10);
      }
    }
  });

  it("les distances vont par PAIRE — jamais un seul déversement renseigné", () => {
    // `small` sans `large` (ou l'inverse) produirait un gabarit disponible pour
    // un scénario et absent pour l'autre, sans que rien ne l'explique.
    for (const s of SUBSTANCES) {
      expect(!!s.small).toBe(!!s.large);
    }
  });

  it("aucune substance n'est marquée ergVerified sans porter de distances", () => {
    for (const s of SUBSTANCES) {
      if (s.ergVerified) expect(s.small && s.large).toBeTruthy();
    }
  });

  // --- la recherche ---------------------------------------------------------

  it("trouve par NUMÉRO ONU — ce qui est lu sur l'étiquette orange", async () => {
    for (const q of ["1017", "UN1017", "UN 1017"]) {
      const res = await base().get(`/api/nrbc/library?q=${encodeURIComponent(q)}`).set(auth()).expect(200);
      expect(res.body.substances.map((s: { id: string }) => s.id)).toContain("chlorine");
    }
  });

  it("trouve par numéro CAS et par SYNONYME", async () => {
    const byCas = await base().get("/api/nrbc/library?q=7783-06-4").set(auth()).expect(200);
    expect(byCas.body.substances[0].id).toBe("hydrogen-sulfide");

    const bySynonym = await base()
      .get(`/api/nrbc/library?q=${encodeURIComponent("gaz des égouts")}`)
      .set(auth())
      .expect(200);
    expect(bySynonym.body.substances[0].id).toBe("hydrogen-sulfide");
  });

  it("la provenance décrit TOUTE la bibliothèque, pas la page filtrée", async () => {
    // Sinon une recherche ne ramenant que des fiches vérifiées laisserait croire
    // que la bibliothèque entière l'est.
    const all = await base().get("/api/nrbc/library").set(auth()).expect(200);
    const one = await base().get("/api/nrbc/library?q=chlore").set(auth()).expect(200);
    expect(one.body.substances.length).toBeLessThan(all.body.substances.length);
    expect(one.body.provenance).toEqual(all.body.provenance);
    expect(all.body.provenance.total).toBe(SUBSTANCES.length);
  });

  it("une substance inconnue répond 404, pas une fiche vide", async () => {
    await base().get("/api/nrbc/substances/inexistant").set(auth()).expect(404);
  });

  it("DEFAULT-DENY : un rôle sans `nrbc:view` est refusé", async () => {
    const t = (
      await base().post("/api/auth/dev-token").send({ username: "n.fassi", role: "resp_unit" }).expect(201)
    ).body.access_token as string;
    await base().get("/api/nrbc/library").set({ Authorization: `Bearer ${t}` }).expect(403);
  });

  // --- la garde du panache --------------------------------------------------

  it("une substance SANS distances ne fait dessiner AUCUNE zone ERG", async () => {
    // C'est la propriété qui compte : plutôt qu'un périmètre plausible mais
    // inventé, rien — et le client sait pourquoi grâce à `hasErgDistances`.
    const sansDistances = SUBSTANCES.find((s) => !s.small);
    expect(sansDistances).toBeDefined();

    const inc = await base()
      .post("/api/incidents")
      .set(auth())
      .send({
        titre: "Essai — substance sans distances ERG",
        type: "nrbc",
        region: "Souss-Massa",
        sev: "low",
        st: "open",
        x: 40,
        y: 40,
        ll: [-9.6, 30.42],
        nrbc: { family: "C", substanceId: sansDistances!.id, spill: "large", release: "continuous" },
      })
      .expect(201);

    const res = await base()
      .get(`/api/nrbc/plume/${inc.body.id}?models=erg`)
      .set(auth())
      .expect(200);

    expect(res.body.substance.hasErgDistances).toBe(false);
    // La réponse HTTP expose une FeatureCollection (`fc`), pas le tableau
    // interne de zones : c'est elle que la carte consomme.
    expect(res.body.fc.features).toHaveLength(0);
  });

  it("une substance AVEC distances fait bien dessiner ses zones ERG", async () => {
    const inc = await base()
      .post("/api/incidents")
      .set(auth())
      .send({
        titre: "Essai — substance avec distances ERG",
        type: "nrbc",
        region: "Souss-Massa",
        sev: "low",
        st: "open",
        x: 40,
        y: 40,
        ll: [-9.6, 30.42],
        nrbc: { family: "C", substanceId: "chlorine", spill: "large", release: "continuous" },
      })
      .expect(201);

    const res = await base().get(`/api/nrbc/plume/${inc.body.id}?models=erg`).set(auth()).expect(200);
    expect(res.body.substance.hasErgDistances).toBe(true);
    expect(res.body.fc.features.length).toBeGreaterThan(0);
  });
});
