import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";
import { persistenceReport } from "@/modules/health/health.controller";

// ============================================================================
// La sonde de santé dit ce qui persiste où (registre R-1). En mémoire, tout est
// « memory » ; en PostgreSQL, seuls audit, flags et bons de travail changent.
// ============================================================================

describe("Santé — rapport de persistance", () => {
  let app: INestApplication;
  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
  });
  afterAll(async () => app.close());

  it("la sonde publique annonce le pilote et le sort de chaque module", async () => {
    const res = await request(app.getHttpServer()).get("/api/health").expect(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.persistence.driver).toBe("memory");
    expect(res.body.persistence.modules.audit).toBe("memory");
    expect(res.body.persistence.modules.domain).toBe("memory");
  });

  it("avec PostgreSQL, trois modules persistent en base et les autres restent en mémoire — et c'est DIT", () => {
    const r = persistenceReport("postgres");
    expect(r.modules).toMatchObject({ audit: "postgres", flags: "postgres", orders: "postgres", iam: "memory", domain: "memory", missions: "memory", tracking: "memory" });
  });
});
