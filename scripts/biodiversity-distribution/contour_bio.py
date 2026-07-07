"""
Biodiversity-map distribution build: turn curated GBIF occurrence POINTS for
endemic fauna and iconic flora into smooth distribution AREAS (sebaran), the
same organic-contour treatment as the /peta "Peta Sebaran Satwa" layer
(../species-distribution/contour.py), but simpler: the input points are already
curated per taxon, so there is no IUCN / habitat / flagship filtering here.

Method: per (taxon-group, island) kernel-density -> gaussian blur -> matplotlib
contourf at a low quantile -> shapely de-staircase -> Chaikin round-off. Points
are contoured PER ISLAND (assign_island) so a taxon never bleeds across a strait
(e.g. Komodo stays on Nusa Tenggara, Cendrawasih stays on Papua).

Inputs  (points, in inputs/):
  endemic-species-id.geojson   fauna, props {taxon, grp}  grp in {sundaland,wallacea,papua}
  endemic-flora-id.geojson     flora, props {taxon}
Outputs (areas, to apps/web/public/data/):
  endemic-fauna-dist-id.geojson   polygons props {grp, level, taxa:[...]}
  endemic-flora-dist-id.geojson   polygons props {level, taxa:[...]}

Run:
  python contour_bio.py [sigma] [low_quantile] [min_area]
Defaults are tuned for the current look; raise sigma for smoother/looser areas,
raise low_quantile for tighter cores, raise min_area to drop small specks.

Requires: numpy, matplotlib, shapely.
"""

import json
import os
import sys
from collections import Counter

import numpy as np
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.path import Path as MplPath
from shapely.geometry import Polygon as SPoly

SIGMA = float(sys.argv[1]) if len(sys.argv) > 1 else 3.0
LOW_Q = float(sys.argv[2]) if len(sys.argv) > 2 else 0.45
MIN_AREA = float(sys.argv[3]) if len(sys.argv) > 3 else 0.15

RES = 0.15
BBOX = (94.5, -11.5, 141.5, 6.5)  # Indonesia; drops stray out-of-country records
HERE = os.path.dirname(os.path.abspath(__file__))
IN_DIR = os.path.join(HERE, "inputs")
OUT_DIR = os.path.abspath(os.path.join(HERE, "..", "..", "apps", "web", "public", "data"))


# island boxes: same partition as species-distribution/contour.py, so both maps
# agree on which island a coordinate belongs to (no cross-strait bleed).
def assign_island(lo, la):
    if 94.5 <= lo < 106.5 and -6.0 <= la <= 6.3:
        return "sumatera"
    if 105.0 <= lo <= 116.0 and -9.2 <= la < -6.0:
        return "jawabali"
    if 108.3 <= lo <= 117.8 and -4.6 <= la <= 7.6:
        return "kalimantan"
    if 118.5 <= lo <= 126.5 and -6.3 <= la <= 2.6:
        return "sulawesi"
    if 115.0 <= lo <= 127.5 and -11.5 <= la < -7.7:
        return "nusatenggara"
    if 123.8 <= lo < 129.0 and -8.6 <= la <= 2.9:
        return "maluku"
    if 129.0 <= lo <= 142.0 and -11.5 <= la <= 1.5:
        return "papua"
    return None


def gk(s):
    r = int(s * 3)
    x = np.arange(-r, r + 1)
    k = np.exp(-(x ** 2) / (2 * s ** 2))
    return k / k.sum()


KER = gk(SIGMA)


def blur(M):
    M = np.apply_along_axis(lambda v: np.convolve(v, KER, mode="same"), 0, M)
    return np.apply_along_axis(lambda v: np.convolve(v, KER, mode="same"), 1, M)


def chaikin(coords, it=2):
    pts = coords[:-1] if coords and coords[0] == coords[-1] else list(coords)
    if len(pts) < 4:
        out = list(pts)
        if out and out[0] != out[-1]:
            out.append(out[0])
        return [[round(x, 4), round(y, 4)] for x, y in out]
    for _ in range(it):
        new = []
        n = len(pts)
        for i in range(n):
            p = pts[i]
            q = pts[(i + 1) % n]
            new.append((p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25))
            new.append((p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75))
        pts = new
    pts.append(pts[0])
    return [[round(x, 4), round(y, 4)] for x, y in pts]


def ring_area(r):
    a = 0.0
    for i in range(len(r) - 1):
        a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]
    return abs(a) / 2


def load_points(name):
    """Return list of (lon, lat, taxon, grp) inside the Indonesia bbox."""
    d = json.load(open(os.path.join(IN_DIR, name)))
    w, s, e, n = BBOX
    out = []
    for f in d["features"]:
        g = f.get("geometry") or {}
        if g.get("type") != "Point":
            continue
        lo, la = g["coordinates"][:2]
        if not (w <= lo <= e and s <= la <= n):
            continue
        p = f.get("properties") or {}
        out.append((lo, la, p.get("taxon", ""), p.get("grp")))
    return out


W, S, E, N = BBOX
NX = int(round((E - W) / RES))
NY = int(round((N - S) / RES))


def build(points, group_by_grp):
    """Contour points into area polygons, per (group, island)."""
    groups = {}
    for lo, la, taxon, grp in points:
        isl = assign_island(lo, la)
        if not isl:
            continue
        key = (grp if group_by_grp else "flora", isl)
        groups.setdefault(key, []).append((lo, la, taxon))

    feats = []
    for (grp, isl), pts in sorted(groups.items()):
        if len(pts) < 12:
            continue
        coords = np.array([[p[0], p[1]] for p in pts])
        taxa = [p[2] for p in pts]
        H, xe, ye = np.histogram2d(
            coords[:, 0], coords[:, 1], bins=[NX, NY], range=[[W, E], [S, N]]
        )
        D = blur(H)
        pos = D[D > 1e-9]
        if pos.size == 0:
            continue
        lv = [round(float(np.quantile(pos, LOW_Q)), 9)]
        lv = [l for l in lv if l > 0]
        if not lv:
            continue
        xc = (xe[:-1] + xe[1:]) / 2
        yc = (ye[:-1] + ye[1:]) / 2
        X, Y = np.meshgrid(xc, yc)
        cs = plt.contourf(X, Y, D.T, levels=lv + [float(D.max()) + 1])
        plt.clf()
        for path in cs.get_paths():
            for ring in path.to_polygons():
                if len(ring) < 4:
                    continue
                r = [[float(x), float(y)] for x, y in ring]
                if r[0] != r[-1]:
                    r.append(r[0])
                if ring_area(r) < MIN_AREA:
                    continue
                sp = SPoly(r)
                if not sp.is_valid:
                    sp = sp.buffer(0)
                sp = sp.simplify(0.08, preserve_topology=True)
                subs = [sp] if sp.geom_type == "Polygon" else list(getattr(sp, "geoms", []))
                for g in subs:
                    if g.is_empty:
                        continue
                    rr = chaikin(list(g.exterior.coords), it=2)
                    if ring_area(rr) < MIN_AREA:
                        continue
                    # which taxa were recorded inside this polygon (most first)
                    P = MplPath(rr)
                    cnt = Counter()
                    for i in np.nonzero(P.contains_points(coords))[0]:
                        if taxa[i]:
                            cnt[taxa[i]] += 1
                    names = [t for t, _ in cnt.most_common()]
                    if not names:
                        continue
                    props = {"level": 1, "taxa": names}
                    if group_by_grp:
                        props["grp"] = grp
                    feats.append(
                        {
                            "type": "Feature",
                            "properties": props,
                            "geometry": {"type": "Polygon", "coordinates": [rr]},
                        }
                    )
    return feats


def dump(feats, out_name):
    path = os.path.join(OUT_DIR, out_name)
    json.dump(
        {"type": "FeatureCollection", "features": feats},
        open(path, "w"),
        ensure_ascii=False,
    )
    kb = round(os.path.getsize(path) / 1024, 1)
    by = Counter(f["properties"].get("grp", "flora") for f in feats)
    print(f"  {out_name}: {len(feats)} polygons {dict(by)}  {kb} KB")


if __name__ == "__main__":
    print(f"S={SIGMA} Q={LOW_Q} A={MIN_AREA}")
    fauna = load_points("endemic-species-id.geojson")
    flora = load_points("endemic-flora-id.geojson")
    print(f"  fauna points (in-bbox): {len(fauna)}  flora points: {len(flora)}")
    dump(build(fauna, group_by_grp=True), "endemic-fauna-dist-id.geojson")
    dump(build(flora, group_by_grp=False), "endemic-flora-dist-id.geojson")
