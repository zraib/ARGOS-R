import "reflect-metadata";
import type { NextFunction, Request, Response } from "express";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
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
  app.enableCors({ origin: config.get<string[]>("corsOrigins"), credentials: true });

  // OpenAPI (contract-first) : documentation interactive + JSON pour générer le
  // client frontend (`packages/api-client`).
  const doc = SwaggerModule.createDocument(app, buildOpenApiConfig());
  SwaggerModule.setup("api/docs", app, doc, { jsonDocumentUrl: "api/openapi.json" });

  const port = config.get<number>("port") ?? 3005;
  await app.listen(port);
  app.get(Logger).log(`ARGOS API démarrée sur http://localhost:${port}/api (docs: /api/docs)`);
}

void bootstrap();
