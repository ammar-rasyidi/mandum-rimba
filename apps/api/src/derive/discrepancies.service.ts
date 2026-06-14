import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import {
  Alert,
  AlertDocument,
  DerivedDiscrepancy,
  DerivedDiscrepancyDocument,
} from "../common/schemas";
import { METHODOLOGY_VERSION } from "./methodology";

/**
 * Derive step 2: aggregate flagged alerts into derivedDiscrepancies — the
 * signature collection. Two windows per spec: rolling 90 days and the current
 * calendar year. Re-computed idempotently each night (upsert on the unique
 * compound key), never editorialized: each record is just counts + area +
 * methodology version.
 */
@Injectable()
export class DiscrepanciesService {
  private readonly logger = new Logger(DiscrepanciesService.name);

  constructor(
    @InjectModel(Alert.name) private alertModel: Model<AlertDocument>,
    @InjectModel(DerivedDiscrepancy.name)
    private discrepancyModel: Model<DerivedDiscrepancyDocument>,
  ) {}

  async run(): Promise<{ upserted: number }> {
    const now = new Date();
    const windows = [
      {
        start: new Date(now.getTime() - 90 * 86_400_000),
        end: now,
      },
      {
        start: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)),
        end: now,
      },
    ];

    let upserted = 0;
    for (const window of windows) {
      upserted += await this.aggregateWindow(window.start, window.end);
    }
    return { upserted };
  }

  private async aggregateWindow(start: Date, end: Date): Promise<number> {
    interface Group {
      _id: {
        kind: string;
        regionId: Types.ObjectId;
        concessionId: Types.ObjectId | null;
      };
      alertCount: number;
      areaHa: number;
    }

    // classify each flagged alert into 0..n discrepancy kinds, then group
    const groups: Group[] = await this.alertModel.aggregate([
      {
        $match: {
          flaggedAt: { $ne: null },
          regionId: { $ne: null },
          alertDate: { $gte: start, $lte: end },
        },
      },
      {
        $project: {
          regionId: 1,
          system: 1,
          insideConcessionId: 1,
          kinds: {
            $concatArrays: [
              {
                $cond: [
                  { $eq: ["$insideConcessionId", null] },
                  ["clearing_outside_concession"],
                  [],
                ],
              },
              { $cond: ["$insideProtected", ["clearing_in_protected"], []] },
              { $cond: ["$insideMoratorium", ["clearing_in_moratorium"], []] },
            ],
          },
          // pixel area in ha; keep in sync with GfwAlertsService.pixelAreaHa
          pixelHa: {
            $cond: [{ $eq: ["$system", "glad_l"] }, 0.09, 0.01],
          },
        },
      },
      { $unwind: "$kinds" },
      {
        $group: {
          _id: {
            kind: "$kinds",
            regionId: "$regionId",
            concessionId: "$insideConcessionId",
          },
          alertCount: { $sum: 1 },
          areaHa: { $sum: "$pixelHa" },
        },
      },
    ]);

    const computedAt = new Date();
    for (const g of groups) {
      await this.discrepancyModel.updateOne(
        {
          kind: g._id.kind,
          regionId: g._id.regionId,
          concessionId: g._id.concessionId ?? null,
          disasterId: null,
          periodStart: start,
          periodEnd: end,
        },
        {
          $set: {
            alertCount: g.alertCount,
            areaHa: Math.round(g.areaHa * 100) / 100,
            watershedId: null,
            methodologyVersion: METHODOLOGY_VERSION,
            computedAt,
            evidence: null,
          },
        },
        { upsert: true },
      );
    }

    this.logger.log(
      `window ${start.toISOString().slice(0, 10)}..${end.toISOString().slice(0, 10)}: ${groups.length} groups`,
    );
    return groups.length;
  }
}
