"""
Export the flora atlas from MongoDB to STATIC files on Cloudflare R2, so the
/biodiversitas map can be served straight from R2 (free, CDN-fast) with no live
database. Reuses whatever the ingest already put in Mongo — no GBIF re-pull.

Produces (under the `species/` prefix on the R2 bucket):
  species/index.json        all species {k,c,s,v,f,i,n} — client-side search + family filter
  species/points.geojson    sampled occurrence points (props k,f,c) — the diversity view
  species/sp/<key>.json      per-species profile + full points — fetched lazily on click

Env (from apps/api/.env): MONGODB_URI, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL.
"""
import gzip, io, json, os, sys
from concurrent.futures import ThreadPoolExecutor
import boto3
import pymongo

MONGO = os.environ["MONGODB_URI"]
BUCKET = os.environ["R2_BUCKET"]
ACCOUNT = os.environ["R2_ACCOUNT_ID"]
PREFIX = "species"
POINTS_PER_SPECIES_SAMPLE = 3      # for the diversity overview (keeps it small)
POINTS_PER_SPECIES_FULL = 1500     # in the per-species file
WORKERS = 16

db = pymongo.MongoClient(MONGO, serverSelectionTimeoutMS=20000).get_default_database()
s3 = boto3.client(
    "s3",
    endpoint_url=f"https://{ACCOUNT}.r2.cloudflarestorage.com",
    aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
    region_name="auto",
)

def put(key, obj, ctype):
    body = gzip.compress(json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode())
    s3.put_object(
        Bucket=BUCKET, Key=key, Body=body,
        ContentType=ctype, ContentEncoding="gzip",
        CacheControl="public, max-age=3600",
    )

def occ_features(species_key, cap):
    feats = []
    for o in db.occurrences.find({"speciesKey": species_key}).limit(cap):
        feats.append({"type": "Feature", "geometry": o["geom"],
                      "properties": {"dataset": o.get("dataset", ""), "year": o.get("year", 0),
                                     "basis": o.get("basis", ""), "gbifKey": o.get("gbifKey", 0)}})
    return feats

def main():
    species = list(db.species.find({}))
    print(f"exporting {len(species)} species...", flush=True)
    if not species:
        print("no species in Mongo yet — run after the ingest finishes.")
        sys.exit(1)

    # 1) search index
    index = [{"k": s["_id"], "c": s.get("canonical", ""), "s": s.get("sci", ""),
              "v": s.get("vernacularId") or s.get("vernacularEn") or "",
              "f": s.get("family", ""), "i": s.get("iucn", ""), "n": s.get("recordCount", 0)}
             for s in species]
    put(f"{PREFIX}/index.json", index, "application/json")
    print(f"  wrote index.json ({len(index)} species)", flush=True)

    # 2) sampled diversity points (props k=key, f=family, c=canonical)
    fam_of = {s["_id"]: (s.get("family", ""), s.get("canonical", "")) for s in species}
    pts = []
    for sk, (fam, canon) in fam_of.items():
        for o in db.occurrences.find({"speciesKey": sk}).limit(POINTS_PER_SPECIES_SAMPLE):
            pts.append({"type": "Feature", "geometry": o["geom"],
                        "properties": {"k": sk, "f": fam, "c": canon}})
    put(f"{PREFIX}/points.geojson", {"type": "FeatureCollection", "features": pts},
        "application/geo+json")
    print(f"  wrote points.geojson ({len(pts)} points)", flush=True)

    # 3) per-species profile + full points (concurrent upload)
    done = [0]
    def one(s):
        sk = s["_id"]
        doc = {
            "species": {
                "key": sk, "sci": s.get("sci", ""), "canonical": s.get("canonical", ""),
                "family": s.get("family", ""), "genus": s.get("genus", ""),
                "kingdom": s.get("kingdom", "Plantae"), "recordCount": s.get("recordCount", 0),
                "bbox": s.get("bbox"), "iucn": (s.get("iucn") or ""),
                "vernacularId": s.get("vernacularId", ""), "vernacularEn": s.get("vernacularEn", ""),
                "image": s.get("image"), "description": s.get("description"),
            },
            "points": {"type": "FeatureCollection", "features": occ_features(sk, POINTS_PER_SPECIES_FULL)},
        }
        put(f"{PREFIX}/sp/{sk}.json", doc, "application/json")
        done[0] += 1
        if done[0] % 1000 == 0:
            print(f"  per-species {done[0]}/{len(species)}", flush=True)

    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        list(ex.map(one, species))

    base = os.environ.get("R2_PUBLIC_BASE_URL", "")
    print(f"\nDONE. Public URLs, e.g.:\n  {base}/{PREFIX}/index.json\n  {base}/{PREFIX}/points.geojson\n  {base}/{PREFIX}/sp/<key>.json")

if __name__ == "__main__":
    main()
