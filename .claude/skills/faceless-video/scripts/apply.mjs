// Stamp the film duration from scenes.js into index.html (root + audio data-duration).
// Usage: node scripts/apply.mjs [projectDir]
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const dir = resolve(process.argv[2] || ".");
globalThis.window = globalThis;
await import(pathToFileURL(resolve(dir, "scenes.js")).href);
const F = globalThis.FILM;
if (!F || !(F.duration > 0)) { console.error("scenes.js must set window.FILM = { duration, stations: [...] }"); process.exit(1); }
const dur = Number(F.duration).toFixed(2);
const p = resolve(dir, "index.html");
let s = readFileSync(p, "utf8");
s = s.replace(/(<div id="root"[^>]*data-duration=")[^"]*(")/, `$1${dur}$2`);
s = s.replace(/(<audio id="mix"[^>]*data-duration=")[^"]*(")/, `$1${dur}$2`);
writeFileSync(p, s);
const bad = [];
(F.stations || []).forEach((st, i) => { if (!(st.x >= 0 && st.y >= 0)) bad.push(`station ${i}: x/y missing`); if (st.t == null) bad.push(`station ${i}: t missing`);
  (st.items || []).forEach((it, j) => { if (!it.type) bad.push(`station ${i} item ${j}: type missing`); if (it.at != null && it.at > F.duration) bad.push(`station ${i} item ${j}: at ${it.at} is after the end`); }); });
if (bad.length) { console.error(bad.join("\n")); process.exit(1); }
console.log(`index.html: duration ${dur} s, ${F.stations.length} stations, ${F.stations.reduce((n, s) => n + (s.items || []).length, 0)} items`);
