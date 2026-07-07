"""
Local dev ingest (robust): populate the `forestwatch` MongoDB with real GBIF
flora occurrences in the production schema, so the /species API + search-driven
map work end-to-end locally. Public GBIF search API (no login).

Robust vs the first cut: inserts occurrences incrementally per page and retries
transient network errors, so a single timeout can't wipe the run. Also pulls the
curated iconic species explicitly first, so the headline demo (Rafflesia
arnoldii, etc.) always has data regardless of GBIF's page order.

PRODUCTION uses the bulk Download API for the full ~557k (gbif-occurrences
service); this script is for local dev/verification.
"""
import json, os, sys, time, urllib.request, urllib.parse
from collections import defaultdict
import pymongo
from shapely.geometry import MultiPoint, Point, box, shape
from shapely.ops import unary_union
from shapely.prepared import prep

MONGO = "mongodb://localhost:27017/forestwatch"
BULK_TARGET = int(sys.argv[1]) if len(sys.argv) > 1 else 20000
PAGE = 300
HERE = os.path.dirname(os.path.abspath(__file__))
FLORA_CATALOG = os.path.abspath(
    os.path.join(HERE, "..", "..", "apps", "web", "src", "data", "flora-species.json")
)

# land mask: drop corrupt occurrence points that fall in the open sea
_LAND = os.path.join(HERE, "ne_10m_land.geojson")
_gj = json.load(open(_LAND))
_land = unary_union([shape(f["geometry"]) for f in _gj["features"]])
LAND_MASK = prep(_land.intersection(box(94, -12, 142, 7)).buffer(0.04))

def on_land(lo, la):
    return LAND_MASK.contains(Point(lo, la))

def get(url, retries=6):
    last = None
    for i in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001 transient network
            last = e
            time.sleep(1.5 * (i + 1))
    raise last

cli = pymongo.MongoClient(MONGO)
db = cli.get_default_database()
db.occurrences.drop(); db.species.drop()

# accumulate per-species metadata + coords as we stream pages in
meta = {}                     # speciesKey -> {sci,canonical,family,genus}
coords = defaultdict(list)    # speciesKey -> [(lon,lat)]
inserted = 0

def ingest_rows(rows):
    global inserted
    batch = []
    for r in rows:
        sk = r.get("speciesKey")
        lo, la = r.get("decimalLongitude"), r.get("decimalLatitude")
        if sk is None or lo is None or la is None:
            continue
        sk = int(sk); lo = round(lo, 5); la = round(la, 5)
        if not on_land(lo, la):  # drop corrupt open-sea points
            continue
        batch.append({
            "speciesKey": sk,
            "geom": {"type": "Point", "coordinates": [lo, la]},
            "dataset": r.get("datasetKey", ""),
            "year": r.get("year") or 0,
            "basis": r.get("basisOfRecord", ""),
            "gbifKey": int(r.get("key", 0)),
        })
        coords[sk].append((lo, la))
        if sk not in meta:
            meta[sk] = {
                "sci": r.get("scientificName", ""),
                "canonical": r.get("species", "") or r.get("scientificName", ""),
                "family": r.get("family", ""),
                "genus": r.get("genus", ""),
            }
    if batch:
        db.occurrences.insert_many(batch)
        inserted += len(batch)

def pull_taxon(taxon_key, cap=400):
    off = 0; got = 0
    while got < cap and off < 100000:
        u = ("https://api.gbif.org/v1/occurrence/search?country=ID"
             "&hasCoordinate=true&hasGeospatialIssue=false"
             f"&taxonKey={taxon_key}&limit={PAGE}&offset={off}")
        res = get(u); rows = res.get("results", [])
        if not rows: break
        ingest_rows(rows); got += len(rows); off += PAGE
        if res.get("endOfRecords"): break
        time.sleep(0.1)

# pulls are wrapped so a network timeout STOPS pulling but still proceeds to
# phase 3 (build species from whatever was accumulated) — never a total loss.
try:
    # ---- Phase 1: curated iconic species (guarantee demo coverage) ----
    print("[flora ingest] phase 1: curated iconic species", flush=True)
    cat = json.load(open(FLORA_CATALOG))
    sci_names = []
    for k, v in cat.items():
        if k.startswith("_"): continue
        sci = (v.get("sci") or "").split("(")[0].strip()
        parts = sci.replace(",", " ").split()
        if len(parts) >= 2 and parts[1].lower() != "spp.":
            sci_names.append(f"{parts[0]} {parts[1]}")
        elif parts:
            sci_names.append(parts[0])
    for name in sci_names:
        try:
            m = get("https://api.gbif.org/v1/species/match?name=" + urllib.parse.quote(name))
            key = m.get("usageKey")
            if key:
                pull_taxon(key, cap=400)
                print(f"    {name:26} key={key} -> total occ {inserted}", flush=True)
        except Exception as e:  # noqa: BLE001 skip one bad species, keep going
            print(f"    ! {name}: {e}", flush=True)

    # ---- Phase 2: bulk plant occurrences for broad coverage ----
    print(f"[flora ingest] phase 2: bulk up to {BULK_TARGET}", flush=True)
    off = 0
    while inserted < BULK_TARGET + 8000 and off < 100000:
        u = ("https://api.gbif.org/v1/occurrence/search?country=ID&kingdomKey=6"
             "&hasCoordinate=true&hasGeospatialIssue=false"
             f"&limit={PAGE}&offset={off}")
        res = get(u); rows = res.get("results", [])
        if not rows: break
        ingest_rows(rows); off += PAGE
        if off % 6000 == 0:
            print(f"    bulk offset {off}, total occ {inserted}", flush=True)
        if res.get("endOfRecords"): break
        time.sleep(0.1)
except Exception as e:  # noqa: BLE001 stop pulling, still build what we have
    print(f"[flora ingest] pull interrupted ({e}); building species from "
          f"{inserted} records so far", flush=True)

# ---- Phase 3: build species catalog + derived range hulls ----
print("[flora ingest] phase 3: building species + range hulls", flush=True)
spp_docs = []
for sk, cs in coords.items():
    m = meta[sk]
    hull = MultiPoint(cs).convex_hull.buffer(0.12)
    xs = [c[0] for c in cs]; ys = [c[1] for c in cs]
    spp_docs.append({
        "_id": sk,
        "sci": m["sci"],
        "canonical": m["canonical"],
        "canonicalLower": (m["canonical"] or "").lower(),
        "family": m["family"],
        "genus": m["genus"],
        "kingdom": "Plantae",
        "recordCount": len(cs),
        "bbox": [min(xs), min(ys), max(xs), max(ys)],
        "rangeGeom": hull.__geo_interface__,
    })
for i in range(0, len(spp_docs), 2000):
    db.species.insert_many(spp_docs[i:i+2000])

db.occurrences.create_index("speciesKey")
db.species.create_index("canonicalLower")
db.species.create_index("recordCount")

print(f"[flora ingest] DONE: {db.occurrences.count_documents({})} occurrences, "
      f"{db.species.count_documents({})} species in '{db.name}'", flush=True)
