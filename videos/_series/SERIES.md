# Channel format — "Why does that happen?" shorts (for every age)

One niche: **everyday "why does that happen?" questions about your brain and body**, things an 8-year-old and an 80-year-old both
experience and both get curious about. One look, one voice, so every episode feels like the same channel.

## All-ages rules (check every script)
- **The topic is something everyone has felt:** yawning, hiccups, brain freeze, déjà vu, songs stuck in your head. No dating, money, politics, horror, gore or crude jokes.
- **Plain words:** a 10-year-old must understand every sentence. No jargon ("meta-analysis" → "100 years of studies"; "cognitive" → "your brain"). Name the scientist once at most.
- **Kind tone:** curious and playful, never mocking. Safe advice only (nothing a kid shouldn't try).
- **Wonder, then a twist:** every episode ends with something viewers want to tell a friend or try right now (good for shares and comments).
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

## Episode ideas (all ages, each has a built-in hook)
1. ✅ Unfinished things stick in your head — "Don't watch this to the end." (Zeigarnik)
2. Why yawns are contagious — "You'll yawn before this video ends."
3. Why you can't tickle yourself — "Try it right now. It won't work. Here's why."
4. Brain freeze — "Your brain can't even feel pain. So why does ice cream hurt?"
5. Songs stuck in your head — "This video will get rid of your earworm." (chewing gum study)
6. Why time speeds up as you get older — "This summer felt shorter than when you were 8. You're not imagining it."
7. Déjà vu — "You've seen this video before. Haven't you?"
8. Walking through a door makes you forget — "The doorway is deleting your memory."
9. Why we have hiccups — "Your hiccups might be left over from tadpoles."
10. Goosebumps — "Your body is trying to puff up fur you don't have."
11. Why onions make you cry — "The onion is fighting back."
12. Why your own voice sounds weird on recordings — "That's what you really sound like. Sorry."
