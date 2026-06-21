import { Controller, Get, Query, UseInterceptors } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Alert, AlertDocument } from "../common/schemas";
import { CacheHeaderInterceptor } from "./cache.interceptor";
import { bboxToPolygon, clampLimit, parseDate } from "./query.util";

/**
 * Attribute queries only, alert geometry ships to the client via the
 * alerts.pmtiles layer, never from here (§8).
 */
@Controller("alerts")
@UseInterceptors(CacheHeaderInterceptor)
export class AlertsController {
  constructor(
    @InjectModel(Alert.name) private alertModel: Model<AlertDocument>,
  ) {}

  @Get()
  async list(
    @Query("bbox") bbox?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("system") system?: string,
    @Query("region") region?: string,
    @Query("limit") limit?: string,
  ) {
    const filter: Record<string, unknown> = {};
    if (bbox) {
      filter.geom = { $geoIntersects: { $geometry: bboxToPolygon(bbox) } };
    }
    const fromDate = parseDate(from);
    const toDate = parseDate(to);
    if (fromDate || toDate) {
      filter.alertDate = {
        ...(fromDate ? { $gte: fromDate } : {}),
        ...(toDate ? { $lte: toDate } : {}),
      };
    }
    if (system) filter.system = system;
    if (region) filter.regionId = region;

    const docs = await this.alertModel
      .find(filter)
      .select("-geom")
      .sort({ alertDate: -1 })
      .limit(clampLimit(limit));
    const total = await this.alertModel.countDocuments(filter);
    return { total, items: docs };
  }
}
