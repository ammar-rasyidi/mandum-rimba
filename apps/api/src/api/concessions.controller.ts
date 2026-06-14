import { Controller, Get, Query, UseInterceptors } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Concession, ConcessionDocument } from "../common/schemas";
import { CacheHeaderInterceptor } from "./cache.interceptor";
import { bboxToPolygon, clampLimit } from "./query.util";

@Controller("concessions")
@UseInterceptors(CacheHeaderInterceptor)
export class ConcessionsController {
  constructor(
    @InjectModel(Concession.name)
    private concessionModel: Model<ConcessionDocument>,
  ) {}

  @Get()
  async list(
    @Query("type") type?: string,
    @Query("commodity") commodity?: string,
    @Query("company") company?: string,
    @Query("bbox") bbox?: string,
    @Query("limit") limit?: string,
  ) {
    const filter: Record<string, unknown> = {};
    if (type) filter.type = type;
    if (commodity) filter.commodity = commodity;
    if (company) {
      filter.$or = [
        { companySlug: company },
        { companyName: new RegExp(escapeRegExp(company), "i") },
      ];
    }
    if (bbox) {
      filter.geom = { $geoIntersects: { $geometry: bboxToPolygon(bbox) } };
    }

    const docs = await this.concessionModel
      .find(filter)
      .select("-geom")
      .sort({ areaHa: -1 })
      .limit(clampLimit(limit, 500));
    const total = await this.concessionModel.countDocuments(filter);
    return { total, items: docs };
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
