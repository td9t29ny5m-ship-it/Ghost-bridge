# Channel format — "how your brain works" shorts

One niche (psychology / how your brain works), one look, one voice, so every episode feels like the same channel.
Reference episode: `videos/zeigarnik/` (Ep. 1, "Don't watch this to the end").

## Fixed identity (don't change between episodes)
- **Look:** the faceless-video "editing desk" (cream paper, cut-outs, cards, marker), accent `#ec5626`.
- **Voice:** Kokoro `am_michael` at speed **1.1** (`npx --yes hyperframes@0.8.157 tts vo.txt -o <wav> -v am_michael -s 1.1`).
- **Sound:** `python3 videos/_series/tools/gen_audio.py <project> <seconds>`: the same lo-fi bed + foley every time, `musicGain: -20`.
- **Length:** 40–55 s. **Ending:** loops into the opening line.

## Retention rules (the script)
1. **Hook in the first second.** The first line is a command, a contradiction or a shocking claim ("Don't watch this to the end."). Hook text is ON SCREEN at frame 0. No intros, no "hey guys".
2. **Second line raises stakes** (why you should care, ≤ 3 s).
3. **Concrete story beat by 5 s:** a place, a year, a person, an object.
4. **Open loop at the midpoint:** "But here's the twist nobody tells you." Pay it off within ~5 s.
5. **Short sentences**, 2.8–3.0 words/s. One idea per sentence. Fragments are fine ("Two minutes. Then stop.").
6. **Something the viewer can do** in the last 10 s.
7. **Loop line:** the last sentence leads back into the first, so the replay feels seamless.
8. **Be accurate.** 2–5 sources in `script.md`. If the famous version of a fact is wrong, that IS the twist.

## Visual rules (scenes.js)
- New station every **3–5 s**, flights 0.7–0.8 s. Something new lands every **≤ 1.5 s**.
- Every item lands **on its word**, and settles **before** the next camera flight starts (flight start = next `t − flight`).
- Items in frame y ≈ 230–1200; captions own the band around y 1450.
- Last station = the first station's coordinates (loop). Add one small new joke item there ("...oops.").
- Snapshot at rest points (just before each flight), not at station times.

## Pipeline notes for this environment
- Images: no image generator here. Use Twemoji SVGs (CC-BY 4.0 — credit in the post) rendered with `tools/render_svg.cjs`: `npm pack @twemoji/svg`, then `node tools/render_svg.cjs <svgDir> assets/img '{"name":"codepoint"}'`.
- Captions: huggingface is blocked, so `hyperframes transcribe` can't run. Use `tools/align.mjs` (aligns the known script to pauses found by `ffmpeg silencedetect`): `node tools/align.mjs vo.txt transcript.json '<segments json>'`, then `words.mjs`. Use `words.fix.json` to show years as digits ("twenty twenty-five," → "2025,").
- GSAP: jsdelivr is blocked. Copy `assets/vendor/gsap.min.js` from an earlier episode and point `index.html` at it.

## Episode ideas (same niche, each has a built-in hook)
1. ✅ Zeigarnik effect — "Don't watch this to the end."
2. Doorway effect — "Walking through a door just deleted your memory."
3. Spotlight effect — "Nobody noticed. I promise. Here's the study."
4. Baader-Meinhof (frequency illusion) — "You're about to see this everywhere."
5. IKEA effect — "Why you overvalue things you built badly."
6. Peak-end rule — "Your brain only remembers two moments of anything."
7. Mere exposure effect — "You'll like this video more the second time."
8. Hedonic adaptation — "Why the new phone stops feeling new in a week."
9. The "Google effect" (digital amnesia) — "You forgot this because you can search it."
10. Choice overload (jam study and its replication problems) — "The famous jam study has a twist."
