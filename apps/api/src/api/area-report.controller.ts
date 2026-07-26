import {
  Controller,
  Get,
  NotFoundException,
  Param,
  UseInterceptors,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { area as turfArea, feature, featureCollection, intersect } from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import {
  Alert,
  AlertDocument,
  Concession,
  ConcessionDocument,
  Disaster,
  DisasterDocument,
  ForestLossAnnual,
  ForestLossAnnualDocument,
  ProtectedArea,
  ProtectedAreaDocument,
  Region,
  RegionDocument,
  Wetland,
  WetlandDocument,
} from "../common/schemas";
import { CacheHeaderInterceptor } from "./cache.interceptor";

type Poly = Polygon | MultiPolygon;

/**
 * Professional, citable Area Report for an administrative region (kabupaten /
 * province). Everything is a DERIVED AGGREGATE (hectares, counts) from open
 * datasets — never a redistribution of raw source geometry — carrying source +
 * vintage + a neutral, UU-ITE-safe disclaimer so NGOs / journalists /
 * researchers can cite it. Company names are intentionally omitted.
 */

const SOURCES = {
  forestLoss: {
    name: "Hansen/UMD tree cover loss (via Global Forest Watch)",
    url: "https://www.globalforestwatch.org/",
    license: "CC BY 4.0",
  },
  protected: {
    name: "Protected Planet (WDPA) + KLHK PIPPIB",
    url: "https://www.protectedplanet.net/",
    license: "Display only — no raw redistribution",
  },
  concessions: {
    name: "Concession footprints (Nusantara Atlas / Trase / Maus mining)",
    url: "https://nusantara-atlas.org/",
    license: "See per-source terms",
  },
  mangrove: {
    name: "Global Mangrove Watch v3",
    url: "https://www.globalmangrovewatch.org/",
    license: "CC BY 4.0",
  },
  peatland: {
    name: "Indonesia peat lands (Global Forest Watch)",
    url: "https://www.globalforestwatch.org/",
    license: "Display only",
  },
} as const;

const DISCLAIMER = {
  id: "Laporan ini menyajikan ringkasan berdasarkan data publik dari berbagai penyedia. Hasil merupakan agregasi spasial dan tidak dimaksudkan sebagai penetapan fakta, penyebab, pelanggaran, maupun tanggung jawab pihak tertentu. Seluruh data memiliki keterbatasan dan dapat berubah sesuai pembaruan dari penyedia data. Verifikasi lebih lanjut diperlukan sebelum digunakan sebagai dasar pengambilan keputusan.",
  en: "This report presents a summary based on public data from various providers. The results are spatial aggregations and are not intended as a determination of fact, cause, violation, or the responsibility of any party. All data carry limitations and may change as providers update them. Further verification is required before use as a basis for decision-making.",
};

@Controller("area-report")
@UseInterceptors(CacheHeaderInterceptor)
export class AreaReportController {
  constructor(
    @InjectModel(Region.name) private regionModel: Model<RegionDocument>,
    @InjectModel(ForestLossAnnual.name)
    private lossModel: Model<ForestLossAnnualDocument>,
    @InjectModel(Alert.name) private alertModel: Model<AlertDocument>,
    @InjectModel(Disaster.name) private disasterModel: Model<DisasterDocument>,
    @InjectModel(Concession.name)
    private concessionModel: Model<ConcessionDocument>,
    @InjectModel(ProtectedArea.name)
    private protectedModel: Model<ProtectedAreaDocument>,
    @InjectModel(Wetland.name) private wetlandModel: Model<WetlandDocument>,
  ) {}

  @Get(":idOrSlug")
  async report(@Param("idOrSlug") idOrSlug: string) {
    const region = await this.regionModel.findOne(
      /^[0-9a-f]{24}$/.test(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug },
    );
    if (!region) throw new NotFoundException();

    // precise total area from the full geometry
    const areaHa = Math.round(
      turfArea(feature(region.geom as unknown as Poly)) / 10_000,
    );
    // overlap intersections run against the SIMPLIFIED boundary — provinces have
    // huge geometries and the aggregate hectares barely move, but it's an order
    // of magnitude faster than intersecting the full outline per feature
    const overlapFeat = feature(
      (region.geomSimplified ?? region.geom) as unknown as Poly,
    );

    const [lossRows, protectedByKind, concessionByType, wetlandByKind] =
      await Promise.all([
        // loss is stored per region AND per kabupaten by gfw-annual, so a
        // province's OWN record already holds the full total — summing children
        // would double-count.
        this.lossModel.find({ regionId: region._id }).lean(),
        this.overlapByCategory(overlapFeat, this.protectedModel, "kind"),
        this.overlapByCategory(overlapFeat, this.concessionModel, "type"),
        this.overlapByCategory(overlapFeat, this.wetlandModel, "kind"),
      ]);

    // forest loss: sum by year across region (+ children)
    const byYearMap = new Map<number, { lossHa: number; primaryLossHa: number }>();
    for (const r of lossRows as { year: number; lossHa?: number; primaryLossHa?: number }[]) {
      const cur = byYearMap.get(r.year) ?? { lossHa: 0, primaryLossHa: 0 };
      cur.lossHa += r.lossHa ?? 0;
      cur.primaryLossHa += r.primaryLossHa ?? 0;
      byYearMap.set(r.year, cur);
    }
    const byYear = [...byYearMap.entries()]
      .map(([year, v]) => ({
        year,
        lossHa: Math.round(v.lossHa),
        primaryLossHa: Math.round(v.primaryLossHa),
      }))
      .sort((a, b) => a.year - b.year);
    const totalLossHa = byYear.reduce((s, y) => s + y.lossHa, 0);
    const peak = byYear.reduce<{ year: number; lossHa: number } | null>(
      (m, y) => (y.lossHa > (m?.lossHa ?? -1) ? y : m),
      null,
    );
    const years = byYear.length
      ? `${byYear[0].year}–${byYear[byYear.length - 1].year}`
      : "";

    // mining (Maus satellite footprint) is excluded from the report
    delete concessionByType.mining;

    const totals = (o: Record<string, { ha: number; count: number }>) => ({
      totalHa: Math.round(Object.values(o).reduce((s, v) => s + v.ha, 0)),
      totalCount: Object.values(o).reduce((s, v) => s + v.count, 0),
    });

    return {
      meta: {
        reportId: `AR-${region.slug}-${new Date()
          .toISOString()
          .slice(0, 10)
          .replace(/-/g, "")}`,
        generatedAt: new Date().toISOString(),
        area: {
          name: region.name,
          nameEn: region.nameEn,
          type: region.level,
          slug: region.slug,
        },
        areaHa,
        attribution: "Mandum Rimba (mandumrimba.org)",
        methodologyUrl: "/metodologi",
        // lightweight boundary outline for drawing a locator map in the report
        outline: (region.geomSimplified ?? region.geom) as unknown as Poly,
        disclaimer: DISCLAIMER,
      },
      metrics: {
        forestLoss: {
          totalHa: totalLossHa,
          primaryHa: byYear.reduce((s, y) => s + y.primaryLossHa, 0),
          peakYear: peak?.year ?? null,
          years,
          byYear,
          source: SOURCES.forestLoss,
        },
        protectedAreas: {
          overlapHaByKind: protectedByKind,
          ...totals(protectedByKind),
          note: "Luas irisan area dengan kawasan lindung / moratorium.",
          source: SOURCES.protected,
        },
        concessions: {
          overlapHaByType: concessionByType,
          ...totals(concessionByType),
          note: "Ringkasan luas per jenis konsesi dalam wilayah. Nama pemegang konsesi tidak ditampilkan.",
          source: SOURCES.concessions,
        },
        wetlands: {
          overlapHaByKind: wetlandByKind,
          ...totals(wetlandByKind),
          note: "Luas gambut / mangrove dalam area.",
          sources: { mangrove: SOURCES.mangrove, peatland: SOURCES.peatland },
        },
      },
    };
  }

  /**
   * Exact overlap area (ha) between the region and every feature of a layer,
   * grouped by a category field. Uses $geoIntersects to shortlist candidates,
   * then turf to measure the true intersection (so a feature straddling the
   * border isn't counted whole). Capped for latency — precompute nightly later.
   */
  private async overlapByCategory(
    regionFeat: Feature<Poly>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: Model<any>,
    catField: string,
  ): Promise<Record<string, { ha: number; count: number }>> {
    const feats = await model
      .find({ geom: { $geoIntersects: { $geometry: regionFeat.geometry } } })
      .select(`geom ${catField}`)
      .limit(4000)
      .lean();
    const out: Record<string, { ha: number; count: number }> = {};
    for (const f of feats as Record<string, unknown>[]) {
      const cat = String(f[catField] ?? "other");
      let ha = 0;
      try {
        const inter = intersect(
          featureCollection([regionFeat, feature(f.geom as Poly)]),
        );
        if (inter) ha = turfArea(inter) / 10_000;
      } catch {
        /* skip degenerate geometry */
      }
      const cur = out[cat] ?? { ha: 0, count: 0 };
      cur.ha += ha;
      if (ha > 0) cur.count += 1;
      out[cat] = cur;
    }
    for (const k of Object.keys(out)) out[k].ha = Math.round(out[k].ha);
    return out;
  }
}
