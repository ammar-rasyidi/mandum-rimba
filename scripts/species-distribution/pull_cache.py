import urllib.request, json
CLASSES = {"aves":[212],"mammalia":[359],"reptilia":[11592253,11493978,11418114],"amphibia":[131]}
# regional bboxes (W,S,E,N) so every part of Indonesia, incl. Papua, is sampled
REGIONS=[(95,-6,107,6),(105,-9,116,-5),(108,-5,119,7),(118,-6,126,3),
         (115,-11,125,-7),(124,-9,135,3),(130,-11,141,1)]
CAP=2500  # per (classKey, region)
def get(url):
    req=urllib.request.Request(url,headers={"User-Agent":"MandumRimba/1.0"})
    with urllib.request.urlopen(req,timeout=60) as r: return json.loads(r.read().decode())
raw={}
for cname,ckeys in CLASSES.items():
    seen=set(); pts=[]
    for ckey in ckeys:
        for (w,s,e,n) in REGIONS:
            off=0
            while off<CAP:
                d=get(f"https://api.gbif.org/v1/occurrence/search?country=ID&classKey={ckey}"
                      f"&hasCoordinate=true&hasGeospatialIssue=false&year=1990,2026"
                      f"&decimalLatitude={s},{n}&decimalLongitude={w},{e}&limit=300&offset={off}")
                res=d.get("results",[])
                if not res: break
                for o in res:
                    la,lo=o.get("decimalLatitude"),o.get("decimalLongitude")
                    if la is None or lo is None or not(-90<la<90): continue
                    k=(round(lo,3),round(la,3),o.get("speciesKey"))
                    if k in seen: continue
                    seen.add(k); pts.append([round(lo,4),round(la,4),o.get("species")])
                off+=300
                if d.get("endOfRecords"): break
    raw[cname]=pts
    print(f"  {cname}: {len(pts)}", flush=True)
json.dump(raw, open("raw_points.json","w"))
print("CACHED:", {k:len(v) for k,v in raw.items()})
