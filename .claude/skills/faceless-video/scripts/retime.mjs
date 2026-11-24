// Re-record the voice, keep the film: move every station `t` and item `at` in scenes.js from the old word timings to the new ones.
// Usage: node scripts/retime.mjs old_words.js words.js [projectDir]    (writes scenes.js in place, keeps a scenes.prev.js)
// Each time is mapped by the word it sat on (the last old word starting at or before it, matched to the same word in the new take).
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";

const [oldF, newF, dirArg] = process.argv.slice(2); const dir = resolve(dirArg || ".");
if (!oldF || !newF) { console.error("usage: node scripts/retime.mjs old_words.js words.js [projectDir]"); process.exit(1); }
const load = (f) => { const g = {}; new Function("window", readFileSync(resolve(dir, f), "utf8"))(g); return g.WORDS; };
const A = load(oldF), B = load(newF);
const norm = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
// align old→new word indices by text (greedy, in order)
const map = new Array(A.length).fill(-1); let j = 0;
for (let i = 0; i < A.length; i++) { for (let k = j; k < Math.min(B.length, j + 6); k++) if (norm(B[k].w) === norm(A[i].w)) { map[i] = k; j = k + 1; break; } }
let last = -1; for (let i = 0; i < A.length; i++) { if (map[i] < 0) map[i] = Math.min(B.length - 1, last + 1); last = map[i]; }
const endA = A[A.length - 1].e, endB = B[B.length - 1].e;
function remap(t) {
  if (t <= A[0].s) return t; if (t >= endA) return endB + (t - endA);
  let i = 0; while (i + 1 < A.length && A[i + 1].s <= t) i++;            // word the time sits on
  const a0 = A[i].s, a1 = i + 1 < A.length ? A[i + 1].s : endA, b0 = B[map[i]].s, b1 = map[i] + 1 < B.length ? B[map[i] + 1].s : endB;
  const f = a1 > a0 ? (t - a0) / (a1 - a0) : 0; return +(b0 + f * (b1 - b0)).toFixed(2);
}
const sp = resolve(dir, "scenes.js"); copyFileSync(sp, resolve(dir, "scenes.prev.js"));
let s = readFileSync(sp, "utf8"); let n = 0;
s = s.replace(/\b(t|at|until):\s*(-?\d+(?:\.\d+)?)/g, (m, k, v) => { n++; return `${k}: ${remap(parseFloat(v))}`; });
s = s.replace(/\[\s*(\d+(?:\.\d+)?)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\]/g, (m, t, x, y) => `[${remap(parseFloat(t))}, ${x}, ${y}]`); // cursor paths
s = s.replace(/clicks:\s*\[([^\]]*)\]/g, (m, inner) => `clicks: [${inner.split(",").map((v) => remap(parseFloat(v))).join(", ")}]`);
s = s.replace(/duration:\s*(\d+(?:\.\d+)?)/, () => `duration: ${(endB + 1.6).toFixed(1)}`);
writeFileSync(sp, s);
console.log(`retimed ${n} times: voice ${endA.toFixed(2)} s → ${endB.toFixed(2)} s, duration ${(endB + 1.6).toFixed(1)} s (old scenes kept as scenes.prev.js)`);
