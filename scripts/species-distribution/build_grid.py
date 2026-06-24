import urllib.request, urllib.parse, json, math, time, sys

CELL = 0.5  # degrees (~55km) for an area/"wilayah" look
PER_SPECIES = 300  # occurrences sampled per species (enough for cell presence)

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent":"MandumRimba/1.0"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode("utf-8"))

species = json.load(open("birds_matched.json"))
cells = {}  # (cx,cy) -> {"sp":set(),"occ":int}
mapped = 0
for i, sp in enumerate(species):
    key = sp["key"]
    try:
        d = get(f"https://api.gbif.org/v1/occurrence/search?taxon_key={key}&country=ID&hasCoordinate=true&hasGeospatialIssue=false&year=1990,2026&limit={PER_SPECIES}")
        recs = d.get("results", [])
        if recs: mapped += 1
        for o in recs:
            la, lo = o.get("decimalLatitude"), o.get("decimalLongitude")
            if la is None or lo is None: continue
            cx, cy = math.floor(lo/CELL), math.floor(la/CELL)
            c = cells.setdefault((cx,cy), {"sp":set(),"occ":0})
            c["sp"].add(key); c["occ"] += 1
    except Exception as e:
        pass
    if i % 50 == 0:
        print(f"  {i}/{len(species)} cells={len(cells)} speciesWithData={mapped}", flush=True)

feats = []
for (cx,cy), c in cells.items():
    x0, y0 = cx*CELL, cy*CELL
    feats.append({
        "type":"Feature",
        "properties":{"richness":len(c["sp"]), "occ":c["occ"]},
        "geometry":{"type":"Polygon","coordinates":[[[x0,y0],[x0+CELL,y0],[x0+CELL,y0+CELL],[x0,y0+CELL],[x0,y0]]]}
    })
fc = {"type":"FeatureCollection","features":feats}
json.dump(fc, open("species-distribution-birds.geojson","w"))
rich = [f["properties"]["richness"] for f in feats]
print("CELLS:", len(feats), "| max richness:", max(rich) if rich else 0, "| species with >=1 record:", mapped, "/", len(species))
