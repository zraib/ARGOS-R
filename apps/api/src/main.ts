import "reflect-metadata";
import type { NextFunction, Request, Response } from "express";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { flushDevState } from "@/common/dev-store";
import { ConfigService } from "@nestjs/config";
import { SwaggerModule } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";
import { AppModule } from "@/app.module";
import { buildOpenApiConfig } from "@/openapi";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const config = app.get(ConfigService);

  app.setGlobalPrefix("api");

  // Cache HTTP des lectures (voir PERF_AUDIT.md § F-05). Express émet déjà un
  // ETag et répond 304 sur If-None-Match ; on rend la politique EXPLICITE :
  // `no-cache` = le navigateur stocke mais REVALIDE à chaque requête. Fenêtre
  // de péremption nulle — un poste de commandement ne voit jamais une situation
  // périmée, il économise seulement le re-transfert d'octets identiques
  // (ex. /hospitals : 31 Ko → 0 tant que la liste n'a pas changé). `private` :
  // réponses authentifiées, jamais de cache partagé.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === "GET") res.setHeader("Cache-Control", "private, no-cache");
    next();
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  // CORS : liste stricte en production. En mode dev, on accepte AUSSI les
  // origines du réseau privé (localhost, 192.168.x, 10.x, 172.16-31.x, *.local)
  // pour pouvoir tester depuis un téléphone du LAN — sinon le préflight repart
  // sans Access-Control-Allow-Origin et l'écran de connexion conclut à tort
  // « API injoignable ».
  const allowList = config.get<string[]>("corsOrigins") ?? [];
  const devMode = process.env.AUTH_MODE !== "keycloak" && process.env.NODE_ENV !== "production";
  const privateLan = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|[a-z0-9-]+\.local)(:\d+)?$/i;
  app.enableCors({
    origin: (origin, cb) => {
      // Requêtes sans origine (curl, santé, outillage) : autorisées.
      if (!origin) return cb(null, true);
      if (allowList.includes(origin) || (devMode && privateLan.test(origin))) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  });

  // OpenAPI (contract-first) : documentation interactive + JSON pour générer le
  // client frontend (`packages/api-client`).
  const doc = SwaggerModule.createDocument(app, buildOpenApiConfig());
  SwaggerModule.setup("api/docs", app, doc, { jsonDocumentUrl: "api/openapi.json" });

  // SIGTERM / SIGINT (docker stop, mise à jour, redémarrage du mode watch) : les
  // instantanés différés sont écrits, puis le processus sort AUSSITÔT (ADR
  // 0033). Pas d'arrêt « gracieux » de Nest : il attendrait la fin des flux
  // temps réel ouverts par les navigateurs — qui ne finissent jamais — et le
  // processus resterait en vie sans plus écouter (constaté : le mode watch ne
  // redémarrait plus, docker stop attendait ses 10 s).
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.once(sig, () => {
      flushDevState();
      process.exit(0);
    });
  }

  const port = config.get<number>("port") ?? 3005;
  await app.listen(port);
  app.get(Logger).log(`ARGOS API démarrée sur http://localhost:${port}/api (docs: /api/docs)`);
}

void bootstrap();
