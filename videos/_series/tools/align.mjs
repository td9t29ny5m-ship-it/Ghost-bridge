// Align known sentences to speech segments (from silencedetect); split each segment across words by letter weight.
import { readFileSync, writeFileSync } from "node:fs";
const [vo, out] = process.argv.slice(2, 4);
const sents = readFileSync(vo, "utf8").replace(/\n+/g, " ").match(/[^.!?]+[.!?]/g).map((s) => s.trim());
const segs = JSON.parse(process.argv[4]);
if (sents.length !== segs.length) throw new Error(`${sents.length} sentences vs ${segs.length} segments`);
const words = [];
sents.forEach((s, i) => { const ws = s.split(/\s+/); const wt = ws.map((w) => w.replace(/[^\p{L}\p{N}]/gu, "").length + 1.5 + (/[,]$/.test(w) ? 2 : 0));
  const tot = wt.reduce((a, b) => a + b, 0); let t = segs[i][0]; const d = segs[i][1] - segs[i][0];
  ws.forEach((w, k) => { const len = (wt[k] / tot) * d; words.push({ word: w, start: +t.toFixed(3), end: +(t + len - (/[,]$/.test(w) ? 2 / tot * d * 0.8 : 0)).toFixed(3) }); t += len; }); });
writeFileSync(out, JSON.stringify({ words }));
