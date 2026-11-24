// Cut an object out of its background → transparent PNG.
// Objects should be generated on a solid magenta background (#FF00FF): then this is a clean ffmpeg chroma key.
// Any other background falls back to the local AI model (hyperframes remove-background), which is made for people
// and can eat parts of objects (a watering can body, glass, white pots) — always look at the result.
// Usage: node scripts/cutout.mjs assets/img/name_raw.png assets/img/name.png [--similarity 0.32]
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const [src, out] = process.argv.slice(2);
const opt = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
if (!src || !out) { console.error("usage: node scripts/cutout.mjs in_raw.png out.png"); process.exit(1); }
// average colour of the four corners
const corner = (x, y) => { const r = spawnSync("ffmpeg", ["-v", "error", "-i", src, "-vf", `crop=12:12:${x}:${y},scale=1:1`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]); return [...(r.stdout || [])]; };
const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", src]).stdout.toString().trim().split(",").map(Number);
const [W, H] = probe; const cs = [corner(0, 0), corner(W - 12, 0), corner(0, H - 12), corner(W - 12, H - 12)].filter((c) => c.length === 3);
const magenta = cs.length && cs.every(([r, g, b]) => r > 190 && b > 190 && g < 90);
if (magenta) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", src, "-vf", `format=rgba,colorkey=color=0xFF00FF:similarity=${opt("--similarity", "0.32")}:blend=0.12`, out], { stdio: "inherit" });
  if (r.status !== 0 || !existsSync(out)) process.exit(1);
  console.log(`chroma key (magenta) → ${out}`);
} else {
  const q = (s) => `"${s}"`;
  const r = spawnSync(`npx --yes hyperframes@0.8.157 remove-background ${q(src)} -o ${q(out)}`, { stdio: "inherit", shell: true });
  if (r.status !== 0 || !existsSync(out)) process.exit(1);
  console.log(`AI background removal → ${out}  (not a magenta background: check the result; regenerate on #FF00FF if parts are missing)`);
}
