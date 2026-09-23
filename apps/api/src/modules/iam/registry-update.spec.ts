import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { UsersService } from "@/modules/iam/users.service";
import type { DomainService } from "@/modules/domain/domain.service";

// ============================================================================
// Mise à jour d'une station — ce qui NE change PAS (ADR 0027)
//
//   1. les comptes : le registre disque fait autorité, et lui seul — aucun
//      compte du jeu d'amorçage n'est réinjecté sur une station qui a déjà
//      son registre ; un registre sans aucun Super Administrateur actif
//      retrouve le compte fondateur, et lui seul ;
//   2. le parc d'équipement : repris tel quel, même quand la version du seed
//      a changé — ce que l'opérateur a saisi (article, équipe, numéro) reste.
//
// Chaque démarrage est simulé par un chargement ISOLÉ des modules, avec un
// vrai fichier d'instantané dans un dossier jeté (voir empty-restore.spec).
// ============================================================================

function boot<T>(modulePath: string, ctor: string, env: Record<string, string>, make: (Ctor: new () => T) => T): T {
  let svc: T | undefined;
  jest.isolateModules(() => {
    const previous: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(env)) {
      previous[k] = process.env[k];
      process.env[k] = v;
    }
    try {
      const mod = require(modulePath) as Record<string, new () => T>;
      svc = make(mod[ctor]);
    } finally {
      for (const [k, v] of Object.entries(previous)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
  return svc!;
}

const account = (id: string, matricule: string, roles: string[], disabled = false) => ({
  id, matricule, nom: matricule, roles, disabled, online: false, passwordChanged: true, password: "x", tempPassword: null, activatedByAdmin: true,
  createdAt: "2026-09-01T00:00:00Z", createdBy: "test", lastLogin: null,
});

describe("mise à jour d'une station — comptes et parc conservés (ADR 0027)", () => {
  it("un registre existant ne reçoit AUCUN compte du seed ; seuls ses comptes restent", () => {
    const dir = mkdtempSync(join(tmpdir(), "argos-iam-"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "iam.json"), JSON.stringify({ users: [account("u-benjelloun", "m.zraib", ["superadmin"]), account("u-x", "c.station", ["resp_unit"])] }));
    const users = boot<UsersService>("@/modules/iam/users.service", "UsersService", { DEV_PERSIST: "on", DEV_DATA_DIR: dir }, (Ctor) => new Ctor());
    const matricules = users.list().map((u) => u.matricule).sort();
    expect(matricules).toEqual(["c.station", "m.zraib"]);
  });

  it("un registre sans aucun Super Administrateur actif retrouve le compte fondateur — et rien d'autre", () => {
    const dir = mkdtempSync(join(tmpdir(), "argos-iam-"));
    writeFileSync(join(dir, "iam.json"), JSON.stringify({ users: [account("u-x", "c.station", ["resp_unit"]), account("u-y", "a.root", ["superadmin"], true)] }));
    const users = boot<UsersService>("@/modules/iam/users.service", "UsersService", { DEV_PERSIST: "on", DEV_DATA_DIR: dir }, (Ctor) => new Ctor());
    const matricules = users.list().map((u) => u.matricule).sort();
    expect(matricules).toEqual(["a.root", "c.station", "m.zraib"]);
    expect(users.list().some((u) => u.matricule === "m.zraib" && u.status === "active" && u.roles.includes("superadmin"))).toBe(true);
  });

  it("le parc d'équipement est repris tel quel après une montée de version du seed (démonstration) — rien n'y est ajouté (ADR 0033)", () => {
    const dir = mkdtempSync(join(tmpdir(), "argos-domain-"));
    const mien = { id: "EQ-900", desig: "Groupe électrogène de l'opérateur", cat: "Énergie", unit: "1er GI", unitId: "U1", ownerKind: "unit", stock: 3, threshold: 1, cond: "ok", teamId: "T-1", serial: "GE-2026-01" };
    // Un instantané écrit par une version de seed ANTÉRIEURE, en démonstration.
    writeFileSync(join(dir, "domain.json"), JSON.stringify({ seedVersion: 1, dataProfile: "demo", equipment: [mien] }));
    const domain = boot<DomainService>("@/modules/domain/domain.service", "DomainService", { DATA_PROFILE: "demo", APP_MODE: "demo", DEV_PERSIST: "on", DEV_DATA_DIR: dir }, (Ctor) => new Ctor());
    const relu = domain.listEquipment().find((e) => e.id === "EQ-900");
    expect(relu).toEqual(mien);
    // Une mise à jour n'injecte plus les articles de démonstration (ADR 0033) : le parc est celui de la station.
    expect(domain.listEquipment().map((e) => e.id)).toEqual(["EQ-900"]);
  });
});
