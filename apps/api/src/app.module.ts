import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { ScheduleModule } from "@nestjs/schedule";
import { CommonModule } from "./common/common.module";
import { IngestModule } from "./ingest/ingest.module";
import { DeriveModule } from "./derive/derive.module";
import { TilesModule } from "./tiles/tiles.module";
import { StatusModule } from "./status/status.module";
import { PublicApiModule } from "./api/api.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(
      process.env.MONGODB_URI ?? "mongodb://localhost:27017/forestwatch",
    ),
    ScheduleModule.forRoot(),
    CommonModule,
    IngestModule,
    DeriveModule,
    TilesModule,
    StatusModule,
    PublicApiModule,
  ],
})
export class AppModule {}
