import { Module } from "@nestjs/common";
import { StatusModule } from "../status/status.module";
import { RegionsController } from "./regions.controller";
import { AlertsController } from "./alerts.controller";
import { ConcessionsController } from "./concessions.controller";
import { DisastersController } from "./disasters.controller";
import { DiscrepanciesController } from "./discrepancies.controller";
import { CompaniesController } from "./companies.controller";
import { StoriesController } from "./stories.controller";
import { ExportController } from "./export.controller";
import { AdminController } from "./admin.controller";

@Module({
  imports: [StatusModule],
  controllers: [
    RegionsController,
    AlertsController,
    ConcessionsController,
    DisastersController,
    DiscrepanciesController,
    CompaniesController,
    StoriesController,
    ExportController,
    AdminController,
  ],
})
export class PublicApiModule {}
