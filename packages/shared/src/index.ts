import type { MultiPolygon, Point, Polygon } from "geojson";

// ---------------------------------------------------------------------------
// Shared domain types for Mandum Rimba (web ↔ api).
// Every record that came from an external source carries SourceMeta so the
// UI can render a citation in ≤ 2 clicks (editorial principle #2).
// ---------------------------------------------------------------------------

export interface SourceMeta {
  sourceId: string;
  sourceUrl: string;
  retrievedAt: string; // ISO 8601
  license: string;
}

export type RegionLevel = "province" | "kabupaten";

export interface Region {
  _id: string;
  slug: string;
  name: string;
  nameEn: string;
  level: RegionLevel;
  parentId: string | null;
  islandGroup: string;
  geom?: MultiPolygon;
  geomSimplified?: MultiPolygon;
}

export type ConcessionType = "palm_hgu" | "pulp_hti" | "logging" | "mining";

export interface Concession extends SourceMeta {
  _id: string;
  source: string;
  sourceRef: string;
  companyName: string;
  companySlug: string;
  type: ConcessionType;
  commodity: string | null;
  permitStatus: string | null;
  permitYear: number | null;
  areaHa: number;
  geom?: MultiPolygon | Polygon;
}

export interface ForestLossAnnual {
  _id: string;
  regionId: string;
  year: number;
  lossHa: number;
  primaryLossHa: number | null;
  source: string;
}

export type AlertSystem = "radd" | "glad_l" | "glad_s2";

export interface Alert {
  _id: string;
  alertDate: string;
  system: AlertSystem;
  confidence: string;
  geom: Point;
  regionId: string | null;
  insideConcessionId: string | null;
  insideProtected: boolean;
  insideMoratorium: boolean;
}

export type DisasterType = "flood" | "landslide" | "flash_flood" | "other";

export interface Disaster extends SourceMeta {
  _id: string;
  eventDate: string;
  type: DisasterType;
  regionId: string | null;
  deaths: number | null;
  affected: number | null;
  description: string;
  geom: Point | null;
}

export interface Watershed {
  _id: string;
  name: string;
  basinLevel: number;
  geom?: MultiPolygon | Polygon;
}

export type DiscrepancyKind =
  | "clearing_outside_concession"
  | "clearing_in_protected"
  | "clearing_in_moratorium"
  | "flood_downstream_of_loss";

export interface DerivedDiscrepancy {
  _id: string;
  kind: DiscrepancyKind;
  alertCount: number;
  areaHa: number;
  regionId: string;
  concessionId?: string | null;
  watershedId?: string | null;
  periodStart: string;
  periodEnd: string;
  methodologyVersion: string;
  computedAt: string;
}

export interface Company {
  _id: string;
  slug: string;
  name: string;
  sources: SourceMeta[];
  commodities: string[];
  concessionIds: string[];
  lossInsideConcessionsByYear: { year: number; ha: number }[];
  traseLinks: string[];
}

export interface StoryMapState {
  center: [number, number];
  zoom: number;
  pitch?: number;
  bearing?: number;
  layers: string[]; // layer ids toggled on for this section
}

export interface Story {
  _id: string;
  slug: string;
  titleId: string;
  titleEn: string;
  heroBeforeImg: string | null;
  heroAfterImg: string | null;
  mapState: StoryMapState | null;
  publishedAt: string | null;
  sources: SourceMeta[];
}

export type JobStatus = "running" | "success" | "failed" | "skipped";

export interface JobRun {
  _id: string;
  job: string;
  startedAt: string;
  finishedAt: string | null;
  status: JobStatus;
  stats: Record<string, number>;
  error: string | null;
}

export interface PipelineStatus {
  generatedAt: string;
  jobs: {
    job: string;
    lastRunAt: string | null;
    lastStatus: JobStatus | null;
    lastSuccessAt: string | null;
    stats: Record<string, number>;
  }[];
}

export interface RegionSummary {
  region: Region;
  lossByYear: ForestLossAnnual[];
  alertCount90d: number;
  disasterCount: number;
  discrepancies: DerivedDiscrepancy[];
  concessionCount: number;
}
