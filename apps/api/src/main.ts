import "reflect-metadata";
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
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.enableCors({ origin: config.get<string[]>("corsOrigins"), credentials: true });

  // OpenAPI (contract-first) : documentation interactive + JSON pour générer le
  // client frontend (`packages/api-client`).
  const doc = SwaggerModule.createDocument(app, buildOpenApiConfig());
  SwaggerModule.setup("api/docs", app, doc, { jsonDocumentUrl: "api/openapi.json" });

  const port = config.get<number>("port") ?? 4000;
  await app.listen(port);
  app.get(Logger).log(`ARGOS API démarrée sur http://localhost:${port}/api (docs: /api/docs)`);
}

void bootstrap();
