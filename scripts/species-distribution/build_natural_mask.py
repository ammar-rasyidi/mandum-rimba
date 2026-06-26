import os, numpy as np, rasterio
from rasterio.enums import Resampling
os.environ.update(AWS_NO_SIGN_REQUEST="YES", GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MULTIPLEX="YES", VSI_CACHE="TRUE")
W,S,E,N=94.5,-11.5,141.5,6.5; RES=0.1
nx=int(round((E-W)/RES)); ny=int(round((N-S)/RES))
fcnt=np.zeros((nx,ny)); tcnt=np.zeros((nx,ny))
NATURAL={10,20,30,90,95}   # tree, shrub, grassland/savanna, wetland, mangrove
base="https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{}_Map.tif"
ok=miss=0
for lat0 in range(-12,7,3):
    for lon0 in range(93,142,3):
        tile=f"{'N' if lat0>=0 else 'S'}{abs(lat0):02d}{'E' if lon0>=0 else 'W'}{abs(lon0):03d}"
        try:
            with rasterio.Env(), rasterio.open(base.format(tile)) as ds:
                a=ds.read(1,out_shape=(300,300),resampling=Resampling.mode)
        except Exception: miss+=1; continue
        ok+=1
        rows,cols=a.shape
        cc=lon0+(np.arange(cols)+0.5)/cols*3; rr=lat0+3-(np.arange(rows)+0.5)/rows*3
        LON,LAT=np.meshgrid(cc,rr)
        bx=((LON-W)/RES).astype(int); by=((LAT-S)/RES).astype(int)
        inb=(bx>=0)&(bx<nx)&(by>=0)&(by<ny)&(a!=0)
        nat=np.isin(a,list(NATURAL))
        np.add.at(tcnt,(bx[inb],by[inb]),1); np.add.at(fcnt,(bx[inb],by[inb]),nat[inb].astype(float))
        if ok%20==0: print(f"  ok={ok} miss={miss}",flush=True)
frac=np.where(tcnt>0,fcnt/tcnt,0.0)
np.save("natural_grid.npy",frac)
print("DONE ok",ok,"miss",miss,"| natural cells>=0.25:",int((frac>=0.25).sum()))
