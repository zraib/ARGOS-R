import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DomainService } from "@/modules/domain/domain.service";

// ============================================================================
// Station vide — la reprise entre deux démarrages (ADR 0015)
//
// Le profil, la persistance et l'instantané sont des constantes de module :
// chaque démarrage est donc simulé par un chargement ISOLÉ des modules, avec
// l'environnement voulu, et un vrai fichier d'instantané dans un dossier jeté.
//
// Ce que le test garantit :
//   1. au premier démarrage vide, aucune graine ne survit, les hôpitaux restent ;
//   2. ce qu'un opérateur crée survit au redémarrage — MÊME quand son identifiant
//      est celui d'une ancienne graine (U1, AB-01, M1 : la numérotation repart
//      de zéro sur une station vide) ;
//   3. un instantané de démonstration est converti : ses graines partent, ce que
//      l'opérateur y avait créé reste.
// ============================================================================

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function boot(env: Record<string, string>): DomainService {
  let svc: DomainService | undefined;
  jest.isolateModules(() => {
    const previous: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(env)) {
      previous[k] = process.env[k];
      process.env[k] = v;
    }
    try {
      const mod = require("@/modules/domain/domain.service") as { DomainService: new () => DomainService };
      svc = new mod.DomainService();
    } finally {
      for (const [k, v] of Object.entries(previous)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
  return svc!;
}

const UNIT = { nom: "Unité réelle", ville: "Rabat", eff: 40, dispo: "ready" as const, readiness: 80, x: 300, y: 150, ll: [-6.84, 34.02] as [number, number] };

describe("station vide — reprise entre deux démarrages", () => {
  it("rien de semé au premier démarrage, et ce que l'opérateur crée survit — même sous un identifiant de graine", async () => {
    const dir = mkdtempSync(join(tmpdir(), "argos-empty-"));
    const env = { DATA_PROFILE: "empty", DEV_PERSIST: "on", DEV_DATA_DIR: dir };

    const first = boot(env);
    expect(first.listIncidents()).toEqual([]);
    expect(first.listUnits()).toEqual([]);
    expect(first.listShelters()).toEqual([]);
    expect(first.listMorgues()).toEqual([]);
    expect(first.listHospitals().length).toBeGreaterThan(100);
    // La numérotation repart de zéro : U1 est l'unité de l'opérateur.
    const u = first.createUnit(UNIT);
    expect(u.id).toBe("U1");
    await wait(250); // débounce de l'instantané
    const snap = JSON.parse(readFileSync(join(dir, "domain.json"), "utf8")) as { dataProfile: string; units: { id: string }[] };
    expect(snap.dataProfile).toBe("empty");
    expect(snap.units.map((x) => x.id)).toEqual(["U1"]);

    const second = boot(env);
    expect(second.listUnits().map((x) => x.id)).toEqual(["U1"]);
    expect(second.listIncidents()).toEqual([]);
    expect(second.listMorgues()).toEqual([]);
  });

  it("un instantané de démonstration est converti : les graines partent, la création de l'opérateur reste", async () => {
    const dir = mkdtempSync(join(tmpdir(), "argos-convert-"));
    const demo = boot({ DATA_PROFILE: "demo", DEV_PERSIST: "on", DEV_DATA_DIR: dir });
    expect(demo.listUnits().length).toBeGreaterThan(3);
    const mine = demo.createUnit({ ...UNIT, nom: "Unité créée pendant la démo" });
    expect(mine.id).not.toBe("U1");
    await wait(250);

    const empty = boot({ DATA_PROFILE: "empty", DEV_PERSIST: "on", DEV_DATA_DIR: dir });
    // Les cascades des incidents de démonstration retirés courent au démarrage
    // de l'application, une fois les modules construits — pas dans le constructeur.
    const cascaded: string[] = [];
    empty.registerIncidentCascade(async (id) => { cascaded.push(id); });
    await empty.onApplicationBootstrap();
    expect(cascaded.length).toBeGreaterThan(3);
    expect(cascaded).toContain("INC-2612");
    await empty.onApplicationBootstrap();
    expect(cascaded.length).toBeGreaterThan(3); // une seule fois
    expect(empty.listUnits().map((x) => x.id)).toEqual([mine.id]);
    expect(empty.listIncidents()).toEqual([]);
    expect(empty.listShelters()).toEqual([]);
    expect(empty.listMorgues()).toEqual([]);
    expect(empty.listHospitals().length).toBeGreaterThan(100);
    await wait(250);
    // Puis la station reste vide, et l'unité reste — l'instantané est désormais « empty ».
    const again = boot({ DATA_PROFILE: "empty", DEV_PERSIST: "on", DEV_DATA_DIR: dir });
    expect(again.listUnits().map((x) => x.id)).toEqual([mine.id]);
    await wait(250);

    // Retour en démonstration (ADR 0016) : les graines reviennent, l'unité reste.
    const back = boot({ DATA_PROFILE: "demo", DEV_PERSIST: "on", DEV_DATA_DIR: dir });
    expect(back.listUnits().map((x) => x.id)).toContain(mine.id);
    expect(back.listUnits().length).toBeGreaterThan(5);
    expect(back.listIncidents().length).toBeGreaterThan(3);
    expect(back.listShelters().length).toBeGreaterThan(0);
    expect(back.listMorgues().length).toBeGreaterThan(0);
    expect(back.listFieldHospitals().length).toBeGreaterThan(0);
  });
});
