---
name: faceless-video
description: Make a complete faceless vertical video (30–90 s, 1080×1920) from one topic — research, script, paper cut-out images, voice-over, animation written as code (HyperFrames), render, and a second-pass review — in the "editing desk" style (one paper desk, camera flights, index cards, marker, rubber stamp, captions). Use when the user asks for a faceless video, a Reel/Short/TikTok explainer, or "make a video about X" with no footage.
---

# faceless-video

You are the whole crew: researcher, writer, art department, narrator, animator, editor and QA. The user gives a topic; you hand back a rendered MP4. Work in a project folder made from `template/` and keep every intermediate file in it, so the user can ask for changes and you re-render in minutes.

Read `references/pipeline.md` for the step details, `references/scenes.md` for the film format, `references/style.md` for the look, `references/qa.md` for the review. Everything below is the order of work.

## 0. Setup (first run only, ~2 min)
Check and report in one short list, with the exact fix for anything missing:
- Node 22+ (`node -v`), ffmpeg (`ffmpeg -version`), Claude Code (you are in it).
- Voice: `ELEVENLABS_API_KEY` set → premium voice; otherwise the free local voice: `pip install kokoro-onnx soundfile` (and `HYPERFRAMES_PYTHON=<that python>` if there are several).
- Captions: `npx --yes hyperframes@0.8.157 models install parakeet` (one-time, ~640 MB).
- Images: `codex` CLI signed in → images are generated for the user; otherwise you write the prompts and the user drops the images in.
Paths: `$SKILL` below means this skill's own folder (the one this SKILL.md is in; Claude Code shows it as the skill's base directory when the skill loads). Create the project: copy `$SKILL/template/` to `videos/<slug>/` in the user's working folder (slug from the topic). All commands below run inside that project folder; on Windows run them in Git Bash, or replace `$SKILL` with the full path in quotes.

## 1. Brief (ask at most once)
Topic. If not given: audience (who watches), length (default 45 s), the one accent colour (default orange `#ec5626`), an optional call to action ("Comment WORD for…"). Then stop asking and make the film; offer changes at the end.

## 2. Research and script → `script.md`
- 3–5 sources (web search); keep the facts you use with their source.
- Structure: hook (first 3 s states the payoff), 3–5 beats, a one-line close or CTA. ≤ 2.6 words/second of film (45 s ≈ 115 words). Short sentences; every sentence names something you can put on the desk.
- Write the voice-over as plain text into `vo.txt` (no headings, no stage directions). Show the user the script; in autonomous mode continue.

## 3. Shot list → `shots.md`
For each beat: one station on the desk — what lands (card, print, cut-out, page, note), what gets drawn (marker, handwriting), which word each thing moves on. Mark the overview beat and the CTA (stamp). Then the image list: for each cut-out or print, one prompt (`references/pipeline.md` has the prompt pattern) → `images.md`.

## 4. Images → `assets/img/`
- With codex: `node "$SKILL/scripts/imagegen.mjs" assets/img/<name>_raw.png "<prompt>"` per image.
- Without: give the user `images.md` and wait for the files.
- Cut-outs are generated on a solid magenta background (#FF00FF) and keyed: `node "$SKILL/scripts/cutout.mjs" assets/img/<name>_raw.png assets/img/<name>.png` (ffmpeg chroma key; other backgrounds fall back to the local AI remover, which is made for people and can eat parts of objects — look at every cut-out on a coloured background). Prints keep their background: copy `<name>_raw.png` to `<name>.png`. `scenes.js` only references the non-`_raw` files.
- Look at every image (Read the file). Wrong object, text in the image, odd shape → regenerate; never ship a bad one.

## 5. Voice and word timings
`node "$SKILL/scripts/tts.mjs" vo.txt .` → `assets/audio/voice.wav`.
`npx --yes hyperframes@0.8.157 transcribe assets/audio/voice.wav --json > transcript.json` then `node "$SKILL/scripts/words.mjs" transcript.json .` → `words.js`. Read the printed words: fix misheard brand names or numbers in `words.fix.json` (`{"heard": "correct"}`) and rerun. Film duration = last word end + 1.5 s.

## 6. The film → `scenes.js`
Write `window.FILM` (format: `references/scenes.md`) from the shot list, with every `at` on its word from `words.js`. Rules that make it look designed, not generated: one thing moves at a time (≥ 0.3 s apart), 2–5 s per station, stations laid out in 2D, one accent colour, nothing important in the top 220 px / right 150 px / bottom 420 px of the frame, the camera flight starts ~0.9 s before the next sentence, end on the CTA stamp or a wide overview of the whole desk.

## 7. Build and look
`node "$SKILL/scripts/apply.mjs" .` → `npx --yes hyperframes@0.8.157 lint` (0 errors) → `npx --yes hyperframes@0.8.157 snapshot --at <one time per beat>` and READ the frames. Fix overlaps, clipped text, empty frames, items outside the frame. Repeat until every beat reads.

## 8. Sound
Optional: `assets/audio/music.mp3` (any royalty-free track) and `assets/sfx/{whoosh,thud,marker,stamp,pop,slide}.wav` (names decide where they go: whoosh on every camera flight, thud when a card lands, marker on a draw, stamp on the slam). If Epidemic Sound MCP tools are available in this session, use them: search "airy whoosh short", "paper card drop thud", "marker pen stroke", "rubber stamp", "woody click", "paper slide", download one of each as the files above, and one calm instrumental bed (lo-fi / soft beat, no vocals) as `music.wav`; trim each SFX to its single hit with ffmpeg. Then `node "$SKILL/scripts/mix.mjs" .` → `assets/audio/mix.wav` (voice + ducked music + foley, −14 LUFS). Run it even without music or SFX — the engine plays `mix.wav`.
Re-recorded the voice after the film was timed? `node "$SKILL/scripts/retime.mjs" words_old.js words.js .` moves every time in `scenes.js` to the new take.

## 9. Render
`npx --yes hyperframes@0.8.157 render -o renders/<slug>_v1.mp4` (1080×1920, 30 fps). Then `node "$SKILL/scripts/sheet.mjs" renders/<slug>_v1.mp4` and READ the contact sheet.

## 10. Review (second pass) and deliver
Review the sheet against `references/qa.md` as if you had not made the film — if subagents are available, have one do it blind. Fix every finding, re-render as v2, never deliver with a known defect. Hand over: the MP4, a 5-line summary (topic, length, sources, what the user can change), and the offer "tell me what to change and I'll re-render" — every note is a scenes.js/script edit and a 2-minute render.
