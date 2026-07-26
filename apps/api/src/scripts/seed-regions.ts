/**
 * Seed regions from GADM 4.1 (license: free for academic & non-commercial
 * use, redistribution prohibited, we store boundaries, we don't re-publish
 * the raw GADM files).
 *
 * Usage:
 *   pnpm seed:regions                  # Aceh province + its kabupaten (Phase 1)
 *   pnpm seed:regions -- --all         # all provinces + kabupaten
 *
 * Requires MONGODB_URI in the environment (.env is honoured).
 */
import "dotenv/config";
import axios from "axios";
import AdmZip from "adm-zip";
import mongoose from "mongoose";
import * as turf from "@turf/turf";
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
  Position,
} from "geojson";

const GADM_BASE = "https://geodata.ucdavis.edu/gadm/gadm4.1/json";

// BPS island groupings, keyed by GADM NAME_1
const ISLAND_GROUPS: Record<string, string> = {
  Aceh: "Sumatera",
  "Sumatera Utara": "Sumatera",
  "Sumatera Barat": "Sumatera",
  Riau: "Sumatera",
  Jambi: "Sumatera",
  "Sumatera Selatan": "Sumatera",
  Bengkulu: "Sumatera",
  Lampung: "Sumatera",
  "Bangka Belitung": "Sumatera",
  "Kepulauan Riau": "Sumatera",
  "Jakarta Raya": "Jawa",
  "Jawa Barat": "Jawa",
  "Jawa Tengah": "Jawa",
  Yogyakarta: "Jawa",
  "Jawa Timur": "Jawa",
  Banten: "Jawa",
  Bali: "Bali & Nusa Tenggara",
  "Nusa Tenggara Barat": "Bali & Nusa Tenggara",
  "Nusa Tenggara Timur": "Bali & Nusa Tenggara",
  "Kalimantan Barat": "Kalimantan",
  "Kalimantan Tengah": "Kalimantan",
  "Kalimantan Selatan": "Kalimantan",
  "Kalimantan Timur": "Kalimantan",
  "Kalimantan Utara": "Kalimantan",
  "Sulawesi Utara": "Sulawesi",
  "Sulawesi Tengah": "Sulawesi",
  "Sulawesi Selatan": "Sulawesi",
  "Sulawesi Tenggara": "Sulawesi",
  Gorontalo: "Sulawesi",
  "Sulawesi Barat": "Sulawesi",
  Maluku: "Maluku",
  "Maluku Utara": "Maluku",
  Papua: "Papua",
  "Papua Barat": "Papua",
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-");
}

async function fetchGadmLevel(level: 1 | 2): Promise<FeatureCollection> {
  const url = `${GADM_BASE}/gadm41_IDN_${level}.json.zip`;
  console.log(`downloading ${url} ...`);
  const res = await axios.get<ArrayBuffer>(url, {
    responseType: "arraybuffer",
    timeout: 600_000,
    headers: { "User-Agent": "MandumRimba/0.1 seed script" },
  });
  const zip = new AdmZip(Buffer.from(res.data));
  const entry = zip
    .getEntries()
    .find((e) => e.entryName.endsWith(".json"));
  if (!entry) throw new Error("no .json entry in GADM zip");
  return JSON.parse(entry.getData().toString("utf-8"));
}

function toMultiPolygon(geom: Polygon | MultiPolygon): MultiPolygon {
  return geom.type === "Polygon"
    ? { type: "MultiPolygon", coordinates: [geom.coordinates] }
    : geom;
}

function simplify(geom: MultiPolygon, tolerance: number): MultiPolygon {
  try {
    return toMultiPolygon(
      turf.simplify(turf.feature(geom), { tolerance, highQuality: false })
        .geometry,
    );
  } catch {
    return geom;
  }
}

/** |area| of a ring in deg² (shoelace) — used to drop zero-area slivers */
function ringArea(ring: Position[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return Math.abs(a / 2);
}

// GADM rings sometimes carry duplicate/collinear vertices and micro-slivers that
// Mongo's 2dsphere index rejects ("Can't extract geo keys", error 16755). Dedupe
// consecutive points, re-close, and drop rings that are degenerate (<4 pts or
// ~zero area, i.e. smaller than ~12 m²).
const MIN_RING_AREA = 1e-9; // deg² ≈ 12 m²
function cleanRing(ring: Position[]): Position[] | null {
  const pts: Position[] = [];
  for (const p of ring) {
    const last = pts[pts.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push([p[0], p[1]]);
  }
  const first = pts[0];
  const end = pts[pts.length - 1];
  if (first && end && (first[0] !== end[0] || first[1] !== end[1]))
    pts.push([first[0], first[1]]);
  if (pts.length < 4 || ringArea(pts) < MIN_RING_AREA) return null;
  return pts;
}

function cleanMultiPolygon(geom: MultiPolygon): MultiPolygon {
  const out: Position[][][] = [];
  for (const poly of geom.coordinates) {
    const outer = cleanRing(poly[0]);
    if (!outer) continue; // drop degenerate polygon
    const rings: Position[][] = [outer];
    for (let i = 1; i < poly.length; i++) {
      const hole = cleanRing(poly[i]);
      if (hole) rings.push(hole);
    }
    out.push(rings);
  }
  // split any self-intersections that survive (2dsphere is strict about them)
  try {
    // unkinkPolygon returns a FeatureCollection of Polygons only
    const fixed = turf.unkinkPolygon(turf.multiPolygon(out));
    const polys = fixed.features.map((f) => f.geometry.coordinates);
    if (polys.length) return { type: "MultiPolygon", coordinates: polys };
  } catch {
    /* fall back to the ring-cleaned version */
  }
  return { type: "MultiPolygon", coordinates: out };
}

async function main() {
  const all = process.argv.includes("--all");
  const uri = process.env.MONGODB_URI ?? "mongodb://localhost:27017/forestwatch";
  await mongoose.connect(uri);
  const regions = mongoose.connection.collection("regions");

  await regions.createIndex({ geom: "2dsphere" });
  await regions.createIndex({ slug: 1 }, { unique: true });

  // --- provinces (level 1) ---
  const provincesFc = await fetchGadmLevel(1);
  const wantedProvinces = all
    ? provincesFc.features
    : provincesFc.features.filter(
        (f) => (f.properties as Record<string, string>).NAME_1 === "Aceh",
      );

  const provinceIds = new Map<string, mongoose.Types.ObjectId>();
  for (const f of wantedProvinces) {
    const props = f.properties as Record<string, string>;
    const name = props.NAME_1;
    const geom = cleanMultiPolygon(
      toMultiPolygon(f.geometry as Polygon | MultiPolygon),
    );
    const doc = {
      slug: slugify(name),
      name,
      nameEn: name,
      level: "province",
      parentId: null,
      islandGroup: ISLAND_GROUPS[name] ?? "",
      geom,
      geomSimplified: simplify(geom, 0.01),
    };
    try {
      const res = await regions.findOneAndUpdate(
        { slug: doc.slug },
        { $set: doc },
        { upsert: true, returnDocument: "after" },
      );
      provinceIds.set(name, res!._id as mongoose.Types.ObjectId);
      console.log(`province upserted: ${name}`);
    } catch (e) {
      console.warn(`province SKIPPED (${name}): ${(e as Error).message?.slice(0, 90)}`);
    }
  }

  // --- kabupaten (level 2) ---
  const kabFc = await fetchGadmLevel(2);
  let kabCount = 0;
  for (const f of kabFc.features) {
    const props = f.properties as Record<string, string>;
    const parentId = provinceIds.get(props.NAME_1);
    if (!parentId) continue; // not a seeded province
    const name = props.NAME_2;
    const geom = cleanMultiPolygon(
      toMultiPolygon(f.geometry as Polygon | MultiPolygon),
    );
    try {
      await regions.updateOne(
        { slug: slugify(`${props.NAME_1}-${name}`) },
        {
          $set: {
            slug: slugify(`${props.NAME_1}-${name}`),
            name,
            nameEn: name,
            level: "kabupaten",
            parentId,
            islandGroup: ISLAND_GROUPS[props.NAME_1] ?? "",
            geom,
            geomSimplified: simplify(geom, 0.005),
          },
        },
        { upsert: true },
      );
      kabCount++;
    } catch (e) {
      console.warn(`kabupaten SKIPPED (${props.NAME_1}/${name}): ${(e as Error).message?.slice(0, 80)}`);
    }
  }
  console.log(
    `done: ${wantedProvinces.length} province(s), ${kabCount} kabupaten`,
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
