import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Query,
  UseInterceptors,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { feature, simplify } from "@turf/turf";
import type { MultiPolygon, Polygon } from "geojson";
import { ProtectedArea, ProtectedAreaDocument } from "../common/schemas";
import { CacheHeaderInterceptor } from "./cache.interceptor";

/**
 * Serves a single protected area's outline (by name) — used by the cinematic
 * place stories to raise the real WDPA boundary as a 3D prism. Simplified so
 * the payload stays light for client-side extrusion.
 */
@Controller("protected")
@UseInterceptors(CacheHeaderInterceptor)
export class ProtectedController {
  constructor(
    @InjectModel(ProtectedArea.name)
    private readonly model: Model<ProtectedAreaDocument>,
  ) {}

  @Get("geometry")
  async geometry(@Query("q") q?: string) {
    if (!q || q.length < 3) throw new BadRequestException("q required");
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    // prefer a designated protected area over a moratorium polygon of the same name
    const doc =
      (await this.model
        .findOne({ name: rx, kind: "protected" })
        .select("name geom")
        .lean()) ??
      (await this.model.findOne({ name: rx }).select("name geom").lean());
    if (!doc) throw new NotFoundException();
    let geom = doc.geom as unknown as Polygon | MultiPolygon;
    try {
      geom = simplify(feature(geom), { tolerance: 0.0015, highQuality: false })
        .geometry as Polygon | MultiPolygon;
    } catch {
      /* keep raw geometry if simplify chokes */
    }
    return { name: doc.name, geom };
  }
}
