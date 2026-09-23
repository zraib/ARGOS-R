import "reflect-metadata";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ============================================================================
// ADR 0033 — une mise à jour de la station ne touche à RIEN
//
// On rejoue ce qu'une station vit à la mise à jour : un instantané écrit par
// une version antérieure (autre version du jeu de départ), modifié par les
// opérateurs, relu par la nouvelle version. Tout doit revenir tel quel :
// incidents, unités, hôpitaux, abris, morgues, dossiers, croquis, messages,
// bons de travail, ressources — et aucun fichier n'est jamais écrasé par un
// démarrage, même illisible.
// ============================================================================

/** Charge un module « neuf » (constantes d'environnement relues) dans un dossier de données donné. */
function fresh<T>(dir: string, load: () => T): T {
  const saved = { ...process.env };
  process.env.STATE_SNAPSHOT = "on";
  process.env.DEV_DATA_DIR = dir;
  let out!: T;
  try {
    jest.isolateModules(() => {
      out = load();
    });
  } finally {
    process.env = saved;
  }
  return out;
}

type Store = typeof import("@/common/dev-store");
type DomainMod = typeof import("@/modules/domain/domain.service");

describe("ADR 0033 — instantanés : écriture atomique, copie de secours, rien n'est écrasé", () => {
  it("l'écriture laisse l'ancien en copie de secours, et un instantané illisible est relu depuis elle — le fichier abîmé est mis de côté, pas écrasé", () => {
    const dir = mkdtempSync(join(tmpdir(), "argos-snap-"));
    const store = fresh<Store>(dir, () => require("@/common/dev-store"));
    store.saveDevState("essai", { v: 1 });
    store.flushDevState();
    store.saveDevState("essai", { v: 2 });
    store.flushDevState();
    expect(JSON.parse(readFileSync(join(dir, "essai.json"), "utf8"))).toEqual({ v: 2 });
    expect(JSON.parse(readFileSync(join(dir, "essai.json.bak"), "utf8"))).toEqual({ v: 1 });

    // Coupure pendant une écriture d'une ancienne version : fichier tronqué.
    writeFileSync(join(dir, "essai.json"), '{"v": 3, "tronq');
    const relu = fresh<Store>(dir, () => require("@/common/dev-store"));
    expect(relu.loadDevState("essai", { v: 0 })).toEqual({ v: 1 });
    const mis = readdirSync(dir).filter((f) => f.startsWith("essai.json.illisible-"));
    expect(mis).toHaveLength(1);
    expect(readFileSync(join(dir, mis[0]), "utf8")).toBe('{"v": 3, "tronq');
  });

  it("deux copies illisibles : le repli est servi, mais les deux fichiers restent sur le disque", () => {
    const dir = mkdtempSync(join(tmpdir(), "argos-snap-"));
    writeFileSync(join(dir, "x.json"), "{abîmé");
    writeFileSync(join(dir, "x.json.bak"), "{abîmé aussi");
    const store = fresh<Store>(dir, () => require("@/common/dev-store"));
    expect(store.loadDevState("x", { vide: true })).toEqual({ vide: true });
    expect(readdirSync(dir).filter((f) => f.includes(".illisible-"))).toHaveLength(2);
    expect(existsSync(join(dir, "x.json"))).toBe(false);
  });
});

describe("ADR 0033 — une mise à jour reprend tout le domaine, quelle que soit la version du jeu de départ", () => {
  it("hôpitaux modifiés, abri et morgue ouverts, dossiers, croquis, incidents et unités : tout revient à l'identique", () => {
    const dir = mkdtempSync(join(tmpdir(), "argos-maj-"));
    // 1. La station « avant » : un premier démarrage écrit son instantané.
    fresh(dir, () => {
      const { DomainService } = require("@/modules/domain/domain.service") as DomainMod;
      new DomainService();
      (require("@/common/dev-store") as Store).flushDevState();
    });
    const file = join(dir, "domain.json");
    const snap = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown> & {
      seedVersion: number;
      hospitals: { id: string; nom: string }[];
      shelters: { id: string; nom: string }[];
      morgues: { id: string; nom: string }[];
      incidents: { id: string; titre: string }[];
      units: { id: string; nom: string }[];
      drawings?: unknown[];
    };
    // 2. Ce que les opérateurs y ont fait, sous une version ANTÉRIEURE du jeu de départ.
    snap.seedVersion = 1;
    snap.hospitals[0].nom = "Hôpital renommé par la station";
    snap.shelters.push({ ...snap.shelters[0], id: "AB-99", nom: "Abri ouvert sur le terrain" });
    const retiree = snap.morgues[0].id;
    snap.morgues = snap.morgues.slice(1); // un site retiré par l'administrateur
    snap.incidents[0].titre = "Titre corrigé par l'OPCOM";
    snap.units[0].nom = "Unité renommée";
    snap.drawings = [{ id: "D9", kind: "circle", label: "Zone rouge", coords: [[-7.6, 33.6]], radiusM: 500, createdBy: "m.zraib", createdAt: "2026-09-20T10:00:00Z" }];
    writeFileSync(file, JSON.stringify(snap));

    // 3. La nouvelle version relit.
    const apres = fresh(dir, () => {
      const { DomainService } = require("@/modules/domain/domain.service") as DomainMod;
      return new DomainService();
    });
    expect(apres.listHospitals().find((h) => h.id === snap.hospitals[0].id)?.nom).toBe("Hôpital renommé par la station");
    expect(apres.listHospitals()).toHaveLength(snap.hospitals.length);
    expect(apres.listShelters().some((s) => s.id === "AB-99" && s.nom === "Abri ouvert sur le terrain")).toBe(true);
    expect(apres.listShelters()).toHaveLength(snap.shelters.length);
    // Le site retiré ne renaît pas.
    expect(apres.listMorgues().some((m) => m.id === retiree)).toBe(false);
    expect(apres.listMorgues()).toHaveLength(snap.morgues.length);
    expect(apres.listIncidents().find((i) => i.id === snap.incidents[0].id)?.titre).toBe("Titre corrigé par l'OPCOM");
    expect(apres.listIncidents()).toHaveLength(snap.incidents.length);
    expect(apres.listUnits().find((u) => u.id === snap.units[0].id)?.nom).toBe("Unité renommée");
    expect(apres.listUnits()).toHaveLength(snap.units.length);
    expect(apres.listDrawings().map((d) => d.id)).toEqual(["D9"]);
  });
});
