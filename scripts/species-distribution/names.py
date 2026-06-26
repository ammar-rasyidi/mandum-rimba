import json, urllib.request, urllib.parse, os
from concurrent.futures import ThreadPoolExecutor
def get(u):
    return json.loads(urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'MR/1'}),timeout=15).read())
names=json.load(open("species-names.json")) if os.path.exists("species-names.json") else {}
for f in json.load(open("flagship.json")):
    names.setdefault(" ".join(f["sci"].split()[:2]),{})["id"]= f["id"]
fc=json.load(open("species-distribution.geojson")); uniq=set()
for ft in fc["features"]:
    for s in ft["properties"]["species"]: uniq.add(s[0])
missing=[s for s in uniq if s not in names or not names[s]]
print("uniq",len(uniq),"missing",len(missing),flush=True)
def one(name):
    try:
        k=get("https://api.gbif.org/v1/species/match?name="+urllib.parse.quote(name)).get("usageKey")
        idn=eng=None
        if k:
            for r in get(f"https://api.gbif.org/v1/species/{k}/vernacularNames?limit=200").get("results",[]):
                ln,vn=r.get("language"),r.get("vernacularName")
                if vn and ln=="ind" and not idn: idn=vn
                elif vn and ln=="eng" and not eng: eng=vn
        e={}
        if idn:e["id"]=idn
        if eng:e["en"]=eng
        return name,e
    except Exception: return name,{}
with ThreadPoolExecutor(max_workers=12) as ex:
    for name,e in ex.map(one,missing):
        if e: names[name]=e
names={k:v for k,v in names.items() if k in uniq}
names["Dicerorhinus sumatrensis"]={"id":"Badak Sumatra","en":"Sumatran Rhinoceros"}
names["Rhinoceros sondaicus"]={"id":"Badak Jawa","en":"Javan Rhinoceros"}
json.dump(names,open("species-names.json","w"),ensure_ascii=False)
print("FINAL names",len(names),"/",len(uniq))
