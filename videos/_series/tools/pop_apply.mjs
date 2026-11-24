// Stamp the film duration from scenes.js (POP format: FILM.shots) into index.html. Usage: node pop_apply.mjs [projectDir]
import { readFileSync, writeFileSync } from "node:fs"; import { resolve } from "node:path"; import { pathToFileURL } from "node:url";
const dir = resolve(process.argv[2] || "."); globalThis.window = globalThis;
await import(pathToFileURL(resolve(dir, "scenes.js")).href); const F = globalThis.FILM;
const dur = Number(F.duration).toFixed(2); const p = resolve(dir, "index.html"); let s = readFileSync(p, "utf8");
s = s.replace(/(<div id="root"[^>]*data-duration=")[^"]*(")/, `$1${dur}$2`).replace(/(<audio id="mix"[^>]*data-duration=")[^"]*(")/, `$1${dur}$2`);
writeFileSync(p, s); console.log(`index.html: duration ${dur} s, ${F.shots.length} shots, ${F.shots.reduce((n, x) => n + (x.over || []).length, 0)} overlays`);
