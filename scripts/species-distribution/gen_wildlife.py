import json, re
A=json.load(open('raw_points.json')); NOT=json.load(open('raw_notable.json'))
IUCN=json.load(open('iucn.json')); NAMES=json.load(open('species-names.json'))
TH={'CR','EN','VU'}
def slugify(s):
    return re.sub(r'[^a-z0-9]+','-',s.lower()).strip('-')
# gather points per threatened species
bysp={}
def add(s,lo,la):
    if s and IUCN.get(s) in TH:
        bysp.setdefault(s,[]).append((round(lo,4),round(la,4)))
for cl,plist in A.items():
    for lo,la,s in plist: add(s,lo,la)
for lo,la,s,c in NOT: add(s,lo,la)
# build species list + thinned points
species=[]; points=[]
sev={'CR':3,'EN':2,'VU':1}
for sci in sorted(bysp, key=lambda x:(-sev[IUCN[x]], x)):
    nm=NAMES.get(sci,{})
    idn=nm.get('id') or nm.get('en') or sci
    en=nm.get('en') or nm.get('id') or sci
    si=len(species)
    species.append({'slug':slugify(sci),'id':idn,'en':en,'sci':sci,'iucn':IUCN[sci]})
    # thin: dedupe by ~1km grid, cap 60/species
    seen=set(); kept=0
    for lo,la in bysp[sci]:
        k=(round(lo,2),round(la,2))
        if k in seen: continue
        seen.add(k); points.append([si,lo,la]); kept+=1
        if kept>=60: break
out={'species':species,'points':points}
json.dump(out, open('wildlife-points.json','w'), ensure_ascii=False, separators=(',',':'))
import os
print('species:',len(species),'points:',len(points),'KB:',round(os.path.getsize('wildlife-points.json')/1024,1))
