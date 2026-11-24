# Pipeline details

## Script shape (45 s example, ~115 words)
```
HOOK (0–3 s)   one sentence with the payoff: "Three reasons your houseplants keep dying — and none of them is you."
BEAT 1 (3–13)  the first fact + what it looks like on the desk
BEAT 2 (13–24)
BEAT 3 (24–36)
CLOSE (36–45)  the takeaway, then the CTA: "Comment PLANT and I'll send you the checklist."
```
Write for the ear: short sentences, numbers as words when spoken ("ninety percent"), no lists read aloud. `vo.txt` = the spoken text only.

## Shot list pattern (one station per beat)
```
S2 · beat 1 "overwatering" · x 2600 y 1200
  card 02 OVERWATERING lands on "overwatering"
  cutout watering_can.png lands on "water", slides from the right
  print root_rot.jpg (polaroid, caption "root rot") on "rot"
  marker ring around the print on "this"
  hand "once a week" on "week"
```
Every beat: one anchor object + at most 3 moving things. The overview station (`zoom 0.3`, no items) is a free beat to breathe. The CTA station: a label or folder + the stamp with the keyword.

## Image prompts
Cut-outs (objects that get a paper edge): "A single <object>, on a solid flat pure magenta background (#FF00FF) that fills the whole image edge to edge, soft even studio light, no shadow on the background, whole object visible with generous margin, no text, no watermark, photorealistic." Then `node scripts/cutout.mjs` (chroma key). Avoid magenta/pink objects; for those use a solid green (#00FF00) background and pass `--similarity` after editing the key colour in cutout.mjs.
Prints (photos that keep their background): "Photo of <scene>, natural light, 4:3, no text."
Characters: "paper cut-out style photo of <person>, full body, plain background" — keep people generic; no real public figures.
Name files by their content (`watering_can.png`), 1024 px or more. Generate into `<name>_raw.png`; cut-outs become `<name>.png` via `remove-background`, prints are copied to `<name>.png` (or `.jpg`) as they are. Only reference the non-`_raw` files from `scenes.js` — `_raw` files are intermediates and are git-ignored. Reject: extra objects, text baked in, cropped edges, a shadow that reads as a second object.

## Voice
ElevenLabs (`ELEVENLABS_API_KEY`): `node scripts/tts.mjs vo.txt . --voice <id>` (default voice "Chris", model eleven_v3; `[pause]`-style tags are not used — write the pauses as punctuation).
Local: Kokoro via `hyperframes tts`, voices `am_adam` (default), `am_michael`, `bm_george`, `af_heart`, `bf_emma`. Expect a plainer read; it still times perfectly.
`tts.mjs` trims the leading silence and pads 0.3 s at the end; `words.mjs` times are relative to `voice.wav`, which starts at film time 0.

## Timing items to words
`words.js` prints every word with its start. Put `at` of the illustrating item ON the word (not before). Camera: the next station's `t` ≈ first word of the next beat − 0.2 s; its flight (0.9 s) then starts during the last words of the previous beat, which feels like an editor who knows what's coming.

## Changes after delivery
Script change → re-record the voice (steps 5–9, ~3 min). Visual change → edit `scenes.js`, apply, snapshot, render. Keep versions: `renders/<slug>_v2.mp4`, never overwrite.
