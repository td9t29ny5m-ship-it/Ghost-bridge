# Review checklist (second pass, before delivery)

Look at the contact sheet (`scripts/sheet.mjs`, 1 frame/s) and at 3–4 full-size frames. Answer each line with a yes; every "no" is a fix, not a note.

**Read**
- Every caption readable, no word broken, no caption covering an object the voice is talking about.
- Every card title, note, handwritten word and stamp fully visible (no clipped glyphs, nothing cut by the frame edge).
- Nothing important in the top 220 px, the right 150 px or the bottom 420 px.

**Look**
- Each frame has one clear subject; no half-empty frames for more than ~1.5 s; no two things moving at once.
- Items don't overlap unintentionally; marker strokes sit on what they mark.
- Cut-outs look like real objects with a paper edge; no image with baked-in text, extra objects or a wrong shape.
- One accent colour. Camera flights land where the next object is, not in empty desk.

**Listen**
- Voice starts within 0.5 s; no misread numbers or names (fix via `words.fix.json` is for captions only — a misread VOICE means re-recording with the word respelled).
- Music, if any, sits under the voice; SFX never louder than the voice.
- Loudness −14 LUFS (`ffmpeg -i mix.wav -af ebur128 -f null -`), true peak ≤ −1 dB.

**Story**
- The hook states the payoff in the first 3 s. Each beat has one idea. The close/CTA is the last thing on screen for ≥ 1.5 s.
- Length within ±10 % of the brief.

Deliver `renders/<slug>_vN.mp4` and a `_phone.mp4` (H.264, crf 22, maxrate 3M, AAC 160k) for sending.
