import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseInterceptors,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  Alert,
  AlertDocument,
  Concession,
  ConcessionDocument,
  Disaster,
  DisasterDocument,
  ForestLossAnnual,
  ForestLossAnnualDocument,
  Region,
  RegionDocument,
} from "../common/schemas";
import { CacheHeaderInterceptor } from "./cache.interceptor";

@Controller("regions")
@UseInterceptors(CacheHeaderInterceptor)
export class RegionsController {
  constructor(
    @InjectModel(Region.name) private regionModel: Model<RegionDocument>,
    @InjectModel(ForestLossAnnual.name)
    private lossModel: Model<ForestLossAnnualDocument>,
    @InjectModel(Alert.name) private alertModel: Model<AlertDocument>,
    @InjectModel(Disaster.name) private disasterModel: Model<DisasterDocument>,
    @InjectModel(Concession.name)
    private concessionModel: Model<ConcessionDocument>,
  ) {}

  @Get()
  async list(@Query("level") level?: string, @Query("q") q?: string) {
    const filter: Record<string, unknown> = {};
    if (level) filter.level = level;
    if (q) filter.$text = { $search: q };
    return this.regionModel
      .find(filter)
      .select("-geom -geomSimplified")
      .limit(200)
      .sort({ name: 1 });
  }

  @Get(":idOrSlug/summary")
  async summary(@Param("idOrSlug") idOrSlug: string) {
    const region = await this.regionModel
      .findOne(
        idOrSlug.match(/^[0-9a-f]{24}$/)
          ? { _id: idOrSlug }
          : { slug: idOrSlug },
      )
      .select("-geom -geomSimplified");
    if (!region) throw new NotFoundException();

    // alerts/disasters are stored against kabupaten; a province summary
    // must include its children
    const children = await this.regionModel
      .find({ parentId: region._id })
      .select("_id");
    const regionIds = [region._id, ...children.map((c) => c._id)];

    const since90d = new Date(Date.now() - 90 * 86_400_000);
    const [lossByYear, alertCount90d, disasterCount, concessionCount] =
      await Promise.all([
        this.lossModel.find({ regionId: region._id }).sort({ year: 1 }),
        this.alertModel.countDocuments({
          regionId: { $in: regionIds },
          alertDate: { $gte: since90d },
        }),
        this.disasterModel.countDocuments({ regionId: { $in: regionIds } }),
        this.countConcessions(region),
      ]);

    return {
      region,
      lossByYear,
      alertCount90d,
      disasterCount,
      concessionCount,
    };
  }

  private async countConcessions(region: RegionDocument): Promise<number> {
    const full = await this.regionModel.findById(region._id).select("geom");
    if (!full?.geom) return 0;
    return this.concessionModel.countDocuments({
      geom: { $geoIntersects: { $geometry: full.geom } },
    });
  }
}
