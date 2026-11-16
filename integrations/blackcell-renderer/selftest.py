"""Credential-free smoke test. Never reads or writes real media."""
import hashlib, pathlib, tempfile, subprocess
from render import render, probe
with tempfile.TemporaryDirectory(prefix="blackcell-test-") as tmp:
    root=pathlib.Path(tmp); source=root/"synthetic.mp4"; out=root/"hls"
    subprocess.run(["ffmpeg","-v","error","-nostdin","-f","lavfi","-i","testsrc2=size=1280x720:rate=24","-f","lavfi","-i","sine=frequency=440:sample_rate=48000","-t","5","-c:v","libx264","-threads","2","-pix_fmt","yuv420p","-c:a","aac",str(source)],check=True,timeout=120)
    digest=hashlib.sha256(source.read_bytes()).hexdigest()
    result=render(source,out,720)
    assert [x["quality"] for x in result]==[360,480,720]
    for item in result:
        folder=out/str(item["quality"])
        assert len(list(folder.glob("seg-*.ts")))==2
        assert "#EXT-X-ENDLIST" in (folder/"index.m3u8").read_text()
        assert min(item["height"],item["width"])==item["quality"]
    assert hashlib.sha256(source.read_bytes()).hexdigest()==digest
    print("BLACKCELL_RENDER_SELF_TEST_PASS: 360p 480p 720p; original preserved",flush=True)
