import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { JobLockService } from "../common/job-lock.service";
import { HttpService } from "../common/http.service";
import { ArchiverService } from "../common/archiver.service";
import {
  JobRegistryService,
  cronEnabled,
} from "../common/job-registry.service";
import { onLand } from "./util/land-mask";

const GBIF = "https://api.gbif.org/v1";
const PAGE = 300;
const OFFSET_CAP = 100_000; // GBIF search API hard limit on offset
const KINGDOM_PLANTAE = 6;
const R2_PREFIX = "species";
const POINTS_PER_SPECIES = 1500; // cap stored points per species (bounds memory + file size)
const SAMPLE_PER_SPECIES = 3; // points per species in the diversity overview
const UPLOAD_BATCH = 40; // concurrent per-species uploads

// Coordinate obscuring (poaching/collection safety). Normal taxa are snapped to
// ~1 km; SENSITIVE taxa (heavily collected / poached) are coarsened to ~22 km so
// only a rough region shows, never an exact spot — matching IUCN/GBIF practice.
const SNAP_NORMAL = 0.01; // ~1.1 km
const SNAP_SENSITIVE = 0.2; // ~22 km
const SENSITIVE_FAMILIES = new Set([
  "Orchidaceae", // wild orchids (Paphiopedilum, etc.)
  "Nepenthaceae", // pitcher plants
  "Rafflesiaceae", // Rafflesia
  "Thymelaeaceae", // agarwood (Aquilaria, Gyrinops)
  "Cycadaceae", // cycads
  "Zamiaceae", // cycads
]);
const SENSITIVE_GENERA = new Set([
  "Amorphophallus", // titan arum / corpse flower (in Araceae)
]);
const snap = (v: number, step: number) =>
  Math.round((Math.round(v / step) * step) * 1e4) / 1e4;

interface GbifOcc {
  key?: number;
  speciesKey?: number;
  scientificName?: string;
  species?: string;
  family?: string;
  familyKey?: number;
  genus?: string;
  genusKey?: number;
  decimalLatitude?: number;
  decimalLongitude?: number;
  year?: number;
  basisOfRecord?: string;
  datasetKey?: string;
}

interface PointRec {
  lon: number;
  lat: number;
  dataset: string;
  year: number;
  basis: string;
  gbifKey: number;
}

interface SpeciesAcc {
  sci: string;
  canonical: string;
  family: string;
  genus: string;
  sensitive: boolean; // collection/poaching-target → coarsened coordinates
  count: number; // true record count (uncapped)
  points: PointRec[]; // capped at POINTS_PER_SPECIES
}

/**
 * Self-hosted species atlas builder. Pulls ALL georeferenced Indonesian PLANT
 * occurrences from GBIF (CC-BY) and writes STATIC files to Cloudflare R2, so the
 * /biodiversitas map is served straight from R2 (free, CDN-fast) with no live
 * database. Photo / description / IUCN are fetched client-side (GBIF + Wikipedia
 * allow browser CORS), so the build only bakes what search needs.
 *
 * R2 output (under `species/`):
 *   index.json        all species {k,c,s,v,f,i,n} — client-side search + family filter
 *   points.geojson    sampled points (props k,f,c) — the diversity overview
 *   sp/<key>.json      per-species profile + full points — fetched on click
 *
 * Coverage trick: GBIF's search API caps `offset` at 100k, far below the ~557k
 * plant records for Indonesia. We PARTITION BY FAMILY (and by genus for big
 * families) so every slice pages cleanly — no login-gated bulk Download API.
 * Corrupt open-sea points are dropped via the land mask.
 */
@Injectable()
export class GbifOccurrencesService implements OnModuleInit {
  static readonly JOB = "gbif-occurrences";
  private readonly logger = new Logger(GbifOccurrencesService.name);

  constructor(
    private readonly locks: JobLockService,
    private readonly http: HttpService,
    private readonly archiver: ArchiverService,
    private readonly registry: JobRegistryService,
  ) {}

  onModuleInit() {
    this.registry.register(GbifOccurrencesService.JOB, () => this.run());
  }

  // monthly on the 3rd, 04:00 WIB (Modal owns the real schedule; inert unless CRON_ENABLED)
  @Cron("0 0 4 3 * *", { timeZone: "Asia/Jakarta" })
  async cron() {
    if (!cronEnabled()) return;
    await this.run();
  }

  async run(): Promise<void> {
    await this.locks.withLock(GbifOccurrencesService.JOB, async () => {
      const acc = new Map<number, SpeciesAcc>();
      let occInserted = 0;

      // accumulate in memory (no DB); build R2 files at the end
      const flush = (rows: GbifOcc[]) => {
        for (const r of rows) {
          const sk = r.speciesKey;
          const lo = r.decimalLongitude;
          const la = r.decimalLatitude;
          if (sk == null || lo == null || la == null) continue;
          // land test on the true coordinate, before obscuring
          if (!onLand(Math.round(lo * 1e5) / 1e5, Math.round(la * 1e5) / 1e5))
            continue;
          let s = acc.get(sk);
          if (!s) {
            const family = r.family ?? "";
            const genus = r.genus ?? "";
            s = {
              sci: r.scientificName ?? "",
              canonical: r.species ?? r.scientificName ?? "",
              family,
              genus,
              sensitive:
                SENSITIVE_FAMILIES.has(family) || SENSITIVE_GENERA.has(genus),
              count: 0,
              points: [],
            };
            acc.set(sk, s);
          }
          s.count += 1;
          occInserted += 1;
          // obscure the DISPLAY coordinate: ~1 km normally, ~22 km for sensitive
          const step = s.sensitive ? SNAP_SENSITIVE : SNAP_NORMAL;
          if (s.points.length < POINTS_PER_SPECIES)
            s.points.push({
              lon: snap(lo, step),
              lat: snap(la, step),
              dataset: r.datasetKey ?? "",
              year: r.year ?? 0,
              basis: r.basisOfRecord ?? "",
              gbifKey: r.key ?? 0,
            });
        }
      };

      // page one query (country=ID, plants, georeferenced) with extra params
      const page = async (extra: string): Promise<number> => {
        let offset = 0;
        let seen = 0;
        for (;;) {
          const url =
            `${GBIF}/occurrence/search?country=ID&kingdomKey=${KINGDOM_PLANTAE}` +
            `&hasCoordinate=true&hasGeospatialIssue=false&limit=${PAGE}` +
            `&offset=${offset}${extra}`;
          const res = await this.http.get<{
            results?: GbifOcc[];
            endOfRecords?: boolean;
            count?: number;
          }>(url);
          const rows = res.results ?? [];
          if (!rows.length) break;
          await flush(rows);
          seen += rows.length;
          offset += PAGE;
          if (res.endOfRecords || offset >= OFFSET_CAP) break;
        }
        return seen;
      };

      // 1) enumerate plant families with Indonesian records
      const families = await this.facet("familyKey");
      this.logger.log(`plant families with ID records: ${families.length}`);

      // 2) page each family — but split big families by genus PROACTIVELY so no
      //    single query pages to a deep offset. GBIF deep pagination (offset
      //    >~15k) is slow and drops connections ("socket hang up"); keeping every
      //    slice small avoids that. Each slice is isolated so one failure never
      //    kills the (long) run.
      const SPLIT_ABOVE = 12000;
      let famDone = 0;
      for (const fam of families) {
        try {
          if (fam.count > SPLIT_ABOVE) {
            const genera = await this.facet("genusKey", `&familyKey=${fam.key}`);
            for (const g of genera) {
              try {
                await page(`&genusKey=${g.key}`);
              } catch (e) {
                this.logger.warn(`genus ${g.key} failed, skipping: ${e}`);
              }
            }
          } else {
            await page(`&familyKey=${fam.key}`);
          }
        } catch (e) {
          this.logger.warn(`family ${fam.key} failed, skipping: ${e}`);
        }
        if (++famDone % 25 === 0)
          this.logger.log(
            `families ${famDone}/${families.length}, ${occInserted} occurrences so far`,
          );
      }

      // 3) common names — baked into the index so the atlas is searchable by
      //    regular names, not just Latin (photo/description/IUCN are client-side).
      const keys = [...acc.keys()];
      const vern = await this.vernaculars(keys);

      // 4) build the search index + the sampled diversity points
      const index: Record<string, unknown>[] = [];
      const sample: unknown[] = [];
      for (const [sk, s] of acc) {
        const v = vern.get(sk) ?? { id: "", en: "" };
        index.push({
          k: sk,
          c: s.canonical,
          s: s.sci,
          v: v.id || v.en || "",
          f: s.family,
          i: "",
          n: s.count,
          x: s.sensitive ? 1 : 0,
        });
        for (const p of s.points.slice(0, SAMPLE_PER_SPECIES))
          sample.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: [p.lon, p.lat] },
            properties: { k: sk, f: s.family, c: s.canonical, x: s.sensitive ? 1 : 0 },
          });
      }
      await this.archiver.putGzipJson(`${R2_PREFIX}/index.json`, index);
      await this.archiver.putGzipJson(
        `${R2_PREFIX}/points.geojson`,
        { type: "FeatureCollection", features: sample },
        "application/geo+json",
      );
      this.logger.log(
        `R2: index (${index.length} species) + points (${sample.length})`,
      );

      // 5) per-species profile + full points, uploaded concurrently
      const entries = [...acc.entries()];
      for (let i = 0; i < entries.length; i += UPLOAD_BATCH) {
        await Promise.all(
          entries.slice(i, i + UPLOAD_BATCH).map(([sk, s]) => {
            const xs = s.points.map((p) => p.lon);
            const ys = s.points.map((p) => p.lat);
            const doc = {
              species: {
                key: sk,
                sci: s.sci,
                canonical: s.canonical,
                family: s.family,
                genus: s.genus,
                kingdom: "Plantae",
                recordCount: s.count,
                sensitive: s.sensitive,
                bbox: xs.length
                  ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
                  : null,
              },
              points: {
                type: "FeatureCollection",
                features: s.points.map((p) => ({
                  type: "Feature",
                  geometry: { type: "Point", coordinates: [p.lon, p.lat] },
                  properties: {
                    dataset: p.dataset,
                    year: p.year,
                    basis: p.basis,
                    gbifKey: p.gbifKey,
                  },
                })),
              },
            };
            return this.archiver.putGzipJson(`${R2_PREFIX}/sp/${sk}.json`, doc);
          }),
        );
        if ((i / UPLOAD_BATCH) % 25 === 0)
          this.logger.log(`per-species ${i}/${entries.length} uploaded`);
      }

      this.logger.log(
        `DONE: ${occInserted} occurrences across ${acc.size} species → R2`,
      );
      return { stats: { occurrences: occInserted, species: acc.size } };
    });
  }

  /** Fetch common (vernacular) names for many species, concurrently (bypasses
   *  the 1s HTTP politeness delay — too slow for tens of thousands of species —
   *  using small parallel batches). Best-effort: failures just yield no names. */
  private async vernaculars(
    keys: number[],
  ): Promise<Map<number, { id: string; en: string; all: string[] }>> {
    const out = new Map<number, { id: string; en: string; all: string[] }>();
    const BATCH = 25;
    for (let i = 0; i < keys.length; i += BATCH) {
      const batch = keys.slice(i, i + BATCH);
      await Promise.all(
        batch.map(async (key) => {
          try {
            const res = await fetch(
              `${GBIF}/species/${key}/vernacularNames?limit=100`,
            );
            if (!res.ok) return;
            const json = (await res.json()) as {
              results?: { vernacularName?: string; language?: string }[];
            };
            let id = "";
            let en = "";
            const all: string[] = [];
            for (const v of json.results ?? []) {
              const nm = (v.vernacularName ?? "").trim();
              if (!nm) continue;
              const lang = (v.language ?? "").toLowerCase();
              all.push(nm);
              if ((lang === "ind" || lang === "id") && !id) id = nm;
              if ((lang === "eng" || lang === "en") && !en) en = nm;
            }
            out.set(key, { id, en, all });
          } catch {
            /* best-effort */
          }
        }),
      );
    }
    return out;
  }

  /** Enumerate facet buckets (familyKey / genusKey) with their record counts. */
  private async facet(
    field: string,
    extra = "",
  ): Promise<{ key: number; count: number }[]> {
    const url =
      `${GBIF}/occurrence/search?country=ID&kingdomKey=${KINGDOM_PLANTAE}` +
      `&hasCoordinate=true&hasGeospatialIssue=false&limit=0` +
      `&facet=${field}&facetLimit=1200${extra}`;
    const res = await this.http.get<{
      facets?: { field: string; counts?: { name: string; count: number }[] }[];
    }>(url);
    const counts = res.facets?.[0]?.counts ?? [];
    return counts
      .map((c) => ({ key: Number(c.name), count: c.count }))
      .filter((c) => Number.isFinite(c.key));
  }
}
