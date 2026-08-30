import { Test } from "@nestjs/testing";
import { DomainService } from "@/modules/domain/domain.service";
import { CatalogService } from "@/modules/domain/catalog.service";

// ============================================================================
// ARGOS — le battement du compte rendu (lot P3-b)
//
// Ce que ces tests protègent : **le silence doit être un signal**. Avant, une
// entité muette était indistinguable d'une entité calme — l'état-major lisait
// des jauges, jamais des comptes rendus. Si la détection des manquants se
// casse, on retombe dans ce silence, et personne ne s'en apercevra.
// ============================================================================

async function build() {
  const mod = await Test.createTestingModule({ providers: [DomainService, CatalogService] }).compile();
  const domain = mod.get(DomainService);
  // Ardoise propre : le service relit l'instantané de dev au démarrage.
  (domain as unknown as { sitreps: unknown[] }).sitreps = [];
  return domain;
}

describe("SITREP — la cadence suit le niveau d'alerte", () => {
  it("N1 quotidien · N2 8 h · N3 4 h · N4 horaire", async () => {
    const domain = await build();
    const attendu: Record<1 | 2 | 3 | 4, number> = { 1: 1440, 2: 480, 3: 240, 4: 60 };
    for (const lvl of [1, 2, 3, 4] as const) {
      domain.setAlertLevel(lvl, "test");
      expect(domain.sitrepCadence()).toBe(attendu[lvl]);
    }
  });

  it("changer de niveau resserre la cadence sans redéploiement", async () => {
    const domain = await build();
    domain.setAlertLevel(1, "test");
    const calme = domain.sitrepCadence();
    domain.setAlertLevel(4, "test");
    expect(domain.sitrepCadence()).toBeLessThan(calme);
    expect(domain.getAlertLevel()).toBe(4);
  });
});

describe("SITREP — publier", () => {
  it("numérote, horodate et rend immuable", async () => {
    const domain = await build();
    const rec = domain.publishSitrep({
      entityKind: "hospital", entityId: "H1", state: "strained",
      needs: "2 respirateurs", author: "i.benfares",
    });
    expect(rec.id).toBe("SIT-0001");
    expect(rec.number).toBe(1);
    expect(rec.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const second = domain.publishSitrep({
      entityKind: "unit", entityId: "U1", state: "nominal", author: "n.fassi",
    });
    expect(second.number).toBe(2);
    // Le plus récent d'abord.
    expect(domain.listSitreps()[0].id).toBe("SIT-0002");
  });

  it("filtre par entité", async () => {
    const domain = await build();
    domain.publishSitrep({ entityKind: "hospital", entityId: "H1", state: "nominal", author: "a" });
    domain.publishSitrep({ entityKind: "unit", entityId: "U1", state: "nominal", author: "b" });
    expect(domain.listSitreps("H1")).toHaveLength(1);
    expect(domain.listSitreps("H1")[0].entityId).toBe("H1");
  });

  it("inscrit le compte rendu dans le fil du poste de commandement", async () => {
    const domain = await build();
    const avant = domain.listFeed().length;
    domain.publishSitrep({ entityKind: "shelter", entityId: "S1", state: "overwhelmed", author: "c" });
    expect(domain.listFeed().length).toBe(avant + 1);
    expect(domain.listFeed()[0].txt).toContain("SIT-0001");
  });
});

describe("SITREP — le silence est un signal", () => {
  it("une entité qui n'a JAMAIS rendu compte est signalée (overdueMin -1)", async () => {
    const domain = await build();
    const manquants = domain.missingSitreps();
    // Toutes les entités surveillées, puisque aucune n'a rendu compte.
    expect(manquants.length).toBeGreaterThan(0);
    expect(manquants.every((m) => m.lastAt === null && m.overdueMin === -1)).toBe(true);
  });

  it("publier sort l'entité de la liste des manquants", async () => {
    const domain = await build();
    const h = domain.listHospitals()[0];
    expect(domain.missingSitreps().some((m) => m.entityId === h.id)).toBe(true);

    domain.publishSitrep({ entityKind: "hospital", entityId: h.id, state: "nominal", author: "test" });
    expect(domain.missingSitreps().some((m) => m.entityId === h.id)).toBe(false);
  });

  it("le retard se rouvre quand la cadence est dépassée", async () => {
    const domain = await build();
    const h = domain.listHospitals()[0];
    domain.publishSitrep({ entityKind: "hospital", entityId: h.id, state: "nominal", author: "test" });
    expect(domain.missingSitreps().some((m) => m.entityId === h.id)).toBe(false);

    // On vieillit artificiellement le compte rendu au-delà de la cadence N4.
    domain.setAlertLevel(4, "test");
    const reps = (domain as unknown as { sitreps: { entityId: string; publishedAt: string }[] }).sitreps;
    const mine = reps.find((r) => r.entityId === h.id)!;
    mine.publishedAt = new Date(Date.now() - 3 * 60 * 60_000).toISOString(); // 3 h

    const retard = domain.missingSitreps().find((m) => m.entityId === h.id);
    expect(retard).toBeDefined();
    // 3 h écoulées, cadence 1 h → environ 2 h de retard.
    expect(retard!.overdueMin).toBeGreaterThan(100);
  });
});
