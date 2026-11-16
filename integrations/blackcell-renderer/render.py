#!/usr/bin/env python3
"""BLACKCELL HLS VOD packager. Local files only; no credentials or network."""
import argparse, json, math, pathlib, subprocess, tempfile, shutil

# Resolution means short edge, including portrait videos. Do not upscale.
LADDER=((360,800),(480,1400),(720,2800),(1080,5500),(1440,9500),(2160,16500))
def run(args,timeout=7200):
    return subprocess.run(args,check=True,capture_output=True,text=True,timeout=timeout).stdout
def probe(src):
    data=json.loads(run(["ffprobe","-v","error","-show_streams","-show_format","-of","json",str(src)],60))
    v=next(s for s in data["streams"] if s["codec_type"]=="video" and not s.get("disposition",{}).get("attached_pic"))
    w,h=int(v["width"]),int(v["height"])
    rotation=next((x.get("rotation",0) for x in v.get("side_data_list",[]) if "rotation" in x),0)
    if abs(int(rotation))%180==90:w,h=h,w
    duration=float(data["format"]["duration"])
    if not (0<duration<=7200 and 2<=w<=8192 and 2<=h<=8192):raise ValueError("Unsupported dimensions or duration")
    a=next((s for s in data["streams"] if s["codec_type"]=="audio"),None)
    return w,h,duration,v["index"],a["index"] if a else None
def render(src,out,max_height=1080):
    src=pathlib.Path(src).resolve(strict=True);out=pathlib.Path(out).resolve()
    if out.exists():raise FileExistsError("Output already exists; original is never overwritten")
    w,h,duration,vid,aud=probe(src);short=min(w,h)
    levels=[(n,k) for n,k in LADDER if n<=min(short,max_height)]
    if not levels:levels=[(max(2,min(short,max_height)//2*2),600)]
    out.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".render-",dir=out.parent) as temp:
        d=pathlib.Path(temp)/"vod";d.mkdir();variants=[]
        for n,k in levels:
            folder=d/str(n);folder.mkdir()
            # Fixed common four-second keyframe boundaries allow switching variants.
            scale=f"scale=-2:{n}" if w>=h else f"scale={n}:-2"
            args=["ffmpeg","-hide_banner","-loglevel","error","-nostdin","-y","-protocol_whitelist","file,pipe","-i",str(src),"-map",f"0:{vid}"]
            if aud is not None:args+=["-map",f"0:{aud}","-c:a","aac","-b:a","128k","-ac","2","-ar","48000"]
            args+=["-vf",scale+",setsar=1","-c:v","libx264","-threads","2","-preset","fast","-pix_fmt","yuv420p","-b:v",f"{k}k","-maxrate",f"{int(k*1.25)}k","-bufsize",f"{k*2}k","-sc_threshold","0","-force_key_frames","expr:gte(t,n_forced*4)","-f","hls","-hls_time","4","-hls_playlist_type","vod","-hls_flags","independent_segments","-hls_segment_filename",str(folder/"seg-%05d.ts"),str(folder/"index.m3u8")]
            run(args)
            first=next(folder.glob("seg-*.ts"))
            rw,rh,*_=probe(first)
            playlist=(folder/"index.m3u8").read_text()
            if "#EXT-X-ENDLIST" not in playlist or not list(folder.glob("seg-*.ts")):raise RuntimeError("Incomplete rendition")
            variants.append({"quality":n,"width":rw,"height":rh,"bandwidth":int((k*1.25+128)*1000),"playlist":f"{n}/index.m3u8"})
        master=["#EXTM3U","#EXT-X-VERSION:3","#EXT-X-INDEPENDENT-SEGMENTS"]
        for v in variants:master.extend([f'#EXT-X-STREAM-INF:BANDWIDTH={v["bandwidth"]},RESOLUTION={v["width"]}x{v["height"]}',v["playlist"]])
        (d/"master.m3u8").write_text("\n".join(master)+"\n")
        (d/"render.json").write_text(json.dumps({"version":1,"duration":duration,"original":{"width":w,"height":h},"variants":variants},indent=2))
        d.rename(out)
    return variants
if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("source");p.add_argument("output");p.add_argument("--max-height",type=int,choices=[360,480,720,1080,1440,2160],default=1080);a=p.parse_args()
    print(json.dumps(render(a.source,a.output,a.max_height)))
