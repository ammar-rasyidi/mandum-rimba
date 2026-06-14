import { Module } from "@nestjs/common";
import { TilesService } from "./tiles.service";

@Module({
  providers: [TilesService],
})
export class TilesModule {}
