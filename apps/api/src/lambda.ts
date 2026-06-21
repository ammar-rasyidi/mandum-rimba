import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import express, { type Express, type Request, type Response } from "express";
import { AppModule } from "./app.module";

/**
 * Vercel serverless entry for the read-only REST API.
 *
 * A Nest app is bootstrapped once and cached on the module scope, so warm
 * invocations reuse the same instance (and the same Mongoose connection, see
 * the small pool size in app.module). Heavy work (ingest, tiles/tippecanoe)
 * never runs here; that lives on Modal. CRON_ENABLED must be "false" in this
 * deployment so the @nestjs/schedule timers stay inert.
 *
 * Vercel passes Node-style (req, res); an Express app is itself such a
 * handler, so we just hand the request to it, no API-Gateway adapter needed.
 */
const expressApp: Express = express();
let bootstrapped: Promise<void> | undefined;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressApp),
    { logger: ["error", "warn"] },
  );

  const origins = (process.env.CORS_ORIGINS ?? "*")
    .split(",")
    .map((o) => o.trim());
  app.enableCors({ origin: origins, methods: ["GET", "POST"] });
  app.setGlobalPrefix("v1");

  await app.init();
}

export default async function handler(req: Request, res: Response) {
  bootstrapped ??= bootstrap();
  await bootstrapped;
  expressApp(req, res);
}
