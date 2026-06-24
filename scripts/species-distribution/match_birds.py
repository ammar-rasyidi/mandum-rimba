import urllib.request, urllib.parse, json, time

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent":"MandumRimba/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))

names = json.load(open("birds_raw.json"))
matched = {}
fails = []
for i, nm in enumerate(names):
    try:
        q = urllib.parse.quote(nm)
        d = get(f"https://api.gbif.org/v1/species/match?name={q}&class=Aves&strict=false")
        key = d.get("usageKey")
        if key and d.get("matchType") != "NONE" and d.get("classKey")==212:  # 212 = Aves
            matched[key] = d.get("species") or nm
        else:
            fails.append(nm)
    except Exception as e:
        fails.append(nm)
    if i % 50 == 0:
        print(f"  {i}/{len(names)} matched={len(matched)}", flush=True)

out = [{"key":k,"name":v} for k,v in matched.items()]
json.dump(out, open("birds_matched.json","w"))
print("UNIQUE GBIF bird species:", len(out))
print("unmatched:", len(fails), fails[:8])
