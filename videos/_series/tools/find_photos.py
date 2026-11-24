"""Search Openverse for free-to-reuse photos (CC0, public domain, CC BY, CC BY-SA), download candidates + credits.
Usage: python3 find_photos.py <outDir> <query> [n]   → <outDir>/<slug>_<k>.jpg and credits.jsonl"""
import sys, os, json, re, ssl, urllib.parse, urllib.request
out, q = sys.argv[1], sys.argv[2]; n = int(sys.argv[3]) if len(sys.argv) > 3 else 6
ctx = ssl.create_default_context(cafile=os.environ.get("SSL_CERT_FILE") or None)
get = lambda u: urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "video-pipeline"}), timeout=60, context=ctx).read()
api = "https://api.openverse.org/v1/images/?" + urllib.parse.urlencode({"q": q, "license": "cc0,pdm,by,by-sa", "page_size": 20, "mature": "false"})
res = json.loads(get(api))["results"]
slug = re.sub(r"\W+", "_", q).strip("_"); k = 0
for r in res:
    if k >= n: break
    if (r.get("width") or 0) < 900: continue
    try: data = get(r["url"])
    except Exception as e: continue
    if len(data) < 40000: continue
    p = f"{out}/{slug}_{k}.jpg"; open(p, "wb").write(data)
    with open(f"{out}/credits.jsonl", "a") as f: f.write(json.dumps({"file": os.path.basename(p), "attribution": r.get("attribution"), "license": r["license"], "source": r.get("foreign_landing_url")}) + "\n")
    k += 1
print(q, "→", k)
