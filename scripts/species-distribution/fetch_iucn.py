import json, urllib.request, urllib.parse, os
from concurrent.futures import ThreadPoolExecutor
def get(url):
    req=urllib.request.Request(url,headers={"User-Agent":"MandumRimba/1.0"})
    with urllib.request.urlopen(req,timeout=20) as r: return json.loads(r.read().decode())
CODE={"LEAST_CONCERN":"LC","NEAR_THREATENED":"NT","VULNERABLE":"VU","ENDANGERED":"EN",
      "CRITICALLY_ENDANGERED":"CR","EXTINCT_IN_THE_WILD":"EW","EXTINCT":"EX",
      "DATA_DEFICIENT":"DD","NOT_EVALUATED":"NE"}
A=json.load(open("raw_points.json")); N=json.load(open("raw_notable.json"))
sp=set()
for cl,pts in A.items():
    for p in pts:
        if p[2]: sp.add(p[2])
for p in N:
    if p[2]: sp.add(p[2])
key={}
for f in json.load(open("flagship.json")): key[" ".join(f["sci"].split()[:2])]=f["key"]
for b in json.load(open("birds_matched.json")): key.setdefault(b["name"],b["key"])
iucn=json.load(open("iucn.json")) if os.path.exists("iucn.json") else {}
todo=[s for s in sp if s not in iucn]
print("to fetch:",len(todo),"cached:",len(iucn),flush=True)
def one(name):
    try:
        k=key.get(name)
        if not k:
            k=get(f"https://api.gbif.org/v1/species/match?name={urllib.parse.quote(name)}").get("usageKey")
        cat=None
        if k:
            cat=CODE.get(get(f"https://api.gbif.org/v1/species/{k}/iucnRedListCategory").get("category"))
        return name,cat
    except Exception:
        return name,None
done=0
with ThreadPoolExecutor(max_workers=12) as ex:
    for name,cat in ex.map(one,todo):
        iucn[name]=cat; done+=1
        if done%200==0:
            json.dump(iucn,open("iucn.json","w")); print(f"  {done}/{len(todo)}",flush=True)
json.dump(iucn,open("iucn.json","w"))
from collections import Counter
print("DONE",len(iucn),"dist:",dict(Counter(v or 'NONE' for v in iucn.values())))
