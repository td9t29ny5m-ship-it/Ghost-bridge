// Contact sheet of a rendered video for the review pass: one frame per second with timecodes, 10 per row.
// Usage: node scripts/sheet.mjs renders/out.mp4 [fps=1] [outPng]
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const src = process.argv[2]; const fps = process.argv[3] || "1"; const out = resolve(process.argv[4] || src.replace(/\.mp4$/i, "") + "_sheet.png");
if (!src) { console.error("usage: node scripts/sheet.mjs video.mp4 [fps] [out.png]"); process.exit(1); }
const dur = parseFloat(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src]).stdout.toString()) || 60;
const n = Math.ceil(dur * parseFloat(fps)); const cols = 10, rows = Math.ceil(n / cols);
const font = process.platform === "win32" ? "fontfile='C\\:/Windows/Fonts/arial.ttf':" : "";
const vf = `fps=${fps},scale=216:-1,drawtext=${font}text='%{pts\\:hms}':x=4:y=4:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6,tile=${cols}x${rows}`;
const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", src, "-vf", vf, "-frames:v", "1", out], { stdio: "inherit" });
if (r.status !== 0) process.exit(1);
console.log(out);
