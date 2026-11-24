// Voice-over for the film. ElevenLabs when ELEVENLABS_API_KEY is set, otherwise the free local voice (hyperframes tts, Kokoro).
// Usage: node scripts/tts.mjs script.txt [projectDir] [--voice VOICE_ID|kokoro_voice] [--model eleven_v3]
// Output: assets/audio/voice.wav (48 kHz stereo). Kokoro needs: pip install kokoro-onnx soundfile (set HYPERFRAMES_PYTHON to that python if several).
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2); const src = args[0];
const dir = resolve(args[1] && !args[1].startsWith("--") ? args[1] : ".");
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
if (!src) { console.error("usage: node scripts/tts.mjs script.txt [projectDir] [--voice id]"); process.exit(1); }
const text = readFileSync(src, "utf8").replace(/^\s*#.*$/gm, "").replace(/\n{2,}/g, "\n\n").trim();
const A = join(dir, "assets", "audio"); mkdirSync(A, { recursive: true });
const out = join(A, "voice.wav"); const tmp = join(A, "voice_raw.audio");
const key = args.includes("--local") ? "" : process.env.ELEVENLABS_API_KEY;
let done = false;
if (key) {
  const voice = opt("--voice", "iP95p4xoKVk53GoZ742B"); const model = opt("--model", "eleven_v3");
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, { method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1.0 } }) });
    if (!r.ok) console.error(`ElevenLabs error ${r.status}: ${(await r.text()).slice(0, 200)}\n→ falling back to the free local voice (fix ELEVENLABS_API_KEY for the premium one)`);
    else { writeFileSync(tmp, Buffer.from(await r.arrayBuffer())); console.log("ElevenLabs voice", voice, model); done = true; }
  } catch (e) { console.error("ElevenLabs request failed:", e.message, "→ falling back to the free local voice"); }
}
if (!done) {
  const voice = key ? "am_adam" : opt("--voice", "am_adam");
  const txt = join(A, "vo_clean.txt"); writeFileSync(txt, text); // a file, so newlines and quotes survive the shell
  // one quoted command line: npx is a .cmd on Windows (needs a shell) and project paths may contain spaces
  const q = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
  const cmd = ["npx", "--yes", "hyperframes@0.8.157", "tts", q(txt), "-o", q(tmp.replace(/\.audio$/, ".wav")), "-v", voice].join(" "); // program name unquoted: cmd.exe mis-resolves a quoted npx.cmd
  const r = spawnSync(cmd, { stdio: "inherit", shell: true });
  if (r.status !== 0 || !existsSync(tmp.replace(/\.audio$/, ".wav"))) { console.error("local tts failed. Install: pip install kokoro-onnx soundfile  (or set ELEVENLABS_API_KEY)"); process.exit(1); }
  console.log("local Kokoro voice", voice, "(set ELEVENLABS_API_KEY for a premium voice)");
}
const inFile = existsSync(tmp) ? tmp : tmp.replace(/\.audio$/, ".wav");
const r2 = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", inFile, "-ar", "48000", "-ac", "2", "-af", "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.3,areverse,apad=pad_dur=0.3", out], { stdio: "inherit" });
if (r2.status !== 0) { console.error("ffmpeg failed"); process.exit(1); }
const dur = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]).stdout.toString().trim();
console.log(`assets/audio/voice.wav ${(+dur).toFixed(2)} s`);
