"""
Enrich the `species` collection with one representative CC-licensed photo from
GBIF occurrence media, for the map popup. Stores { url, license, creator } only
(hotlinked, not re-hosted). Concurrent + best-effort. PRODUCTION does the same in
the ingest service.
"""
import json, urllib.request
from concurrent.futures import ThreadPoolExecutor
import pymongo

MONGO = "mongodb://localhost:27017/forestwatch"
WORKERS = 12

def get(url, retries=3):
    for _ in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                return json.load(r)
        except Exception:  # noqa: BLE001
            pass
    return None

def norm_license(lic):
    l = (lic or "").lower()
    if "publicdomain" in l or "cc0" in l:
        return "CC0"
    if "by-nc-sa" in l:
        return "CC BY-NC-SA"
    if "by-nc-nd" in l:
        return "CC BY-NC-ND"
    if "by-nc" in l:
        return "CC BY-NC"
    if "by-sa" in l:
        return "CC BY-SA"
    if "by-nd" in l:
        return "CC BY-ND"
    if "cc-by" in l or ("creativecommons" in l and "/by" in l):
        return "CC BY"
    return None  # not a recognised CC licence → skip (respect rights)

def thumb(url):
    # smaller variant for iNaturalist open-data photos (faster popup load)
    if "inaturalist" in url and "/original." in url:
        return url.replace("/original.", "/medium.")
    return url

cli = pymongo.MongoClient(MONGO)
db = cli.get_default_database()
# only species still missing a photo (fill the gaps with the improved query)
species = [s["_id"] for s in db.species.find({"image": {"$exists": False}}, {"_id": 1})]
print(f"finding photos for {len(species)} species still missing one...", flush=True)

done = found = 0

def enrich(key):
    global done, found
    # filter to CC-licensed occurrences + a wider window, so we actually find the
    # CC photos (many species' first few records are rights-reserved).
    d = get(f"https://api.gbif.org/v1/occurrence/search?taxonKey={key}"
            f"&mediaType=StillImage&limit=20"
            f"&license=CC0_1_0&license=CC_BY_4_0&license=CC_BY_NC_4_0")
    img = None
    if d:
        for r in d.get("results", []):
            for m in r.get("media", []):
                url = m.get("identifier")
                lic = norm_license(m.get("license"))
                if url and lic:
                    img = {
                        "url": thumb(url),
                        "license": lic,
                        "creator": (m.get("creator") or m.get("rightsHolder") or "").strip(),
                    }
                    break
            if img:
                break
    if img:
        db.species.update_one({"_id": key}, {"$set": {"image": img}})
        found += 1
    done += 1
    if done % 300 == 0:
        print(f"  {done}/{len(species)} ({found} with photo)", flush=True)

with ThreadPoolExecutor(max_workers=WORKERS) as ex:
    list(ex.map(enrich, species))

print(f"DONE: {found}/{len(species)} species have a CC-licensed photo", flush=True)
