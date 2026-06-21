import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
  UseInterceptors,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import type { Response } from "express";
import {
  Alert,
  AlertDocument,
  Disaster,
  DisasterDocument,
  ForestLossAnnual,
  ForestLossAnnualDocument,
} from "../common/schemas";
import { CacheHeaderInterceptor } from "./cache.interceptor";

/**
 * CSV / GeoJSON exports for license-permitting datasets (§7.5). Datasets we
 * cannot redistribute (WDPA, Nusantara Atlas) are NOT exported here, the
 * /data page links out to the upstream source instead.
 */
@Controller("export")
@UseInterceptors(CacheHeaderInterceptor)
export class ExportController {
  private static readonly MAX_ROWS = 50_000;

  constructor(
    @InjectModel(Alert.name) private alertModel: Model<AlertDocument>,
    @InjectModel(Disaster.name) private disasterModel: Model<DisasterDocument>,
    @InjectModel(ForestLossAnnual.name)
    private lossModel: Model<ForestLossAnnualDocument>,
  ) {}

  @Get()
  async export(
    @Res() res: Response,
    @Query("dataset") dataset?: string,
    @Query("format") format: string = "csv",
    @Query("region") region?: string,
  ) {
    if (!dataset) throw new BadRequestException("dataset is required");
    if (!["csv", "geojson"].includes(format)) {
      throw new BadRequestException("format must be csv or geojson");
    }

    const rows = await this.fetch(dataset, region);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="mandumrimba-${dataset}.${format}"`,
    );

    if (format === "geojson") {
      res.setHeader("Content-Type", "application/geo+json");
      res.send({
        type: "FeatureCollection",
        features: rows
          .filter((r) => r.geom)
          .map(({ geom, ...properties }) => ({
            type: "Feature",
            geometry: geom,
            properties,
          })),
      });
      return;
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.send(toCsv(rows.map(({ geom: _geom, ...rest }) => rest)));
  }

  private async fetch(
    dataset: string,
    region?: string,
  ): Promise<Record<string, unknown>[]> {
    const regionFilter = region ? { regionId: region } : {};
    const limit = ExportController.MAX_ROWS;

    switch (dataset) {
      case "alerts":
        return this.alertModel.find(regionFilter).limit(limit).lean();
      case "disasters":
        return this.disasterModel.find(regionFilter).limit(limit).lean();
      case "forest-loss":
        return this.lossModel.find(regionFilter).limit(limit).lean();
      default:
        throw new BadRequestException(
          "dataset must be one of: alerts, disasters, forest-loss",
        );
    }
  }
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const escape = (v: unknown): string => {
    const s =
      v == null
        ? ""
        : v instanceof Date
          ? v.toISOString()
          : typeof v === "object"
            ? JSON.stringify(v)
            : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
}
