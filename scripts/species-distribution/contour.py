import json, datetime, sys
from shapely.geometry import Polygon as SPoly
import numpy as np, matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.path import Path as MplPath
from collections import Counter
SIGMA   = float(sys.argv[1]) if len(sys.argv)>1 else 3.2
LOW_Q   = float(sys.argv[2]) if len(sys.argv)>2 else 0.5
MIN_AREA= float(sys.argv[3]) if len(sys.argv)>3 else 0.12
RES=0.1; BBOX=(94.5,-11.5,141.5,6.5); DATE="1990–2026"  # GBIF occurrence period, not processing date
SEV={"EX":7,"EW":6,"CR":5,"EN":4,"VU":3,"NT":2,"LC":1}
KEEP={"NT","VU","EN","CR","EW","EX"}
A=json.load(open("raw_points.json")); NOT=json.load(open("raw_notable.json"))
IUCN=json.load(open("iucn.json"))
notable_set=set(p[2] for p in NOT if p[2])
flagship_set=set(" ".join(f["sci"].split()[:2]) for f in json.load(open("flagship.json")))
FREG=json.load(open("flagship_regions.json"))   # flagship sci -> island keys
RBOX={"sumatera":(94.5,-6.2,107.2,6.3),"kalimantan":(108.3,-4.6,119.6,7.6),"jawa":(105.0,-9.2,115.2,-5.7),
 "sulawesi":(118.0,-6.3,126.2,2.6),"nusatenggara":(115.4,-11.2,127.2,-7.7),"bali":(114.3,-8.95,115.85,-7.95),
 "maluku":(123.8,-8.6,135.2,2.9),"papua":(129.8,-11.2,141.6,0.7)}
def assign_island(lo,la):
    if 94.5<=lo<106.5 and -6.0<=la<=6.3: return "sumatera"
    if 105.0<=lo<=116.0 and -9.2<=la<-6.0: return "jawabali"
    if 108.3<=lo<=117.8 and -4.6<=la<=7.6: return "kalimantan"
    if 118.5<=lo<=126.5 and -6.3<=la<=2.6: return "sulawesi"
    if 115.0<=lo<=127.5 and -11.5<=la<-7.7: return "nusatenggara"
    if 123.8<=lo<129.0 and -8.6<=la<=2.9: return "maluku"
    if 129.0<=lo<=142.0 and -11.5<=la<=1.5: return "papua"
    return None
def in_region(sci,lo,la):
    ks=FREG.get(sci)
    if not ks: return True
    for k in ks:
        w,s2,e,n=RBOX[k]
        if w<=lo<=e and s2<=la<=n: return True
    return False
# domestic / introduced animals that aren't wildlife habitat signal
DOMESTIC={"Bubalus bubalis","Bos taurus","Capra hircus","Ovis aries","Felis catus",
 "Canis lupus","Canis familiaris","Equus caballus","Equus asinus","Rattus rattus",
 "Rattus norvegicus","Rattus exulans","Mus musculus","Sus scrofa","Gallus gallus"}
EAST={"sulawesi","maluku","nusatenggara","papua"}   # Wallacea + Papua: near-total endemism
def include(sci,lo,la,cl):
    if not sci or sci in DOMESTIC: return False
    if sci in flagship_set and not in_region(sci,lo,la): return False
    if sci in notable_set or IUCN.get(sci) in KEEP: return True
    # endemic-rich east: keep all native non-bird wildlife, not just threatened
    if cl in ("mammalia","reptilia","amphibia") and assign_island(lo,la) in EAST: return True
    return False
FOREST_FRAC=np.load("natural_grid.npy")   # natural habitat: forest+savanna+wetland+shrub+mangrove
URBAN=[MplPath(np.array(r)) for r in json.load(open("urban_id.json"))]
def deurban(coords):
    if len(coords)==0: return np.zeros(0,bool)
    m=np.zeros(len(coords),bool)
    for p in URBAN: m|=p.contains_points(coords)
    return ~m
# conservation-relevant points per class (threatened or flagship/endemic), city-masked
CONS={}
for cl in ["aves","mammalia","reptilia","amphibia"]:
    pts=[(lo,la,s) for lo,la,s in A.get(cl,[]) if include(s,lo,la,cl)]
    pts+=[(lo,la,s) for lo,la,s,c in NOT if c==cl and include(s,lo,la,cl)]
    if not pts: CONS[cl]=[]; continue
    co=np.array([[p[0],p[1]] for p in pts]); keep=deurban(co)
    CONS[cl]=[pts[i] for i in np.nonzero(keep)[0]]
GROUPS={}
for cl,plist in CONS.items():
    for lo,la,sname in plist:
        isl=assign_island(lo,la)
        if isl: GROUPS.setdefault((cl,isl),[]).append((lo,la,sname))
print("groups:",{f'{k[0]}/{k[1]}':len(v) for k,v in sorted(GROUPS.items())},flush=True)
def gk(s):
    r=int(s*3); x=np.arange(-r,r+1); k=np.exp(-(x**2)/(2*s**2)); return k/k.sum()
KER=gk(SIGMA)
KERF=gk(1.6)
def blurf(M):
    M=np.apply_along_axis(lambda v:np.convolve(v,KERF,mode="same"),0,M)
    return np.apply_along_axis(lambda v:np.convolve(v,KERF,mode="same"),1,M)
def blur(M):
    M=np.apply_along_axis(lambda v:np.convolve(v,KER,mode="same"),0,M)
    return np.apply_along_axis(lambda v:np.convolve(v,KER,mode="same"),1,M)
def chaikin(coords, it=3):
    pts=coords[:-1] if coords and coords[0]==coords[-1] else list(coords)
    if len(pts)<4: 
        out=list(pts)
        if out and out[0]!=out[-1]: out.append(out[0])
        return [[round(x,4),round(y,4)] for x,y in out]
    for _ in range(it):
        new=[]; n=len(pts)
        for i in range(n):
            p=pts[i]; q=pts[(i+1)%n]
            new.append((p[0]*0.75+q[0]*0.25, p[1]*0.75+q[1]*0.25))
            new.append((p[0]*0.25+q[0]*0.75, p[1]*0.25+q[1]*0.75))
        pts=new
    pts.append(pts[0])
    return [[round(x,4),round(y,4)] for x,y in pts]
def area(r):
    a=0.0
    for i in range(len(r)-1): a+=r[i][0]*r[i+1][1]-r[i+1][0]*r[i][1]
    return abs(a)/2
def pick(cnt):
    # points are already include()-filtered; just drop single-record noise and rank
    cand=[]
    for sci,n in cnt.items():
        if n<2: continue
        cat=IUCN.get(sci)
        cand.append((SEV.get(cat,0), 1 if sci in flagship_set else 0, n, sci, cat or ""))
    cand.sort(key=lambda x:(-x[0],-x[1],-x[2]))
    return [[s,c] for _,_,_,s,c in cand[:8]]
W,S,E,N=BBOX; nx=int(round((E-W)/RES)); ny=int(round((N-S)/RES))
feats=[]
for (cname,isl),pts in GROUPS.items():
    if len(pts)<15: continue
    coords=np.array([[p[0],p[1]] for p in pts]); names=[p[2] for p in pts]
    H,xe,ye=np.histogram2d(coords[:,0],coords[:,1],bins=[nx,ny],range=[[W,E],[S,N]])
    FW=np.clip((blurf(FOREST_FRAC)-0.12)/0.45,0,1)   # feathered forest-habitat weight
    D=blur(H)*FW
    pos=D[D>1e-6]
    lv=[round(float(np.quantile(pos,LOW_Q)),6)]; lv=[l for l in lv if l>0]
    if not lv: continue
    xc=(xe[:-1]+xe[1:])/2; yc=(ye[:-1]+ye[1:])/2; X,Y=np.meshgrid(xc,yc)
    cs=plt.contourf(X,Y,D.T,levels=lv+[float(D.max())+1]); plt.clf()
    for band,path in enumerate(cs.get_paths()):
        for ring in path.to_polygons():
            if len(ring)<4: continue
            r=[[float(x),float(y)] for x,y in ring]
            if r[0]!=r[-1]: r.append(r[0])
            if area(r)<MIN_AREA: continue
            # de-staircase: simplify grid steps, then round corners (organic edge)
            sp_geom=SPoly(r)
            if not sp_geom.is_valid: sp_geom=sp_geom.buffer(0)
            sp_geom=sp_geom.simplify(0.06, preserve_topology=True)
            subpolys=[sp_geom] if sp_geom.geom_type=="Polygon" else list(getattr(sp_geom,"geoms",[]))
            for g in subpolys:
                if g.is_empty: continue
                rr=chaikin(list(g.exterior.coords), it=2)
                if area(rr)<MIN_AREA: continue
                P=MplPath(rr); cnt=Counter()
                for i in np.nonzero(P.contains_points(coords))[0]:
                    if names[i]: cnt[names[i]]+=1
                sp=pick(cnt)
                if not sp: continue
                feats.append({"type":"Feature","properties":{"class":cname,"level":band+1,"species":sp,"date":DATE},
                    "geometry":{"type":"Polygon","coordinates":[rr]}})
feats.sort(key=lambda f:f["properties"]["level"])
import math
def circle(cx,cy,r=0.22,n=18):
    pts=[[round(cx+r*math.cos(2*math.pi*k/n),4),round(cy+r*math.sin(2*math.pi*k/n),4)] for k in range(n)]
    pts.append(pts[0]); return pts
# documented-range markers as their OWN small local areas, so a rhino stays at
# its site instead of bleeding across a whole regional polygon
for mk in json.load(open("markers.json")):
    for cx,cy in mk["sites"]:
        feats.append({"type":"Feature","properties":{"class":mk["class"],"level":1,
            "species":[[mk["sci"],mk["cat"],"doc"]],"date":DATE,"docOnly":True},
            "geometry":{"type":"Polygon","coordinates":[circle(cx,cy)]}})

json.dump({"type":"FeatureCollection","features":feats},open("species-distribution.geojson","w"),ensure_ascii=False)
import os
print(f"S={SIGMA} Q={LOW_Q} A={MIN_AREA} -> POLY:",len(feats),dict(Counter(f['properties']['class'] for f in feats)),
      "KB:",round(os.path.getsize('species-distribution.geojson')/1024,1))
