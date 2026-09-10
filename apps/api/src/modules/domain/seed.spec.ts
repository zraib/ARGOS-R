import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";
import { SEED_INCIDENTS, SEED_UNITS } from "@/modules/domain/seed.data";
import { REGIONS_MA } from "@/modules/domain/provinces.data";

// ============================================================================
// V-4 — le jeu de démonstration doit ÊTRE ÉPROUVABLE
//
// Un jeu de données de démonstration n'est pas un décor. C'est lui qui décide si
// un défaut de portée se voit ou passe inaperçu : quand une place d'armes voyait
// zéro unité parce qu'aucune ne stationnait à moins de 85 km, une liste vide
// était indiscernable d'un filtre cassé.
//
// Ces tests protègent les propriétés dont les autres lots dépendent — pas la
// prose des incidents, qui peut changer librement.
// ============================================================================

describe("V-4 — jeu de démonstration", () => {
  
  // --- cohérence du référentiel --------------------------------------------

  it("chaque incident porte une région CANONIQUE", () => {
    // La région est une clé de visibilité depuis V-1 : une variante
    // orthographique soustrairait l'incident au wali concerné.
    for (const inc of SEED_INCIDENTS) {
      expect(REGIONS_MA).toContain(inc.region);
    }
  });

  it("les identifiants sont uniques — incidents et unités", () => {
    expect(new Set(SEED_INCIDENTS.map((i) => i.id)).size).toBe(SEED_INCIDENTS.length);
    expect(new Set(SEED_UNITS.map((u) => u.id)).size).toBe(SEED_UNITS.length);
  });

  it("les intervenants désignent des unités qui EXISTENT", () => {
    // Un identifiant d'unité qui ne correspond à rien ne produit pas d'erreur :
    // il produit un tableau de bord où l'effectif engagé est simplement faux.
    const known = new Set(SEED_UNITS.map((u) => u.id));
    for (const inc of SEED_INCIDENTS) {
      for (const u of inc.responders?.units ?? []) {
        expect(known).toContain(u);
      }
    }
  });

  it("U1..U6 gardent leur identité — le catalogue d'équipements s'y rattache", () => {
    // `catalog.data.ts` rattache douze matériels à ces identifiants. Les
    // renuméroter réaffecterait, sans un mot, le parc du Génie à une unité NRBC.
    const byId = new Map(SEED_UNITS.map((u) => [u.id, u.nom]));
    expect(byId.get("U1")).toBe("1er Groupement d'Intervention");
    expect(byId.get("U2")).toBe("3e Bataillon du Génie");
    expect(byId.get("U3")).toBe("7e Régiment Aéroporté");
    expect(byId.get("U6")).toBe("4e Unité NRBC");
  });

  // --- les propriétés dont les portées dépendent ---------------------------

  it("Casablanca-Settat porte plusieurs opérations, et d'autres régions en portent aussi", () => {
    // La portée « région » (wali ET place d'armes, depuis le rattachement par
    // région) ne se démontre que si le filtre laisse passer quelque chose sans
    // tout laisser passer : des incidents dans la région, et des incidents
    // ailleurs. Sinon une liste complète serait indiscernable d'un filtre cassé.
    const casaSettat = SEED_INCIDENTS.filter((i) => i.region === "Casablanca-Settat");
    const ailleurs = SEED_INCIDENTS.filter((i) => i.region !== "Casablanca-Settat");
    expect(casaSettat.length).toBeGreaterThanOrEqual(3);
    expect(ailleurs.length).toBeGreaterThan(0);
  });

  it("chaque incident d'amorçage porte une région du référentiel — sinon le wali ne le verrait jamais", () => {
    for (const inc of SEED_INCIDENTS) expect(REGIONS_MA).toContain(inc.region);
  });

  it("un hôpital sert PLUSIEURS opérations — la portée entité en dépend", () => {
    // Un responsable d'hôpital cantonné à une seule opération ne verrait pas les
    // autres, et le défaut serait invisible si son établissement n'en servait
    // qu'une.
    const count = new Map<string, number>();
    for (const inc of SEED_INCIDENTS) {
      for (const h of inc.responders?.hospitals ?? []) count.set(h, (count.get(h) ?? 0) + 1);
    }
    expect([...count.values()].some((n) => n >= 2)).toBe(true);
  });

  it("il existe au moins une opération CLOSE et une OUVERTE", () => {
    // La close éprouve le refus de déploiement (V-2) ; les ouvertes, tout le reste.
    expect(SEED_INCIDENTS.some((i) => i.st === "closed")).toBe(true);
    expect(SEED_INCIDENTS.some((i) => i.st !== "closed")).toBe(true);
  });

  it("les opérations ont de quoi remplir un tableau de bord", () => {
    // Le jeu précédent n'avait ni description, ni bilan, ni intervenants : les
    // tableaux de bord de V-3 y étaient vides.
    for (const inc of SEED_INCIDENTS) {
      expect(inc.desc?.length ?? 0).toBeGreaterThan(40);
      expect(inc.casualties).toBeDefined();
      expect((inc.responders?.units.length ?? 0) + (inc.responders?.hospitals.length ?? 0)).toBeGreaterThan(0);
    }
  });

  // --- la numérotation ------------------------------------------------------

  describe("numérotation des nouveaux incidents", () => {
    let app: INestApplication;
    const base = () => request(app.getHttpServer());

    beforeAll(async () => {
      process.env.AUTH_MODE = "dev";
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = moduleRef.createNestApplication();
      app.setGlobalPrefix("api");
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
      await app.init();
    });
    afterAll(async () => app.close());

    it("un incident créé ne REPREND JAMAIS un identifiant existant", async () => {
      // La numérotation partait du NOMBRE d'incidents : avec onze lignes amorcées
      // à partir de INC-2612, la toute première création rendait INC-2619 — déjà
      // pris. Deux incidents de même identifiant, c'est une boucle adressée à la
      // mauvaise opération.
      const tok = (
        await base().post("/api/auth/dev-token").send({ username: "m.zraib", role: "superadmin" }).expect(201)
      ).body.access_token as string;
      const auth = { Authorization: `Bearer ${tok}` };

      const before = (await base().get("/api/incidents").set(auth).expect(200)).body as { id: string }[];
      const existing = new Set(before.map((i) => i.id));

      const made: string[] = [];
      for (let n = 0; n < 3; n++) {
        const res = await base()
          .post("/api/incidents")
          .set(auth)
          .send({
            titre: `Essai de numérotation ${n}`,
            type: "industrial",
            region: "Souss-Massa",
            sev: "low",
            st: "open",
            x: 40,
            y: 40,
            ll: [-9.6, 30.42],
          })
          .expect(201);
        made.push(res.body.id as string);
      }

      for (const id of made) expect(existing.has(id)).toBe(false);
      expect(new Set(made).size).toBe(made.length);
    });
  });
});
