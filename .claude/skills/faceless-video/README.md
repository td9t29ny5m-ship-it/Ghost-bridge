# faceless-video — a Claude Code skill that makes the whole video

**One message in. A finished vertical video out.** Research → script → paper cut-out images → voice-over → animation written as code → render → a second-pass review. No camera, no editor, no crew.

This is the workflow behind the reels on [@zerocrew.ai](https://instagram.com/zerocrew.ai) and the 9-minute YouTube videos at [TaxReality](https://www.youtube.com/@TaxRealityUS), packed into one skill file for Claude Code.

![Example: "Three reasons your houseplant is dying", made by the skill from one line](examples/houseplants_opus/preview.gif)

Example made by the skill from one line (40 s, ElevenLabs voice + Epidemic Sound music and foley): **[watch the full video](examples/houseplants_opus/renders/houseplants_opus_v2_phone.mp4)** — with the [script and sources](examples/houseplants_opus/script.md) and the [`scenes.js`](examples/houseplants_opus/scenes.js) that describes the film.

## What it does
You type one line. Claude:
1. **Researches** the topic (3–5 sources) and writes a 30–90 s script with a hook, 3–5 beats and a close.
2. **Draws every object** — image prompts, generated through your Codex CLI (or by you with any image tool) on a magenta background, then cut out like paper with a chroma key.
3. **Reads the script** — ElevenLabs if you have a key, otherwise a free local voice.
4. **Writes the animation as code** — a HyperFrames composition in the "editing desk" style: one paper desk, a camera that flies between stations, index cards, marker strokes, a rubber stamp, word-by-word captions. Then renders it (1080×1920, 30 fps).
5. **Reviews its own work** — a second pass over a contact sheet against a checklist, fixes, re-renders.

Then you watch it and give notes. Every note is a 2-minute re-render.

## Install
Open Claude Code (the Code tab in the Claude desktop app, or `claude` in a terminal) and paste:

```
Install this skill for me: https://github.com/zerocrew-ai/faceless-video-skill
```

Manual: clone this repo into `~/.claude/skills/faceless-video` (Mac/Linux) or `%USERPROFILE%\.claude\skills\faceless-video` (Windows).

## What you need
- **Claude Code** (any plan).
- **Node.js 22+** and **ffmpeg** on your PATH. That's enough to render.
- Optional, for a premium voice: an **ElevenLabs** key in `ELEVENLABS_API_KEY`. Without it the skill uses a free local voice (`pip install kokoro-onnx soundfile`, Python 3.10+).
- Optional, for images made for you: the **Codex CLI** signed in (`npm i -g @openai/codex`). Without it Claude writes the prompts and you drop the images in.
- Word-timed captions run on a small local model that HyperFrames installs on first use (~650 MB, one time).

Mac, Windows and Linux. Built and tested on Windows 11.

## Run it
```
/faceless-video Three reasons your houseplants keep dying
```
or just say "make a faceless video about X". Add what you want: `45 seconds, for first-time plant owners, end with "Comment PLANT"`. The first run checks your tools and tells you the exact fix for anything missing.

You get a project folder:
```
videos/houseplants/
  script.md        the script with sources
  vo.txt           the spoken text
  shots.md         the shot list (what's on the desk, which word it moves on)
  images.md        the image prompts
  scenes.js        the film: stations on the desk and every item's timing   ← edit this to change anything
  words.js         word timings of the voice
  assets/          images, voice, mix, fonts, marker strokes
  renders/         houseplants_v1.mp4, v2 ... and a _phone.mp4 for sending
```

## Free setup vs. what we use
The skill runs end to end with free tools, and it sounds like it: a plain local voice, no music, no foley. Our own reels use three paid things on top — the same skill, different tools:

| | Free setup | What we use |
|---|---|---|
| Voice | Kokoro, local | **ElevenLabs** (`ELEVENLABS_API_KEY`) |
| Music + sound effects | your own files, placed automatically | **Epidemic Sound** — whooshes on camera flights, paper, pen, stamp |
| Images | any generator, by hand | **Codex CLI** (ChatGPT image model), generated for you |

The example in `examples/` was made with the right-hand column. With the free column the same `scenes.js` renders the same picture; only the voice and the sound get plainer. If you have an Epidemic Sound subscription, connect its MCP in Claude Code and the skill picks the music and foley itself.

## Change things
Talk to it like an editor: *"the hook is too slow, start on the plant"*, *"make the stamp say COMMENT PLANT"*, *"swap the watering can for a spray bottle"*. Script changes re-record the voice (~3 min); visual changes are a `scenes.js` edit and a 2-minute render. Versions are kept, nothing is overwritten.

## The look
One real desk. Everything in the video is a thing lying on it. One accent colour. One thing moves at a time. Real objects used the real way. Real sounds. The five rules that keep AI video from looking like AI video are in [`references/style.md`](references/style.md); the film format is in [`references/scenes.md`](references/scenes.md).

## FAQ
**Does it make long videos?** The skill is tuned for 30–90 s vertical explainers. The same engine scales to longer, landscape videos — that's how the TaxReality videos are made — but that needs more hands-on direction than one prompt.
**Is the output mine?** Yes. Code here is MIT; fonts are SIL OFL; the textures, marker strokes and desk props are CC0 (made by us). Images you generate and voices you record follow your own tool's terms.
**Where do music and sound effects come from?** Bring your own royalty-free files (`assets/audio/music.mp3`, `assets/sfx/*.wav`); the mixer ducks the music under the voice and places the foley automatically. We use Epidemic Sound, which we can't redistribute.
**Why HyperFrames?** It renders HTML + GSAP into video deterministically, has a linter, snapshots, local captions, TTS and background removal, and it's open source. [hyperframes.heygen.com](https://hyperframes.heygen.com)

## Made by Zero Crew
Faceless videos made entirely with Claude and Codex. New skill with every reel: [@zerocrew.ai](https://instagram.com/zerocrew.ai)
