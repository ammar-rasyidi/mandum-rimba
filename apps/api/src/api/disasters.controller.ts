import { Controller, Get, Query, UseInterceptors } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Disaster, DisasterDocument } from "../common/schemas";
import { CacheHeaderInterceptor } from "./cache.interceptor";
import { clampLimit, parseDate } from "./query.util";

@Controller("disasters")
@UseInterceptors(CacheHeaderInterceptor)
export class DisastersController {
  constructor(
    @InjectModel(Disaster.name) private disasterModel: Model<DisasterDocument>,
  ) {}

  @Get()
  async list(
    @Query("type") type?: string,
    @Query("region") region?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("limit") limit?: string,
  ) {
    const filter: Record<string, unknown> = {};
    if (type) filter.type = type;
    if (region) filter.regionId = region;
    const fromDate = parseDate(from);
    const toDate = parseDate(to);
    if (fromDate || toDate) {
      filter.eventDate = {
        ...(fromDate ? { $gte: fromDate } : {}),
        ...(toDate ? { $lte: toDate } : {}),
      };
    }

    const docs = await this.disasterModel
      .find(filter)
      .sort({ eventDate: -1 })
      .limit(clampLimit(limit, 500));
    const total = await this.disasterModel.countDocuments(filter);
    return { total, items: docs };
  }
}
