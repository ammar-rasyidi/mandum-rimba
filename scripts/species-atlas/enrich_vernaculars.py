"""
Enrich the `species` collection with common (vernacular) names from GBIF so the
atlas can be searched by regular names, not just scientific ones. For each
species it fetches GBIF vernacularNames, stores the Indonesian + English display
names, and builds a lowercased `search` field = canonical + all vernaculars.

Concurrent (fast) + retrying. PRODUCTION does the same during the ingest service.
"""
import json, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
import pymongo

MONGO = "mongodb://localhost:27017/forestwatch"
WORKERS = 12

def get(url, retries=4):
    for i in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                return json.load(r)
        except Exception:  # noqa: BLE001 transient
            pass
    return None

cli = pymongo.MongoClient(MONGO)
db = cli.get_default_database()
species = list(db.species.find({}, {"_id": 1, "canonical": 1}))
print(f"enriching {len(species)} species...", flush=True)

done = 0

def enrich(doc):
    global done
    key = doc["_id"]
    canonical = doc.get("canonical", "") or ""
    vid = ven = ""
    names = set()
    data = get(f"https://api.gbif.org/v1/species/{key}/vernacularNames?limit=100")
    if data:
        for v in data.get("results", []):
            nm = (v.get("vernacularName") or "").strip()
            if not nm:
                continue
            lang = (v.get("language") or "").lower()
            names.add(nm)
            if lang in ("ind", "id") and not vid:
                vid = nm
            if lang in ("eng", "en") and not ven:
                ven = nm
    search = " ".join([canonical, *names]).lower()
    db.species.update_one(
        {"_id": key},
        {"$set": {"vernacularId": vid, "vernacularEn": ven, "search": search}},
    )
    done += 1
    if done % 200 == 0:
        print(f"  {done}/{len(species)}", flush=True)

with ThreadPoolExecutor(max_workers=WORKERS) as ex:
    list(ex.map(enrich, species))

db.species.create_index("search")
withname = db.species.count_documents({"vernacularId": {"$ne": ""}})
print(f"DONE: {done} enriched, {withname} have an Indonesian common name", flush=True)
