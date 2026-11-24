// Turn a word-level transcript (hyperframes transcribe --json, whisper JSON, or {words:[...]}) into words.js for the engine.
// Usage: node scripts/words.mjs transcript.json [projectDir] [--offset 0.0]
// Optional fix-up: words.fix.json = {"heard phrase": "correct phrase", ...} replaces misheard words (timings kept).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const src = args[0]; const dir = resolve(args.includes("--dir") ? args[args.indexOf("--dir") + 1] : (args[1] && !args[1].startsWith("--") ? args[1] : "."));
const off = args.includes("--offset") ? parseFloat(args[args.indexOf("--offset") + 1]) : 0;
if (!src) { console.error("usage: node scripts/words.mjs transcript.json [projectDir] [--offset s]"); process.exit(1); }
let j = JSON.parse(readFileSync(src, "utf8"));
if (j.transcriptPath && !j.words && !j.segments) j = JSON.parse(readFileSync(j.transcriptPath, "utf8")); // `hyperframes transcribe --json` prints metadata; the words are in transcriptPath
let words = [];
const take = (w) => { const text = (w.word ?? w.text ?? w.w ?? "").trim(); const s = w.start ?? w.s ?? w.from; const e = w.end ?? w.e ?? w.to; if (text && s != null && e != null) words.push({ w: text, s: +s + off, e: +e + off }); };
if (Array.isArray(j)) j.forEach(take);
else if (j.words) j.words.forEach(take);
else if (j.segments) j.segments.forEach((sg) => (sg.words || []).forEach(take));
else if (j.transcript?.words) j.transcript.words.forEach(take);
else if (j.result?.words) j.result.words.forEach(take);
if (!words.length) { console.error("no words found in", src, "- keys:", Object.keys(j)); process.exit(1); }
// fix-ups: replace misheard phrases, keep the timing of the first/last word
const fixPath = resolve(dir, "words.fix.json");
if (existsSync(fixPath)) {
  const fix = JSON.parse(readFileSync(fixPath, "utf8"));
  for (const [bad, good] of Object.entries(fix)) {
    const b = bad.toLowerCase().split(/\s+/), g = good.split(/\s+/);
    for (let i = 0; i + b.length <= words.length; i++) {
      if (b.every((x, k) => words[i + k].w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "") === x.replace(/[^\p{L}\p{N}']/gu, ""))) {
        const s = words[i].s, e = words[i + b.length - 1].e; const step = (e - s) / g.length;
        const rep = g.map((w, k) => ({ w, s: +(s + k * step).toFixed(3), e: +(s + (k + 1) * step).toFixed(3) }));
        words.splice(i, b.length, ...rep); i += g.length - 1;
      }
    }
  }
}
writeFileSync(resolve(dir, "words.js"), `window.WORDS = ${JSON.stringify(words.map((w) => ({ w: w.w, s: +w.s.toFixed(3), e: +w.e.toFixed(3) })))};\n`);
console.log(`words.js: ${words.length} words, ${words[0].s.toFixed(2)} → ${words[words.length - 1].e.toFixed(2)} s`);
console.log(words.map((w) => `${w.w}@${w.s.toFixed(2)}`).join(" "));
