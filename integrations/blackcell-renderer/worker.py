#!/usr/bin/env python3
"""Single-worker pilot; discover approved World videos and publish private render outputs."""
import argparse, json, os, pathlib, re, tempfile, time, urllib.request, urllib.error, urllib.parse, uuid
from render import render
ZONE="https://la.storage.bunnycdn.com/blackcell-media-vault/"
UUID=re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
EXT={"video/mp4":"mp4","video/webm":"webm","video/quicktime":"mov","video/x-m4v":"m4v"}
MAX_BYTES=45*1024*1024
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None
HTTP=urllib.request.build_opener(NoRedirect)
def request(url,headers,method="GET",data=None):
    return HTTP.open(urllib.request.Request(url,headers=headers,method=method,data=data),timeout=120)
def cfg():
    host=os.environ["SUPABASE_URL"].rstrip("/")
    if not re.fullmatch(r"https://[a-z0-9]+\.supabase\.co",host):raise ValueError("Invalid project URL")
    key=os.environ["BLACKCELL_RENDER_CATALOG_READ_KEY"]
    # Use a server-side key only; never expose it to a browser or log it.
    return host,{"apikey":key,"Authorization":"Bearer "+key},{"AccessKey":os.environ["BLACKCELL_BUNNY_STORAGE_ACCESS_KEY"]}
def rows(host,auth,offset,limit=40):
    query=urllib.parse.urlencode({"select":"id,owner_id,storage_path,bytes,mime_type,review_status,rights_confirmed,adult_restricted","source_provider":"eq.world-bunny-v1","kind":"eq.video","purpose":"eq.library","review_status":"eq.approved","adult_restricted":"eq.false","rights_confirmed":"eq.true","order":"id","offset":offset,"limit":limit})
    with request(host+"/rest/v1/corp_social_assets?"+query,auth) as r:return json.load(r)
def path_for(a):
    uid,i,ext=a["owner_id"],a["id"],EXT.get(a["mime_type"])
    if not UUID.fullmatch(uid) or not UUID.fullmatch(i) or not ext:raise ValueError("Invalid source")
    path=f"{uid}/{i}.{ext}"
    if a["storage_path"]!=path or not 0<int(a["bytes"])<=MAX_BYTES:raise ValueError("Invalid source metadata")
    return path
def exists(marker,auth):
    try:
        with request(ZONE+marker,auth) as r:
            value=json.load(r)
            return value.get("version")==1 and bool(value.get("generation"))
    except urllib.error.HTTPError as e:
        if e.code==404:return False
        raise
def put(path,content,auth):
    with request(ZONE+path,{**auth,"Content-Type":"application/octet-stream"},"PUT",content) as r:
        if r.status!=201:raise RuntimeError("Storage write not confirmed")
def work(a,storage,max_height):
    path=path_for(a);root=f'blackcell-renders/v1/{a["owner_id"]}/{a["id"]}/'
    marker=root+"ready.json"
    if exists(marker,storage):return False
    generation=uuid.uuid4().hex
    prefix=root+generation+"/"
    with tempfile.TemporaryDirectory(prefix="bc-render-") as tmp:
        src=pathlib.Path(tmp)/("original."+EXT[a["mime_type"]]);out=pathlib.Path(tmp)/"output"
        size=0
        with request(ZONE+"blackcell-worlds/v1/"+path,storage) as r,src.open("wb") as dest:
            while chunk:=r.read(1024*1024):
                size+=len(chunk)
                if size>MAX_BYTES:raise ValueError("Source too large")
                dest.write(chunk)
        if size!=int(a["bytes"]):raise ValueError("Original byte count mismatch")
        variants=render(src,out,max_height)
        # Upload all segments and playlists before publishing a readiness pointer.
        for f in sorted(out.rglob("*")):
            if f.is_file():put(prefix+f.relative_to(out).as_posix(),f.read_bytes(),storage)
        put(marker,json.dumps({"version":1,"generation":generation,"asset_id":a["id"],"variants":variants},separators=(",",":")).encode(),storage)
    return True
def main():
    p=argparse.ArgumentParser();p.add_argument("--max-jobs",type=int,default=1);p.add_argument("--max-height",type=int,choices=[360,480,720,1080,1440,2160],default=1080);p.add_argument("--poll",type=int,default=0,help="Seconds between scans; zero runs once");a=p.parse_args()
    if not 1<=a.max_jobs<=20 or (a.poll and a.poll<60):p.error("Set 1-20 jobs per scan and at least 60 seconds between scans")
    host,auth,storage=cfg()
    while True:
        done=0;offset=0
        try:
            while done<a.max_jobs:
                batch=rows(host,auth,offset)
                if not batch:break
                for item in batch:
                    if done>=a.max_jobs:break
                    try:
                        if work(item,storage,a.max_height):done+=1;print("Rendered one approved video",flush=True)
                    except Exception as exc:
                        # No storage URLs, keys, filenames, payloads or FFmpeg stderr in logs.
                        print("Render failed:",type(exc).__name__,flush=True)
                offset+=len(batch)
        except Exception as exc:print("Catalog scan failed:",type(exc).__name__,flush=True)
        if not a.poll:break
        time.sleep(a.poll)
if __name__=="__main__":main()
