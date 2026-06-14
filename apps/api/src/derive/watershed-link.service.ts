import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  DerivedDiscrepancy,
  DerivedDiscrepancyDocument,
  Disaster,
  DisasterDocument,
  ForestLossAnnual,
  ForestLossAnnualDocument,
  Region,
  RegionDocument,
  Watershed,
  WatershedDocument,
} from "../common/schemas";
import { METHODOLOGY_VERSION } from "./methodology";

/**
 * Derive step 3: link each flood/landslide to its HydroBASINS watershed and
 * sum forest loss within that watershed over the preceding 10 years →
 * flood_downstream_of_loss discrepancy. Powers the Aceh launch story.
 *
 * Approximation (documented on the methodology page): "loss within the
 * watershed" is the sum of forestLossAnnual for regions whose geometry
 * intersects the watershed polygon. This is descriptive correlation, NOT a
 * causal attribution — the record stores both numbers and nothing else.
 */
@Injectable()
export class WatershedLinkService {
  private readonly logger = new Logger(WatershedLinkService.name);
  private static readonly LOOKBACK_YEARS = 10;

  constructor(
    @InjectModel(Disaster.name) private disasterModel: Model<DisasterDocument>,
    @InjectModel(Watershed.name)
    private watershedModel: Model<WatershedDocument>,
    @InjectModel(Region.name) private regionModel: Model<RegionDocument>,
    @InjectModel(ForestLossAnnual.name)
    private lossModel: Model<ForestLossAnnualDocument>,
    @InjectModel(DerivedDiscrepancy.name)
    private discrepancyModel: Model<DerivedDiscrepancyDocument>,
  ) {}

  async run(): Promise<{ linked: number }> {
    const pending = await this.disasterModel.find({
      type: { $in: ["flood", "flash_flood", "landslide"] },
      geom: { $ne: null },
      watershedLinkedAt: null,
    });

    let linked = 0;
    for (const disaster of pending) {
      const watershed = await this.watershedModel
        .findOne({
          geom: { $geoIntersects: { $geometry: disaster.geom } },
        })
        .sort({ basinLevel: -1 }); // most specific basin containing the point

      if (!watershed) {
        disaster.watershedLinkedAt = new Date();
        await disaster.save();
        continue;
      }

      const regions = await this.regionModel
        .find({
          level: "kabupaten",
          geom: { $geoIntersects: { $geometry: watershed.geom } },
        })
        .select("_id");
      const regionIds = regions.map((r) => r._id);

      const eventYear = disaster.eventDate.getUTCFullYear();
      const fromYear = eventYear - WatershedLinkService.LOOKBACK_YEARS;
      const lossByYear = await this.lossModel.aggregate([
        {
          $match: {
            regionId: { $in: regionIds },
            year: { $gte: fromYear, $lt: eventYear },
          },
        },
        { $group: { _id: "$year", ha: { $sum: "$lossHa" } } },
        { $sort: { _id: 1 } },
      ]);
      const totalLossHa =
        Math.round(
          lossByYear.reduce((s, r) => s + (r.ha as number), 0) * 100,
        ) / 100;

      if (disaster.regionId && totalLossHa > 0) {
        await this.discrepancyModel.updateOne(
          {
            kind: "flood_downstream_of_loss",
            regionId: disaster.regionId,
            concessionId: null,
            disasterId: disaster._id,
            periodStart: new Date(Date.UTC(fromYear, 0, 1)),
            periodEnd: disaster.eventDate,
          },
          {
            $set: {
              alertCount: 0,
              areaHa: totalLossHa,
              watershedId: watershed._id,
              methodologyVersion: METHODOLOGY_VERSION,
              computedAt: new Date(),
              evidence: {
                watershedName: watershed.name,
                lossByYear: lossByYear.map((r) => ({ year: r._id, ha: r.ha })),
                regionsInWatershed: regionIds.length,
              },
            },
          },
          { upsert: true },
        );
        linked++;
      }

      disaster.watershedLinkedAt = new Date();
      await disaster.save();
    }

    this.logger.log(`processed ${pending.length} disasters, linked ${linked}`);
    return { linked };
  }
}
