import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { ScheduleModule } from "@nestjs/schedule";
import { CommonModule } from "./common/common.module";
import { IngestModule } from "./ingest/ingest.module";
import { TilesModule } from "./tiles/tiles.module";
import { StatusModule } from "./status/status.module";
import { PublicApiModule } from "./api/api.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(
      process.env.MONGODB_URI ?? "mongodb://localhost:27017/forestwatch",
      {
        // small pool keeps serverless (Vercel) invocations from exhausting
        // Atlas connections; the cached Nest instance reuses one connection
        // across warm invocations. Override with MONGO_POOL_SIZE if needed.
        maxPoolSize: Number(process.env.MONGO_POOL_SIZE ?? 5),
      },
    ),
    ScheduleModule.forRoot(),
    CommonModule,
    IngestModule,
    TilesModule,
    StatusModule,
    PublicApiModule,
  ],
})
export class AppModule {}
