import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import * as turf from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import {
  Alert,
  AlertDocument,
  Concession,
  ConcessionDocument,
  ProtectedArea,
  ProtectedAreaDocument,
  Region,
  RegionDocument,
} from "../common/schemas";

interface CachedPolygon {
  id: Types.ObjectId;
  bbox: [number, number, number, number];
  feature: Feature<Polygon | MultiPolygon>;
}

/**
 * Derive step 1: stamp each new alert with regionId, insideConcessionId,
 * insideProtected, insideMoratorium.
 *
 * PERFORMANCE-CRITICAL PATH. Bulk-joining ~100k alert points × thousands of
 * polygons nightly is too slow if every point does a $geoIntersects query.
 * Strategy (per spec §5):
 *   1. only process alerts since the last successful run (flaggedAt: null)
 *   2. work per-region: Mongo $geoIntersects with the region bbox does the
 *      coarse candidate filtering of polygons ONCE per region
 *   3. inner loop is in-memory: turf bbox rejection + booleanPointInPolygon
 *      — Mongo for candidates, turf for exactness.
 */
@Injectable()
export class SpatialFlagsService {
  private readonly logger = new Logger(SpatialFlagsService.name);
  private static readonly BATCH = 5_000;

  constructor(
    @InjectModel(Alert.name) private alertModel: Model<AlertDocument>,
    @InjectModel(Region.name) private regionModel: Model<RegionDocument>,
    @InjectModel(Concession.name)
    private concessionModel: Model<ConcessionDocument>,
    @InjectModel(ProtectedArea.name)
    private protectedModel: Model<ProtectedAreaDocument>,
  ) {}

  async run(): Promise<{ flagged: number }> {
    let flagged = 0;

    const regionIds = await this.alertModel.distinct("regionId", {
      flaggedAt: null,
    });

    for (const regionId of regionIds) {
      if (!regionId) continue;
      const region = await this.regionModel.findById(regionId).select("geom name");
      if (!region) continue;

      const regionBboxPolygon = this.bboxPolygonOf(region.geom);

      // coarse candidate filtering in Mongo, once per region
      const concessions = await this.loadPolygons(
        this.concessionModel.find({
          geom: { $geoIntersects: { $geometry: regionBboxPolygon } },
        }),
      );
      const protectedAreas = await this.loadPolygons(
        this.protectedModel.find({
          kind: "protected",
          geom: { $geoIntersects: { $geometry: regionBboxPolygon } },
        }),
      );
      const moratorium = await this.loadPolygons(
        this.protectedModel.find({
          kind: "moratorium",
          geom: { $geoIntersects: { $geometry: regionBboxPolygon } },
        }),
      );

      // exact point-in-polygon in memory, batched
      for (;;) {
        const alerts = await this.alertModel
          .find({ regionId, flaggedAt: null })
          .limit(SpatialFlagsService.BATCH);
        if (alerts.length === 0) break;

        const ops = alerts.map((alert) => {
          const pt = alert.geom.coordinates;
          return {
            updateOne: {
              filter: { _id: alert._id },
              update: {
                $set: {
                  insideConcessionId: this.hitId(concessions, pt),
                  insideProtected: this.hitId(protectedAreas, pt) !== null,
                  insideMoratorium: this.hitId(moratorium, pt) !== null,
                  flaggedAt: new Date(),
                },
              },
            },
          };
        });
        // cast: bulkWrite's generic rejects Types.ObjectId vs schema ObjectId
        await this.alertModel.bulkWrite(ops as never[], { ordered: false });
        flagged += alerts.length;
      }

      this.logger.log(
        `flagged region ${region.name}: ${concessions.length} concessions, ` +
          `${protectedAreas.length} protected, ${moratorium.length} moratorium cached`,
      );
    }

    return { flagged };
  }

  private hitId(
    polygons: CachedPolygon[],
    pt: [number, number],
  ): Types.ObjectId | null {
    for (const p of polygons) {
      const [minX, minY, maxX, maxY] = p.bbox;
      if (pt[0] < minX || pt[0] > maxX || pt[1] < minY || pt[1] > maxY) continue;
      if (turf.booleanPointInPolygon(pt, p.feature)) return p.id;
    }
    return null;
  }

  private async loadPolygons(
    query: ReturnType<Model<never>["find"]>,
  ): Promise<CachedPolygon[]> {
    const docs = (await query.select("geom").lean()) as unknown as {
      _id: Types.ObjectId;
      geom: Polygon | MultiPolygon;
    }[];
    return docs
      .filter((d) => d.geom)
      .map((d) => {
        const feature = turf.feature(d.geom);
        return {
          id: d._id,
          bbox: turf.bbox(feature) as [number, number, number, number],
          feature,
        };
      });
  }

  private bboxPolygonOf(geom: Record<string, unknown>): Polygon {
    const bb = turf.bbox(turf.feature(geom as unknown as MultiPolygon));
    return turf.bboxPolygon(bb).geometry;
  }
}
