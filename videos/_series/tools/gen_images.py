"""Generate the channel's images with the free Pollinations API (1 image / ~45 s per IP), one consistent style.
Usage: python3 gen_images.py <outDir> <prompts.json>   prompts.json = {"name": "subject description", ...}
Skips files that already exist, so it can be re-run after a failure."""
import sys, json, os, time, urllib.parse, urllib.request, ssl
STYLE = (", vibrant 3D Pixar style cartoon, bright saturated colors, soft cinematic lighting, cute and friendly, "
         "kid friendly, highly detailed, no text, no letters, no watermark, vertical composition")
out, prompts = sys.argv[1], json.load(open(sys.argv[2]))
os.makedirs(out, exist_ok=True)
ctx = ssl.create_default_context(cafile=os.environ.get("SSL_CERT_FILE") or None)
for i, (name, subj) in enumerate(prompts.items()):
    path = f"{out}/{name}.jpg"
    if os.path.exists(path) and os.path.getsize(path) > 20000: continue
    url = "https://image.pollinations.ai/prompt/" + urllib.parse.quote(subj + STYLE) + f"?width=864&height=1536&nologo=true&model=flux&seed={1000+i}"
    for attempt in range(12):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "video-pipeline"}), timeout=180, context=ctx) as r:
                data = r.read()
            if len(data) > 20000: open(path, "wb").write(data); print("ok", name, len(data), flush=True); break
            print("small", name, data[:200], flush=True)
        except Exception as e:
            print("retry", name, str(e)[:120], flush=True)
        time.sleep(25)
    time.sleep(46)
print("done", flush=True)
