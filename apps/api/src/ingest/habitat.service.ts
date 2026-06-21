import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { HabitatEcoregion, HabitatEcoregionDocument } from "../common/schemas";
import { JobLockService } from "../common/job-lock.service";
import { ArchiverService } from "../common/archiver.service";
import { HttpService } from "../common/http.service";
import {
  JobRegistryService,
  cronEnabled,
} from "../common/job-registry.service";
import {
  FLAGSHIP_SPECIES,
  HABITAT_ECOREGION_NAMES,
} from "./data/flagship-species";

// RESOLVE Ecoregions 2017 (Dinerstein et al., BioScience), served openly by
// UNEP-WCMC as an ArcGIS FeatureServer. CC BY 4.0, queryable by anyone, the
// scientifically-recognized habitat units our flagship species depend on.
const SERVICE =
  "https://data-gis.unep-wcmc.org/server/rest/services/Bio-geographicalRegions/Resolve_Ecoregions/FeatureServer/0";

interface ArcGisFeatureCollection {
  features?: Feature[];
}

/**
 * 03:30 WIB, habitat ecoregions for the flagship species. We pull only the
 * named ecoregions those species inhabit (not the global 846), tag each with
 * the species that depend on it, and present them as "habitat ecoregion",
 * explicitly a habitat *unit*, not a precise per-individual range.
 */
@Injectable()
export class HabitatService implements OnModuleInit {
  static readonly JOB = "habitat";
  private readonly logger = new Logger(HabitatService.name);

  constructor(
    @InjectModel(HabitatEcoregion.name)
    private habitatModel: Model<HabitatEcoregionDocument>,
    private readonly locks: JobLockService,
    private readonly archiver: ArchiverService,
    private readonly http: HttpService,
    private readonly registry: JobRegistryService,
  ) {}

  onModuleInit() {
    this.registry.register(HabitatService.JOB, () => this.run());
  }

  @Cron("0 30 3 * * *", { timeZone: "Asia/Jakarta" })
  async cron() {
    if (!cronEnabled()) return;
    await this.run();
  }

  async run(): Promise<void> {
    await this.locks.withLock(HabitatService.JOB, async () => {
      const retrievedAt = new Date();
      let upserted = 0;

      for (const ecoName of HABITAT_ECOREGION_NAMES) {
        const speciesSlugs = FLAGSHIP_SPECIES.filter((s) =>
          s.habitatEcoregions.includes(ecoName),
        ).map((s) => s.slug);

        let fc: ArcGisFeatureCollection;
        try {
          fc = await this.http.get<ArcGisFeatureCollection>(
            `${SERVICE}/query`,
            {
              params: {
                where: `eco_name='${ecoName.replace(/'/g, "''")}'`,
                outFields: "eco_name,biome_name,realm,eco_id",
                outSR: 4326,
                // ~500m simplification keeps habitat polygons tile-friendly
                maxAllowableOffset: 0.005,
                f: "geojson",
              },
            },
          );
        } catch (err) {
          this.logger.error(`ecoregion "${ecoName}" fetch failed: ${err}`);
          continue;
        }

        const features = (fc.features ?? []).filter(
          (f) =>
            f.geometry?.type === "Polygon" ||
            f.geometry?.type === "MultiPolygon",
        );
        if (features.length === 0) {
          this.logger.warn(`ecoregion "${ecoName}": no polygons returned`);
          continue;
        }

        await this.archiver.archiveRaw(
          HabitatService.JOB,
          `${ecoName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.geojson`,
          JSON.stringify(fc),
          "application/geo+json",
        );

        const merged = mergeToMultiPolygon(
          features as Feature<Polygon | MultiPolygon>[],
        );
        const props = (features[0].properties ?? {}) as Record<string, unknown>;
        const set = {
          biomeName: String(props.biome_name ?? ""),
          realm: String(props.realm ?? ""),
          ecoId: props.eco_id != null ? Number(props.eco_id) : null,
          speciesSlugs,
          source: "RESOLVE Ecoregions 2017 (UNEP-WCMC)",
          sourceUrl: SERVICE,
          retrievedAt,
          license: "CC BY 4.0",
        };
        try {
          await this.habitatModel.updateOne(
            { ecoName },
            { $set: { ...set, geom: merged } },
            { upsert: true },
          );
          upserted++;
        } catch (err) {
          // one unstoreable ecoregion must not fail the whole job
          this.logger.error(`ecoregion "${ecoName}" upsert failed: ${err}`);
        }
      }

      return {
        stats: { ecoregions: HABITAT_ECOREGION_NAMES.length, upserted },
      };
    });
  }
}

/** combine one ecoregion's polygon parts into a single MultiPolygon */
function mergeToMultiPolygon(
  features: Feature<Polygon | MultiPolygon>[],
): MultiPolygon {
  const coords: Polygon["coordinates"][] = [];
  for (const f of features) {
    if (f.geometry.type === "Polygon") {
      coords.push(f.geometry.coordinates);
    } else {
      coords.push(...f.geometry.coordinates);
    }
  }
  return { type: "MultiPolygon", coordinates: coords };
}
