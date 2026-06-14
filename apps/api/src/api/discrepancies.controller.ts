import { Controller, Get, Query, UseInterceptors } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  DerivedDiscrepancy,
  DerivedDiscrepancyDocument,
} from "../common/schemas";
import { CacheHeaderInterceptor } from "./cache.interceptor";
import { clampLimit } from "./query.util";

@Controller("discrepancies")
@UseInterceptors(CacheHeaderInterceptor)
export class DiscrepanciesController {
  constructor(
    @InjectModel(DerivedDiscrepancy.name)
    private discrepancyModel: Model<DerivedDiscrepancyDocument>,
  ) {}

  @Get()
  async list(
    @Query("kind") kind?: string,
    @Query("region") region?: string,
    @Query("limit") limit?: string,
  ) {
    const filter: Record<string, unknown> = {};
    if (kind) filter.kind = kind;
    if (region) filter.regionId = region;

    const docs = await this.discrepancyModel
      .find(filter)
      .populate("regionId", "name nameEn slug level")
      .populate("concessionId", "companyName companySlug type commodity")
      .sort({ periodEnd: -1, areaHa: -1 })
      .limit(clampLimit(limit, 500));
    const total = await this.discrepancyModel.countDocuments(filter);
    return { total, items: docs };
  }
}
