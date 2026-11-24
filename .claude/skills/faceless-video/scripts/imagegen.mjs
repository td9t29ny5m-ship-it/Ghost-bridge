// Generate one image with the Codex CLI's built-in image tool (ChatGPT subscription, no separate API key).
// Usage: node scripts/imagegen.mjs out.png "prompt" [--model gpt-5.6-sol] [--ref ref.png]
// No Codex? Make the image with any generator (ChatGPT, Midjourney, ...) using the same prompt and save it under assets/img/.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync, readdirSync } from "node:fs";
import { resolve, dirname, basename, join } from "node:path";

const args = process.argv.slice(2); const out = resolve(args[0] || ""); const prompt = args[1];
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
if (!args[0] || !prompt) { console.error('usage: node scripts/imagegen.mjs out.png "prompt" [--model m] [--ref ref.png]'); process.exit(1); }
const codex = spawnSync(process.platform === "win32" ? "where" : "which", ["codex"]).status === 0;
if (!codex) { console.error("codex CLI not found. Install it (npm i -g @openai/codex) and sign in, or generate the image by hand with the prompt above."); process.exit(2); }
mkdirSync(dirname(out), { recursive: true });
const work = join(dirname(out), ".imagegen_tmp"); mkdirSync(work, { recursive: true });
const name = basename(out); const target = join(work, name); if (existsSync(target)) rmSync(target);
const ref = opt("--ref", null);
const instr = `Use your built-in image generation tool (not code, not an external API) to generate exactly ONE image for this prompt. ${ref ? "Use the attached image as the reference described in the prompt. " : ""}Then copy the generated PNG into the current directory as ${name} and reply only with its path.\n\nPROMPT:\n${prompt}`;
const cmd = ["exec", "--skip-git-repo-check", "-s", "workspace-write", "-m", opt("--model", "gpt-5.6-sol"), "-c", "model_reasoning_effort=low", ...(ref ? ["-i", resolve(ref)] : [])];
const t0 = Date.now();
const r = spawnSync("codex", cmd, { cwd: work, input: instr, encoding: "utf8", shell: process.platform === "win32", timeout: 600000 });
let made = existsSync(target) ? target : readdirSync(work).filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f)).map((f) => join(work, f)).sort((a, b) => 0)[0];
if (!made) { console.error("no image produced\n", (r.stdout || "").slice(-600), (r.stderr || "").slice(-400)); process.exit(1); }
renameSync(made, out);
console.log(`OK ${out} ${Math.round((Date.now() - t0) / 1000)}s`);
