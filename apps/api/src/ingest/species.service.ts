import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  Species,
  SpeciesDocument,
  SpeciesOccurrence,
  SpeciesOccurrenceDocument,
} from "../common/schemas";
import { JobLockService } from "../common/job-lock.service";
import { ArchiverService } from "../common/archiver.service";
import { HttpService } from "../common/http.service";
import {
  JobRegistryService,
  cronEnabled,
} from "../common/job-registry.service";
import { FLAGSHIP_SPECIES } from "./data/flagship-species";

const GBIF_BASE = "https://api.gbif.org/v1";

interface GbifOccurrence {
  key: number;
  decimalLatitude?: number;
  decimalLongitude?: number;
  year?: number;
  basisOfRecord?: string;
  datasetKey?: string;
  license?: string;
}

/**
 * 04:30 WIB — flagship-species occurrence records from GBIF.
 *
 * These are *occurrence points* ("recorded here"), NOT habitat ranges. Quality
 * gates: georeferenced, no geospatial issue. Provenance (basisOfRecord,
 * dataset, license) is stored per record so the UI can disclose exactly where
 * each point came from — many are research-grade community observations.
 */
@Injectable()
export class SpeciesService implements OnModuleInit {
  static readonly JOB = "species";
  private readonly logger = new Logger(SpeciesService.name);
  private static readonly PAGE = 300;

  constructor(
    @InjectModel(Species.name) private speciesModel: Model<SpeciesDocument>,
    @InjectModel(SpeciesOccurrence.name)
    private occModel: Model<SpeciesOccurrenceDocument>,
    private readonly locks: JobLockService,
    private readonly archiver: ArchiverService,
    private readonly http: HttpService,
    private readonly registry: JobRegistryService,
  ) {}

  onModuleInit() {
    this.registry.register(SpeciesService.JOB, () => this.run());
  }

  @Cron("0 30 4 * * *", { timeZone: "Asia/Jakarta" })
  async cron() {
    if (!cronEnabled()) return;
    await this.run();
  }

  async run(): Promise<void> {
    await this.locks.withLock(SpeciesService.JOB, async () => {
      // 1) seed/refresh the curated species reference list
      for (const s of FLAGSHIP_SPECIES) {
        await this.speciesModel.updateOne(
          { slug: s.slug },
          {
            $set: {
              scientificName: s.scientificName,
              commonNameId: s.commonNameId,
              commonNameEn: s.commonNameEn,
              iucnStatus: s.iucnStatus,
              iucnAssessmentUrl: s.iucnAssessmentUrl,
              gbifTaxonKey: s.gbifTaxonKey,
              habitatEcoregions: s.habitatEcoregions,
              islandGroup: s.islandGroup,
            },
          },
          { upsert: true },
        );
      }

      // 2) ingest occurrences per species
      const retrievedAt = new Date();
      let upserted = 0;
      let fetched = 0;

      for (const s of FLAGSHIP_SPECIES) {
        let offset = 0;
        for (;;) {
          let occ: GbifOccurrence[];
          try {
            const res = await this.http.get<{
              results: GbifOccurrence[];
              endOfRecords: boolean;
            }>(`${GBIF_BASE}/occurrence/search`, {
              params: {
                taxon_key: s.gbifTaxonKey,
                country: "ID",
                hasCoordinate: true,
                hasGeospatialIssue: false,
                limit: SpeciesService.PAGE,
                offset,
              },
            });
            occ = res.results ?? [];
            if (occ.length > 0) {
              await this.archiver.archiveRaw(
                SpeciesService.JOB,
                `${s.slug}-offset-${offset}.json`,
                JSON.stringify(occ),
              );
            }
            offset += SpeciesService.PAGE;
            fetched += occ.length;
            if (occ.length === 0 || res.endOfRecords) {
              await this.upsertBatch(s, occ, retrievedAt).then(
                (n) => (upserted += n),
              );
              break;
            }
            upserted += await this.upsertBatch(s, occ, retrievedAt);
          } catch (err) {
            this.logger.error(`${s.slug} GBIF fetch failed: ${err}`);
            break;
          }
        }
      }

      return { stats: { species: FLAGSHIP_SPECIES.length, fetched, upserted } };
    });
  }

  private async upsertBatch(
    s: (typeof FLAGSHIP_SPECIES)[number],
    occ: GbifOccurrence[],
    retrievedAt: Date,
  ): Promise<number> {
    const ops = occ
      .filter(
        (o) =>
          typeof o.decimalLatitude === "number" &&
          typeof o.decimalLongitude === "number" &&
          !(o.decimalLatitude === 0 && o.decimalLongitude === 0),
      )
      .map((o) => ({
        updateOne: {
          filter: { gbifId: String(o.key) },
          update: {
            $set: {
              speciesSlug: s.slug,
              scientificName: s.scientificName,
              iucnStatus: s.iucnStatus,
              geom: {
                type: "Point" as const,
                coordinates: [o.decimalLongitude, o.decimalLatitude] as [
                  number,
                  number,
                ],
              },
              year: o.year ?? null,
              basisOfRecord: o.basisOfRecord ?? "",
              datasetKey: o.datasetKey ?? "",
              license: o.license ?? "",
              sourceUrl: `https://www.gbif.org/occurrence/${o.key}`,
              retrievedAt,
            },
          },
          upsert: true,
        },
      }));
    if (ops.length === 0) return 0;
    const res = await this.occModel.bulkWrite(ops as never[], {
      ordered: false,
    });
    return res.upsertedCount;
  }
}
