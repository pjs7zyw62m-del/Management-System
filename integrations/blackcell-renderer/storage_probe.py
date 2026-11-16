"""Verify private storage with an isolated synthetic object. Never log secrets."""
import os, urllib.request, urllib.error, uuid, hashlib
from worker import ZONE, request
def main():
    key=os.environ.get("BLACKCELL_BUNNY_STORAGE_ACCESS_KEY","").strip()
    if not key:raise RuntimeError("Storage variable missing")
    headers={"AccessKey":key}
    url=ZONE+"blackcell-renders/probes/"+uuid.uuid4().hex+".bin"
    data=os.urandom(1024)
    created=False
    try:
        with request(url,{**headers,"Content-Type":"application/octet-stream"},"PUT",data) as r:
            if r.status!=201:raise RuntimeError("Probe write not confirmed")
            created=True
        with request(url,headers) as r:
            if r.read(1025)!=data:raise RuntimeError("Probe read mismatch")
        print("BLACKCELL_STORAGE_PROBE_READ_WRITE_PASS",flush=True)
    finally:
        if created:
            with request(url,headers,"DELETE") as r:
                if r.status not in (200,204):raise RuntimeError("Probe cleanup not confirmed")
            print("BLACKCELL_STORAGE_PROBE_CLEANUP_PASS",flush=True)
if __name__=="__main__":
    try:main()
    except Exception as exc:
        print("BLACKCELL_STORAGE_PROBE_FAILED:",type(exc).__name__,getattr(exc,"code",""),flush=True)
        raise SystemExit(1)
