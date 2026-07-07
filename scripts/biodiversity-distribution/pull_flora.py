"""
Pull GBIF occurrence points for the curated iconic/endemic Indonesian flora and
write them, tagged by label, to inputs/endemic-flora-id.geojson (the input to
contour_bio.py). Each label = one catalog entry in
apps/web/src/data/flora-species.json; the map contours ALL points together per
island, then tags each area with the labels recorded inside it.

Only open GBIF data is used: georeferenced records inside Indonesia, with no
flagged geospatial issue. Labels may be a genus (more points -> firmer areas) or
a single iconic species; sparse species still tag onto the combined density areas.

Run:  python pull_flora.py        (writes inputs/endemic-flora-id.geojson)
Then: python contour_bio.py       (regenerates the distribution areas)
Requires only the Python standard library.
"""

import json
import os
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "inputs", "endemic-flora-id.geojson")
BBOX = (94.5, -11.5, 141.5, 6.5)  # Indonesia
CAP = 600  # max points kept per label (balances dense genera vs rare species)
PAGE = 300

# label (also the flora-species.json key + map tag) -> GBIF taxon name to match.
# Genus where records are sparse at species level or the label is a group;
# species where the label is one iconic plant.
LABELS = {
    "Rafflesia": "Rafflesia",
    "Bunga bangkai": "Amorphophallus",
    "Kantong semar": "Nepenthes",
    "Meranti": "Shorea",
    "Keruing": "Dipterocarpus",
    "Eucalyptus pelangi": "Eucalyptus deglupta",
    "Rhododendron": "Rhododendron",
    "Anggrek selop": "Paphiopedilum",
    "Anggrek bulan": "Phalaenopsis amabilis",
    "Cendana": "Santalum album",
    "Kayu ulin": "Eusideroxylon zwageri",
    "Damar": "Agathis dammara",
    "Anggrek hitam": "Coelogyne pandurata",
    "Edelweiss jawa": "Anaphalis javanica",
    "Sagu": "Metroxylon sagu",
    "Aren": "Arenga pinnata",
    "Bakau": "Rhizophora",
    "Palem merah": "Cyrtostachys renda",
}


def get(url):
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)


def taxon_key(name):
    m = get("https://api.gbif.org/v1/species/match?name=" + urllib.parse.quote(name))
    return m.get("usageKey")


def occurrences(key):
    """Yield (lon, lat) for georeferenced ID records with no geospatial issue."""
    w, s, e, n = BBOX
    offset = 0
    kept = 0
    while kept < CAP:
        url = (
            "https://api.gbif.org/v1/occurrence/search?country=ID"
            "&hasCoordinate=true&hasGeospatialIssue=false"
            f"&taxonKey={key}&limit={PAGE}&offset={offset}"
        )
        data = get(url)
        results = data.get("results", [])
        if not results:
            break
        for r in results:
            lo = r.get("decimalLongitude")
            la = r.get("decimalLatitude")
            if lo is None or la is None:
                continue
            if not (w <= lo <= e and s <= la <= n):
                continue
            yield round(lo, 5), round(la, 5)
            kept += 1
            if kept >= CAP:
                break
        if data.get("endOfRecords"):
            break
        offset += PAGE
        time.sleep(0.2)  # be gentle on the API


def main():
    feats = []
    for label, name in LABELS.items():
        key = taxon_key(name)
        if not key:
            print(f"  ! {label} ({name}): no GBIF match, skipped")
            continue
        seen = set()
        pts = []
        for lo, la in occurrences(key):
            k = (lo, la)
            if k in seen:  # drop exact-duplicate coordinates
                continue
            seen.add(k)
            pts.append([lo, la])
        for lo, la in pts:
            feats.append(
                {
                    "type": "Feature",
                    "properties": {"taxon": label},
                    "geometry": {"type": "Point", "coordinates": [lo, la]},
                }
            )
        print(f"  {label:16} {name:22} key={key} -> {len(pts)} points")
    json.dump(
        {"type": "FeatureCollection", "features": feats},
        open(OUT, "w"),
        ensure_ascii=False,
    )
    print(f"\nwrote {len(feats)} points across {len(LABELS)} labels -> {OUT}")


if __name__ == "__main__":
    main()
