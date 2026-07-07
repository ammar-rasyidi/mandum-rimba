"""
Drop corrupt occurrence points that fall in the open sea (a land plant plotted
offshore is a georeferencing error, e.g. jambu bol north of Pulau Weh), using a
Natural Earth land mask with a ~4 km coastal tolerance so legitimate shore /
small-island / mangrove records are kept. Then recompute the affected species
(recordCount, bbox, rangeGeom) and drop any species left with no points.

Run once to clean the existing DB; the same mask is applied during ingest so it
doesn't recur.
"""
import json, os
from collections import defaultdict
import pymongo
from shapely.geometry import shape, Point, box
from shapely.ops import unary_union
from shapely.prepared import prep

MONGO = "mongodb://localhost:27017/forestwatch"
HERE = os.path.dirname(os.path.abspath(__file__))
LAND = os.path.join(HERE, "ne_10m_land.geojson")
BUFFER_DEG = 0.04  # ~4 km coastal tolerance

print("building land mask...", flush=True)
gj = json.load(open(LAND))
land = unary_union([shape(f["geometry"]) for f in gj["features"]])
land_id = land.intersection(box(94, -12, 142, 7))  # clip to Indonesia
mask = prep(land_id.buffer(BUFFER_DEG))

cli = pymongo.MongoClient(MONGO)
db = cli.get_default_database()

def hull(coords):
    from shapely.geometry import MultiPoint
    return MultiPoint(coords).convex_hull.buffer(0.12).__geo_interface__

keep = defaultdict(list)
drop_ids = []
n = 0
for o in db.occurrences.find({}, {"geom": 1, "speciesKey": 1}):
    lon, lat = o["geom"]["coordinates"]
    n += 1
    if mask.contains(Point(lon, lat)):
        keep[o["speciesKey"]].append((lon, lat))
    else:
        drop_ids.append(o["_id"])
print(f"checked {n} points -> {len(drop_ids)} in open sea (dropping)", flush=True)

for i in range(0, len(drop_ids), 5000):
    db.occurrences.delete_many({"_id": {"$in": drop_ids[i:i + 5000]}})

dropped_species = 0
updated = 0
for sp in db.species.find({}, {"_id": 1}):
    coords = keep.get(sp["_id"], [])
    if not coords:
        db.species.delete_one({"_id": sp["_id"]})
        dropped_species += 1
        continue
    xs = [c[0] for c in coords]
    ys = [c[1] for c in coords]
    db.species.update_one(
        {"_id": sp["_id"]},
        {"$set": {
            "recordCount": len(coords),
            "bbox": [min(xs), min(ys), max(xs), max(ys)],
            "rangeGeom": hull(coords),
        }},
    )
    updated += 1

print(f"DONE: dropped {len(drop_ids)} ocean points; "
      f"{dropped_species} species removed (no land points), {updated} updated. "
      f"Now {db.occurrences.count_documents({})} occurrences, "
      f"{db.species.count_documents({})} species.", flush=True)
