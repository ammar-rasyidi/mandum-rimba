import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { json, urlencoded } from "express";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  // 8 MB so the Share feature can POST a base64 map image (default is 100 kB)
  app.use(json({ limit: "8mb" }));
  app.use(urlencoded({ extended: true, limit: "8mb" }));

  const origins = (process.env.CORS_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim());
  app.enableCors({ origin: origins, methods: ["GET", "POST"] });
  app.setGlobalPrefix("v1");

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  new Logger("Bootstrap").log(`Mandum Rimba API listening on :${port}`);
}

bootstrap();
