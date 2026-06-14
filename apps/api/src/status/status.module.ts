import { Module } from "@nestjs/common";
import { StatusService } from "./status.service";

@Module({
  providers: [StatusService],
  exports: [StatusService],
})
export class StatusModule {}
