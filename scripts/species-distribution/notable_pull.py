import urllib.request, json
def get(url):
    req=urllib.request.Request(url,headers={"User-Agent":"MandumRimba/1.0"})
    with urllib.request.urlopen(req,timeout=60) as r: return json.loads(r.read().decode())
CLASS_MAP={"Mammalia":"mammalia","Aves":"aves","Amphibia":"amphibia",
           "Squamata":"reptilia","Testudines":"reptilia","Crocodylia":"reptilia","Reptilia":"reptilia"}
flag=json.load(open("flagship.json"))            # [{sci,id,key}]
birds=json.load(open("birds_matched.json"))      # [{key,name}]
keys={}
for f in flag: keys[f["key"]]=f["sci"]
for b in birds: keys.setdefault(b["key"], b["name"])
pts=[]   # [lon,lat,species,class]
for i,(k,sci) in enumerate(keys.items()):
    off=0
    while off<900:  # enough to locate where a notable species occurs
        try:
            d=get(f"https://api.gbif.org/v1/occurrence/search?country=ID&taxonKey={k}"
                  f"&hasCoordinate=true&hasGeospatialIssue=false&year=1990,2026&limit=300&offset={off}")
        except Exception: break
        res=d.get("results",[])
        if not res: break
        for o in res:
            la,lo=o.get("decimalLatitude"),o.get("decimalLongitude")
            cl=CLASS_MAP.get(o.get("class"))
            if la is None or lo is None or not(-90<la<90) or not cl: continue
            pts.append([round(lo,4),round(la,4),o.get("species") or sci, cl])
        off+=300
        if d.get("endOfRecords"): break
    if i%80==0: print(f"  {i}/{len(keys)} pts={len(pts)}",flush=True)
json.dump(pts,open("raw_notable.json","w"))
from collections import Counter
print("NOTABLE pts:",len(pts),"by class:",dict(Counter(p[3] for p in pts)))
