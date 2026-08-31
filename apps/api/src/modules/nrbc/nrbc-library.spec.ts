import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppModule } from "@/app.module";
import { SUBSTANCES } from "@/modules/nrbc/infrastructure/substances.data";
import {
  IMPORT_FORMAT,
  mergeLibrary,
  SubstanceImportError,
  validateImport,
} from "@/modules/nrbc/infrastructure/substance-import";

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
    // Isoler les tests de ce qui est VERSÉ sur la machine : un poste où
    // l'état-major a chargé l'ERG 2024 doit donner le même résultat qu'un poste
    // vierge. Sans cela, les assertions dépendraient de ce qu'un opérateur a
    // importé la veille — un test qui change de verdict tout seul.
    process.env.NRBC_DATA_DIR = mkdtempSync(join(tmpdir(), "argos-nrbc-"));
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
    // Pas d'égalité stricte au décompte livré : un poste peut avoir un jeu
    // sous licence versé (lot N-3b), et le test doit rester vrai chez lui.
    expect(all.body.provenance.total).toBeGreaterThanOrEqual(SUBSTANCES.length);
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

  // --- la chaîne d'import (lot N-3b) ---------------------------------------
  //
  // Ce que ces tests protègent : qu'un fichier douteux soit REFUSÉ EN ENTIER.
  // Charger la moitié d'un référentiel de sécurité est pire que n'en charger
  // aucun — on croit consulter la base complète.

  describe("import d'un jeu sous licence", () => {
    const ok = {
      format: IMPORT_FORMAT,
      source: "Essai",
      retrievedAt: "2026-08-31",
      authorization: "essai",
      substances: [
        {
          id: "a",
          un: "9001",
          ergGuide: "124",
          labels: { fr: "A", ar: "A", en: "A" },
          state: "gas" as const,
          ergVerified: false,
        },
      ],
    };

    it("accepte un fichier conforme", () => {
      expect(() => validateImport(ok)).not.toThrow();
    });

    it("refuse un format inconnu plutôt que de le deviner", () => {
      expect(() => validateImport({ ...ok, format: "autre.v9" })).toThrow(SubstanceImportError);
    });

    it("EXIGE le titre de détention — d'où vient la donnée et à quel droit", () => {
      // Champ délibérément libre mais obligatoire : il force celui qui verse la
      // donnée à écrire sous quel droit il le fait. C'est la seule trace qui
      // restera d'une question qui est juridique avant d'être technique.
      expect(() => validateImport({ ...ok, authorization: "  " })).toThrow(/authorization/);
      expect(() => validateImport({ ...ok, source: "" })).toThrow(/source/);
    });

    it("refuse deux substances portant le MÊME numéro ONU", () => {
      // L'étiquette orange d'une citerne est un numéro : un doublon ferait
      // remonter la mauvaise fiche à l'usage le plus probable sur intervention.
      const dup = { ...ok, substances: [ok.substances[0], { ...ok.substances[0], id: "b" }] };
      expect(() => validateImport(dup)).toThrow(/ONU 9001 en double/);
    });

    it("refuse un seul déversement renseigné", () => {
      const half = {
        ...ok,
        substances: [{ ...ok.substances[0], small: { isolationM: 61, protectDayKm: 0.3, protectNightKm: 1.4 } }],
      };
      expect(() => validateImport(half)).toThrow(/DEUX déversements/);
    });

    it("refuse des distances hors de tout ordre de grandeur — colonnes inversées", () => {
      // Le défaut le plus probable d'un tableur converti à la main : mètres et
      // kilomètres permutés. Sans ce garde-fou il donne un périmètre absurde
      // que rien ne signale.
      const swapped = {
        ...ok,
        substances: [
          {
            ...ok.substances[0],
            small: { isolationM: 0.32, protectDayKm: 61, protectNightKm: 145 },
            large: { isolationM: 9.65, protectDayKm: 914, protectNightKm: 1127 },
          },
        ],
      };
      expect(() => validateImport(swapped)).toThrow(/ordre de grandeur/);
    });

    it("refuse `ergVerified` sans distances", () => {
      expect(() => validateImport({ ...ok, substances: [{ ...ok.substances[0], ergVerified: true }] })).toThrow(
        /ergVerified/,
      );
    });

    it("le jeu importé PRIME sur la bibliothèque livrée, par identifiant", () => {
      // L'ordre inverse rendrait l'import sans effet sur les substances
      // d'origine — précisément celles qu'on veut voir vérifiées en premier.
      const releve = { ...SUBSTANCES[0], labels: { ...SUBSTANCES[0].labels, fr: "Chlore (relevé)" } };
      const merged = mergeLibrary(SUBSTANCES, [releve]);
      expect(merged).toHaveLength(SUBSTANCES.length);
      expect(merged.find((s) => s.id === SUBSTANCES[0].id)?.labels.fr).toBe("Chlore (relevé)");
    });

    it("une substance inconnue de la bibliothèque livrée est AJOUTÉE", () => {
      const merged = mergeLibrary(SUBSTANCES, [ok.substances[0] as never]);
      expect(merged).toHaveLength(SUBSTANCES.length + 1);
    });
  });
});
