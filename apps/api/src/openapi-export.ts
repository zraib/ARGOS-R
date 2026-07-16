import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule } from "@nestjs/swagger";
import { writeFileSync } from "node:fs";
import { AppModule } from "@/app.module";
import { buildOpenApiConfig } from "@/openapi";

/** Génère `openapi.json` sans démarrer le serveur (pour le client généré). */
async function run() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix("api");
  const doc = SwaggerModule.createDocument(app, buildOpenApiConfig());
  writeFileSync("openapi.json", JSON.stringify(doc, null, 2));
  await app.close();
  // eslint-disable-next-line no-console
  console.log("openapi.json généré à la racine de apps/api.");
}

void run();
