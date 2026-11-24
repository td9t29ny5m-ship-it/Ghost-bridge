// Mix voice + music + sound effects into assets/audio/mix.wav with ffmpeg (no Python needed).
//   voice: assets/audio/voice.wav (required)   music: assets/audio/music.* (optional, ducked under the voice)
//   sfx:   assets/sfx/{whoosh,thud,marker,stamp,pop,slide,click}.wav (optional) placed from scenes.js:
//          whoosh on every camera flight, thud when a card/print lands, marker on a draw, stamp on a slam, pop on a pop, slide on a slide.
// Usage: node scripts/mix.mjs [projectDir]   (needs ffmpeg on PATH)
import { existsSync, readdirSync, mkdirSync, renameSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const dir = resolve(process.argv[2] || ".");
globalThis.window = globalThis;
await import(pathToFileURL(resolve(dir, "scenes.js")).href);
const F = globalThis.FILM; const DUR = F.duration;
const A = join(dir, "assets", "audio"); mkdirSync(A, { recursive: true });
const voice = join(A, "voice.wav");
if (!existsSync(voice)) { console.error("assets/audio/voice.wav missing - make the voice first"); process.exit(1); }
const music = readdirSync(A).find((f) => /^music\.(wav|mp3|m4a|aac|ogg|flac)$/i.test(f));
const sfxDir = join(dir, "assets", "sfx");
const sfx = (n) => { const p = join(sfxDir, n + ".wav"); return existsSync(p) ? p : null; };

// ---- sound events from the scenes (same rules the engine animates with)
const SH = F.shots.slice().sort((a, b) => a.t - b.t);
const ev = []; // [time, name, gainDb]
SH.forEach((s, i) => { if (i > 0) ev.push([s.t - 0.12, "whoosh", -13]); });
SH.forEach((s) => (s.over || []).forEach((o) => { const t = o.at ?? s.t; ev.push([t, o.type === "badge" ? "thud" : "pop", o.type === "badge" ? -12 : -16]); }));
const placed = ev.filter(([t, n]) => sfx(n) && t >= 0 && t < DUR);

// ---- ffmpeg graph: voice (hp + light compression) | music (ducked by the voice with sidechaincompress) | sfx delayed
const inputs = ["-i", voice]; let g = "";
g += `[0:a]aformat=sample_rates=48000:channel_layouts=stereo,highpass=f=80,acompressor=threshold=0.1:ratio=3:attack=5:release=80:makeup=2,apad=whole_dur=${DUR}[v];`;
let idx = 1; const mixIns = ["[v]"];
if (music) {
  inputs.push("-stream_loop", "-1", "-i", join(A, music));
  const mg = F.musicGain ?? -16;
  g += `[${idx}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${DUR},volume=${mg}dB,afade=t=in:d=0.8,afade=t=out:st=${Math.max(0, DUR - 1.8)}:d=1.8[m0];`;
  g += `[0:a]aformat=sample_rates=48000:channel_layouts=stereo,apad=whole_dur=${DUR}[sc];[m0][sc]sidechaincompress=threshold=0.015:ratio=6:attack=15:release=450:makeup=1[m];`;
  mixIns.push("[m]"); idx++;
}
placed.forEach(([t, n, db], k) => { inputs.push("-i", sfx(n)); g += `[${idx}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${db}dB,adelay=${Math.round(t * 1000)}|${Math.round(t * 1000)},apad=whole_dur=${DUR}[s${k}];`; mixIns.push(`[s${k}]`); idx++; });
g += `${mixIns.join("")}amix=inputs=${mixIns.length}:normalize=0:duration=first,atrim=0:${DUR},loudnorm=I=-14:TP=-1.0:LRA=9[out]`;
const out = join(A, "mix.wav");
const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", g, "-map", "[out]", "-ar", "48000", "-ac", "2", out], { stdio: "inherit" });
if (r.status !== 0) { console.error("ffmpeg failed (is ffmpeg installed and on PATH?)"); process.exit(1); }
// second pass: measure and trim to exactly -14 LUFS (a single loudnorm pass lands within ~1 dB)
const meas = spawnSync("ffmpeg", ["-i", out, "-af", "ebur128=framelog=quiet", "-f", "null", "-"], { encoding: "utf8" });
const I = parseFloat(((meas.stderr || "").match(/I:\s*(-?[\d.]+) LUFS/g) || []).pop()?.match(/(-?[\d.]+)/)?.[1] ?? "NaN");
if (Number.isFinite(I) && Math.abs(I + 14) > 0.2) {
  const tmp = out.replace(/\.wav$/, "_tmp.wav");
  spawnSync("ffmpeg", ["-v", "error", "-y", "-i", out, "-af", `volume=${(-14 - I).toFixed(2)}dB,alimiter=limit=0.89:level=false`, "-ar", "48000", tmp], { stdio: "inherit" });
  renameSync(tmp, out);
}
console.log(`mix.wav: ${DUR}s, voice${music ? " + music (" + music + ", ducked)" : ""}${placed.length ? ` + ${placed.length} sfx` : ""}${!music ? " - no music file found (assets/audio/music.mp3)" : ""}`);
if (!readdirSync(sfxDir, { withFileTypes: true }).length) console.log("no sfx folder: add whoosh/thud/marker/stamp/pop.wav to assets/sfx for foley");
