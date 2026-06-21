import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { JobRegistryService } from "../common/job-registry.service";
import { StatusService } from "../status/status.service";
import { ApiKeyGuard } from "./api-key.guard";
import { CacheHeaderInterceptor } from "./cache.interceptor";

@Controller()
export class AdminController {
  constructor(
    private readonly registry: JobRegistryService,
    private readonly statusService: StatusService,
  ) {}

  /** public, powers the /status trust page */
  @Get("status")
  @UseInterceptors(CacheHeaderInterceptor)
  async status() {
    return this.statusService.build();
  }

  @Post("admin/jobs/:name/run")
  @UseGuards(ApiKeyGuard)
  async runJob(@Param("name") name: string) {
    const ok = await this.registry.run(name);
    if (!ok) {
      throw new NotFoundException(
        `unknown job; available: ${this.registry.names().join(", ")}`,
      );
    }
    return { triggered: name };
  }
}
