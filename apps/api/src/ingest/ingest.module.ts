import { Module } from "@nestjs/common";
import { GfwAlertsService } from "./gfw-alerts.service";
import { GfwAnnualService } from "./gfw-annual.service";
import { BnpbDibiService } from "./bnpb-dibi.service";
import { ConcessionsService } from "./concessions.service";
import { ModiEsdmService } from "./modi-esdm.service";
import { WdpaService } from "./wdpa.service";
import { TraseService } from "./trase.service";
import { NusantaraAtlasService } from "./nusantara-atlas.service";
import { MiningService } from "./mining.service";
import { SpeciesService } from "./species.service";
import { HabitatService } from "./habitat.service";

@Module({
  providers: [
    GfwAlertsService,
    GfwAnnualService,
    BnpbDibiService,
    ConcessionsService,
    ModiEsdmService,
    WdpaService,
    TraseService,
    NusantaraAtlasService,
    MiningService,
    SpeciesService,
    HabitatService,
  ],
})
export class IngestModule {}
