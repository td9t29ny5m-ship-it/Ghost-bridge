# The look: an editing desk

One real surface — warm cream paper with fibre texture, soft light pools, a key light from the top left, film grain. Everything in the video is a thing lying on that desk: index cards, photo prints, paper cut-outs with a white sticker edge, a typewriter page, sticky notes, one orange marker, one rubber stamp. The camera is a hand-held crane over the desk: it flies between stations, lands, pushes in slowly, and lifts a little on long flights. Captions sit low, in a cream box, the spoken word turns the accent colour.

## Five rules (what makes AI video look fake, and the fix)
1. **Kill the void.** No glowing shapes floating in black. Everything on a real surface with a real shadow.
2. **One accent colour.** Orange marker, orange stamp, orange caption word. Neon green + pink + blue at once looks like a screensaver.
3. **One thing moves at a time.** A card lands, THEN the marker draws, THEN the note arrives. When everything flies in together nothing feels designed.
4. **Real objects, used the real way.** A laptop stands open on its hinge, a waveform runs left to right, a mug is seen from above. If a generated image uses an object wrongly, regenerate it.
5. **Real sounds.** Paper, pen, a woody click, an airy whoosh on the camera flight. No lasers, no glitches, no risers under every word.

## Motion vocabulary
- `land`: drop 24 px + scale 1.12→1 + settle the tilt, 0.34 s, eased out. Cards, prints, notes, labels, cut-outs.
- `slide`: from off-screen with a tilt, 0.5 s. Cut-outs that "arrive".
- `draw`: marker and handwriting revealed left→right, 0.45 s.
- `slam`: the stamp, 0.08 s, scale 1.22→1. Once per film, on the CTA.
- `pop`: scale 0.6→1 with a small bounce. Headings, the paper plane.
- Camera: ease in-out flights of 0.8–1.0 s, a 2–3 % push-in while holding, a crane lift of 0.1–0.2 on flights longer than ~1500 desk px.

## Typography (bundled, all SIL OFL)
Headings and stamp: Montserrat ExtraBold. Captions and tags: Space Grotesk Bold. Handwriting: Caveat Bold. Typewriter/mono: JetBrains Mono.

## Reels safe zones (1080×1920)
Top 220 px (title/UI), right 150 px (like/comment/share column), bottom 420 px (caption + CTA bar): nothing the viewer must read lives there. The engine already keeps captions above the bottom band and off the right column.
