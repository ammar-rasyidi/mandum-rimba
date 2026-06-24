import urllib.request, json, re, time

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent":"MandumRimba/1.0 (research)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8")

# 1) Wikipedia HTML for the endemic birds list
url = "https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=text&page=List_of_endemic_birds_of_Indonesia"
data = json.loads(get(url))
html = data["parse"]["text"]["*"]

# extract italicised binomials <i>Genus species</i> (also subspecies trinomials -> keep first two)
names = set()
for m in re.findall(r"<i>([A-Z][a-z]+ [a-z]+)(?: [a-z]+)?</i>", html):
    g, s = m.split(" ")[0], m.split(" ")[1]
    # filter obvious non-species (genus only handled by regex requiring two words)
    names.add(f"{g} {s}")

names = sorted(names)
print("raw binomials extracted:", len(names))
print("sample:", names[:12])
with open("birds_raw.json","w") as f:
    json.dump(names, f)
